import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { GitLabService } from '../gitlab/gitlab.service';
import { DiffProcessor } from '../llm/diff-processor';
import { IssueVerifier } from '../llm/issue-verifier.service';
import { ReviewStatus } from '@prisma/client';

/**
 * Review Processor
 * Bull queue processor for async code reviews with GitLab integration
 */
@Processor('review-queue')
@Injectable()
export class ReviewProcessor {
  private readonly logger = new Logger(ReviewProcessor.name);
  private readonly MAX_FILES = 50;

  constructor(
    private prisma: PrismaService,
    private llmService: LlmService,
    private gitlabService: GitLabService,
    private diffProcessor: DiffProcessor,
    private issueVerifier: IssueVerifier,
  ) {}

  /**
   * Process code review job
   * @param job Bull job with review data
   */
  @Process('process-review')
  async handleReview(job: Job<ReviewJobData>) {
    const { reviewId, projectId, mergeRequestIid } = job.data;

    this.logger.log(`Starting review ${reviewId} for MR ${mergeRequestIid}`);

    try {
      // Update status to processing
      await this.prisma.review.update({
        where: { id: reviewId },
        data: { status: ReviewStatus.PROCESSING },
      });

      // Check if LLM service is enabled
      if (!this.llmService.isEnabled()) {
        this.logger.warn('LLM service disabled - skipping review');
        await this.prisma.review.update({
          where: { id: reviewId },
          data: { status: ReviewStatus.SKIPPED },
        });
        return;
      }

      // Fetch MR diffs and details from GitLab
      const [diffs, mrDetails] = await Promise.all([
        this.gitlabService.getMRDiffs(projectId, mergeRequestIid),
        this.gitlabService.getMRDetails(projectId, mergeRequestIid),
      ]);

      if (!diffs || diffs.length === 0) {
        this.logger.log('No diffs found - skipping review');
        await this.prisma.review.update({
          where: { id: reviewId },
          data: {
            status: ReviewStatus.COMPLETED,
            reviewContent: { message: 'No changes to review' },
          },
        });
        return;
      }

      const allIssues: IssueWithFile[] = [];
      let totalScore = 100;
      let filesProcessed = 0;
      const skippedFiles = Math.max(0, diffs.length - this.MAX_FILES);

      // Limit to first 50 files to prevent token overflow
      const diffsToProcess = diffs.slice(0, this.MAX_FILES);

      // STEP 1: Collect all chunks with context
      const allChunksWithContext = [];
      for (const diff of diffsToProcess) {
        if (!diff.diff) continue;

        // Log raw diff structure for debugging
        this.logger.debug(`📋 Raw diff structure from GitLab:`);
        this.logger.debug(`   new_path: ${diff.new_path}`);
        this.logger.debug(`   old_path: ${diff.old_path}`);
        this.logger.debug(`   diff (first 200 chars): ${diff.diff.substring(0, 200)}`);

        // Extract changed lines with context (±10 lines for better LLM understanding)
        const chunks = this.diffProcessor.extractChangedLinesWithContext(
          diff.diff,
          10, // Context lines before/after changes
        );

        // Use the actual file paths from GitLab's diff object
        const actualFilePath = diff.new_path || diff.old_path;
        const oldFilePath = diff.old_path || diff.new_path;

        if (!actualFilePath) {
          this.logger.warn('Skipping diff with no file path');
          continue;
        }

        // Prepare chunks with context
        for (const chunk of chunks) {
          // Override chunk filename with actual GitLab path
          chunk.filename = actualFilePath;
          // Store old path for inline comments
          (chunk as any).oldPath = oldFilePath;

          // Fetch actual file content with ±10 lines around first changed line
          if (chunk.changedLines && chunk.changedLines.length > 0) {
            try {
              const fileContext = await this.gitlabService.getFileContentWithContext(
                projectId,
                actualFilePath, // Use actual file path from GitLab
                mrDetails.headSha || '',
                chunk.changedLines[0], // First changed line
                10, // ±10 lines
              );

              // Add file context to chunk
              (chunk as any).fileContext = fileContext;
            } catch (error) {
              this.logger.warn(`Could not fetch file context for ${actualFilePath}: ${error.message}`);
            }
          }

          allChunksWithContext.push(chunk);
        }
      }

      // STEP 2: Decide batching strategy
      const totalChangedLines = allChunksWithContext.reduce((sum, chunk) => sum + (chunk.additions + chunk.deletions), 0);
      const shouldBatch = totalChangedLines <= 500 && allChunksWithContext.length > 1;

      if (shouldBatch) {
        this.logger.log(`📦 BATCHING: ${allChunksWithContext.length} chunks (${totalChangedLines} lines) into single LLM call`);
      } else {
        this.logger.log(`📄 INDIVIDUAL: Processing ${allChunksWithContext.length} chunks separately (${totalChangedLines} lines total)`);
      }

      // STEP 3: Review chunks (batched or individual)
      if (shouldBatch) {
        // Batch all chunks into single LLM call
        const batchedResult = await this.llmService.reviewMultipleChunks(allChunksWithContext);
        filesProcessed = allChunksWithContext.length;

        this.logger.log(`📊 Found ${batchedResult.issues.length} total issues across ${filesProcessed} files`);

        // VERIFICATION PASS: Filter false positives
        for (const issue of batchedResult.issues) {
          const chunkForIssue = allChunksWithContext.find(c => c.filename === issue.file);
          if (!chunkForIssue) {
            this.logger.warn(`Could not find chunk for issue in ${issue.file}`);
            continue;
          }

          const verificationResult = await this.issueVerifier.verifyIssue(
            issue,
            {
              projectId,
              filePath: issue.file,
              sha: mrDetails.headSha || '',
              fileContext: (chunkForIssue as any).fileContext,
            },
          );

          if (verificationResult.isValid) {
            allIssues.push(issue);
            this.logger.log(`✓ Verified issue: ${issue.message.substring(0, 60)}...`);

            // Post inline comment for critical/high/medium issues
            if (['critical', 'high', 'medium'].includes(issue.severity)) {
              this.logger.log(`🔔 Posting inline comment for ${issue.severity} issue at line ${issue.line}`);

              let codeSnippet = '';
              if ((chunkForIssue as any).fileContext?.lines) {
                const ctx = (chunkForIssue as any).fileContext;
                const relativeLineIndex = issue.line - ctx.startLineNumber;
                if (relativeLineIndex >= 0 && relativeLineIndex < ctx.lines.length) {
                  codeSnippet = ctx.lines[relativeLineIndex];
                }
              }

              await this.gitlabService.postInlineComment(
                projectId,
                mergeRequestIid,
                {
                  filePath: issue.file,
                  oldPath: (chunkForIssue as any).oldPath || issue.file,
                  line: issue.line,
                  comment: this.formatInlineComment(issue, issue.file, codeSnippet, chunkForIssue.language),
                  baseSha: mrDetails.baseSha || '',
                  headSha: mrDetails.headSha || '',
                  startSha: mrDetails.startSha || '',
                },
              );
            }

            // Adjust score
            const severityImpact = { critical: 15, high: 10, medium: 5, low: 2 };
            totalScore -= severityImpact[issue.severity] || 2;
          } else {
            this.logger.warn(`✗ Filtered false positive [${verificationResult.confidence} confidence]: ${issue.message.substring(0, 60)}... (${verificationResult.reason})`);
          }
        }
      } else {
        // Process individually (existing flow)
        for (const chunk of allChunksWithContext) {

          const result = await this.llmService.reviewChangedLines(chunk);
          filesProcessed++;

          this.logger.log(`📊 Found ${result.issues.length} issues in ${chunk.filename}`);

          // VERIFICATION PASS: Filter false positives before posting
          const verifiedIssues = [];
          for (const issue of result.issues) {
            // Verify issue before adding to list
            const verificationResult = await this.issueVerifier.verifyIssue(
              issue,
              {
                projectId,
                filePath: chunk.filename,
                sha: mrDetails.headSha || '',
                fileContext: (chunk as any).fileContext,
              },
            );

            if (verificationResult.isValid) {
              verifiedIssues.push(issue);
              this.logger.log(`✓ Verified issue: ${issue.message.substring(0, 60)}...`);
            } else {
              this.logger.warn(`✗ Filtered false positive [${verificationResult.confidence} confidence]: ${issue.message.substring(0, 60)}... (${verificationResult.reason})`);
            }
          }

          this.logger.log(`📊 After verification: ${verifiedIssues.length}/${result.issues.length} issues are real`);

          for (const issue of verifiedIssues) {
            allIssues.push({
              ...issue,
              file: chunk.filename,
            });

            // Post inline comment for critical/high/medium issues
            if (['critical', 'high', 'medium'].includes(issue.severity)) {
              this.logger.log(`🔔 Posting inline comment for ${issue.severity} issue at line ${issue.line}`);

              // Get code snippet for the issue line
              let codeSnippet = '';
              if ((chunk as any).fileContext?.lines) {
                const ctx = (chunk as any).fileContext;
                const relativeLineIndex = issue.line - ctx.startLineNumber;
                if (relativeLineIndex >= 0 && relativeLineIndex < ctx.lines.length) {
                  codeSnippet = ctx.lines[relativeLineIndex];
                }
              }

              await this.gitlabService.postInlineComment(
                projectId,
                mergeRequestIid,
                {
                  filePath: chunk.filename,
                  oldPath: (chunk as any).oldPath || chunk.filename,
                  line: issue.line,
                  comment: this.formatInlineComment(issue, chunk.filename, codeSnippet, chunk.language),
                  baseSha: mrDetails.baseSha || '',
                  headSha: mrDetails.headSha || '',
                  startSha: mrDetails.startSha || '',
                },
              );
            } else {
              this.logger.debug(`ℹ️  Skipping inline comment for ${issue.severity} issue (only posting critical/high/medium)`);
            }
          }

            // Adjust score based on severity
            const severityImpact = {
              critical: 15,
              high: 10,
              medium: 5,
              low: 2,
            };

            verifiedIssues.forEach((issue) => {
              totalScore -= severityImpact[issue.severity] || 2;
            });
          }
        }

      // Post summary comment
      const summaryComment = this.formatSummaryComment(
        allIssues,
        totalScore,
        skippedFiles,
        filesProcessed,
      );

      await this.gitlabService.postMRComment(
        projectId,
        mergeRequestIid,
        summaryComment,
      );

      // Update review in database
      await this.prisma.review.update({
        where: { id: reviewId },
        data: {
          reviewContent: { issues: allIssues } as any,
          qualityScore: Math.max(0, totalScore),
          issuesFound: allIssues.length,
          suggestionsCount: allIssues.length,
          status: ReviewStatus.COMPLETED,
        },
      });

      this.logger.log(
        `✓ Review ${reviewId} completed: ${allIssues.length} issues, score ${totalScore}`,
      );
    } catch (error) {
      this.logger.error(`Failed to process review ${reviewId}: ${error.message}`);

      await this.prisma.review.update({
        where: { id: reviewId },
        data: { status: ReviewStatus.FAILED },
      });

      throw error;
    }
  }

  /**
   * Format inline comment with emoji and structured content
   * @param issue Code review issue
   * @param fileName File name for context
   * @param codeSnippet The actual code line with issue
   * @param language Programming language for syntax highlighting
   * @returns Formatted Markdown comment
   */
  private formatInlineComment(issue: any, fileName?: string, codeSnippet?: string, language?: string): string {
    const emoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
    }[issue.severity] || '🔵';

    const typeEmoji = {
      security: '🔒',
      performance: '⚡',
      logic: '🐛',
      style: '💅',
    }[issue.type] || '💡';

    const severityDescriptions = {
      critical: 'Must be fixed immediately - blocks deployment',
      high: 'Should be fixed before merge',
      medium: 'Should be addressed soon',
      low: 'Consider fixing when convenient',
    };

    let comment = `${emoji} **${issue.severity.toUpperCase()} SEVERITY: ${typeEmoji} ${issue.type.toUpperCase()} Issue**

${fileName ? `📄 **File:** \`${fileName}\`\n` : ''}📍 **Line:** ${issue.line}
⚠️ **Priority:** ${severityDescriptions[issue.severity] || 'Review recommended'}

---
`;

    // Add problematic code snippet if available
    if (codeSnippet && codeSnippet.trim()) {
      comment += `
### 📝 Problematic Code
\`\`\`${language || ''}
${codeSnippet.trim()}
\`\`\`

`;
    }

    comment += `### 🔍 Issue Description
${issue.message}

### 💡 Suggested Fix
\`\`\`${language || ''}
${issue.suggestion}
\`\`\`

### 📚 Why This Matters
${this.getIssueExplanation(issue.type, issue.severity)}

---
*🤖 Generated by ReviewBot · Powered by Azure OpenAI*`;

    return comment;
  }

  /**
   * Get detailed explanation for issue type and severity
   * @param type Issue type
   * @param severity Issue severity
   * @returns Explanation text
   */
  private getIssueExplanation(type: string, severity: string): string {
    const explanations = {
      security: {
        critical: 'This security vulnerability could lead to data breaches, unauthorized access, or system compromise. Immediate action required.',
        high: 'This security issue could be exploited by attackers. Should be fixed before merging to prevent potential security incidents.',
        medium: 'This security concern could lead to vulnerabilities if left unaddressed. Consider fixing to maintain security best practices.',
        low: 'Minor security improvement that enhances overall code security posture.',
      },
      performance: {
        critical: 'This performance issue will cause severe degradation, timeouts, or system failures under load. Must be optimized immediately.',
        high: 'This performance bottleneck will significantly impact user experience and system scalability. Should be optimized before merge.',
        medium: 'This performance issue may cause slowdowns under certain conditions. Consider optimizing to improve responsiveness.',
        low: 'Minor performance improvement that could enhance efficiency.',
      },
      logic: {
        critical: 'This logic error will cause incorrect behavior, data corruption, or system crashes. Must be fixed immediately.',
        high: 'This bug will cause incorrect results or unexpected behavior. Should be fixed before merging to prevent production issues.',
        medium: 'This logic issue may cause problems in certain scenarios. Should be addressed to ensure correctness.',
        low: 'Minor logic improvement that enhances code reliability.',
      },
      style: {
        critical: 'This code style issue severely impacts maintainability and violates critical coding standards.',
        high: 'This style issue impacts code readability and maintainability. Should be fixed to maintain code quality.',
        medium: 'This style concern affects code consistency. Consider fixing to improve maintainability.',
        low: 'Minor style improvement for better code consistency.',
      },
    };

    return explanations[type]?.[severity] || 'This issue should be reviewed and addressed according to your team\'s guidelines.';
  }

  /**
   * Format summary comment with statistics and file limit warning
   * @param issues All issues found
   * @param score Quality score
   * @param skippedFiles Number of files skipped
   * @param filesProcessed Number of files reviewed
   * @returns Formatted Markdown comment
   */
  private formatSummaryComment(
    issues: IssueWithFile[],
    score: number,
    skippedFiles: number,
    filesProcessed: number,
  ): string {
    const critical = issues.filter((i) => i.severity === 'critical').length;
    const high = issues.filter((i) => i.severity === 'high').length;
    const medium = issues.filter((i) => i.severity === 'medium').length;
    const low = issues.filter((i) => i.severity === 'low').length;

    const emoji = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌';
    const scoreColor = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';

    let comment = `# ${emoji} AI Code Review Complete

## 📊 Quality Metrics

| Metric | Value |
|--------|-------|
| ${scoreColor} **Quality Score** | **${score}/100** |
| 📁 **Files Reviewed** | ${filesProcessed} |
| 🔍 **Total Issues Found** | ${issues.length} |
| 🔴 **Critical Issues** | ${critical} ${critical > 0 ? '⚠️ **Requires immediate attention**' : '✅'} |
| 🟠 **High Priority** | ${high} ${high > 0 ? '⚠️ **Fix before merge**' : '✅'} |
| 🟡 **Medium Priority** | ${medium} |
| 🔵 **Low Priority** | ${low} |
`;

    if (skippedFiles > 0) {
      comment += `
## ⚠️ Large MR Warning

This merge request contains **${skippedFiles + filesProcessed} files**. Only the first **${this.MAX_FILES} files** were reviewed to prevent token overflow.

**Recommendation:** Consider splitting large changes into smaller MRs for:
- Complete review coverage
- Easier review process
- Better git history
- Reduced merge conflicts
`;
    }

    // Add issue breakdown by type
    const byType = issues.reduce((acc, issue) => {
      if (!acc[issue.type]) acc[issue.type] = 0;
      acc[issue.type]++;
      return acc;
    }, {} as Record<string, number>);

    if (Object.keys(byType).length > 0) {
      comment += `
## 📋 Issues by Category

| Category | Count | Description |
|----------|-------|-------------|
`;

      const typeInfo = {
        security: { emoji: '🔒', desc: 'Security vulnerabilities and concerns' },
        performance: { emoji: '⚡', desc: 'Performance bottlenecks and optimizations' },
        logic: { emoji: '🐛', desc: 'Logic errors and bugs' },
        style: { emoji: '💅', desc: 'Code style and maintainability' },
      };

      for (const [type, count] of Object.entries(byType)) {
        const info = typeInfo[type] || { emoji: '💡', desc: 'Other issues' };
        comment += `| ${info.emoji} ${type.charAt(0).toUpperCase() + type.slice(1)} | ${count} | ${info.desc} |\n`;
      }
    }

    if (issues.length > 0) {
      comment += '\n## 📁 Detailed Issues by File\n';

      // Group by file and sort by severity
      const byFile = issues.reduce((acc, issue) => {
        if (!acc[issue.file]) acc[issue.file] = [];
        acc[issue.file].push(issue);
        return acc;
      }, {} as Record<string, IssueWithFile[]>);

      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const sortedFiles = Object.entries(byFile).sort((a, b) => {
        const maxSeverityA = Math.min(...a[1].map(i => severityOrder[i.severity]));
        const maxSeverityB = Math.min(...b[1].map(i => severityOrder[i.severity]));
        return maxSeverityA - maxSeverityB;
      });

      for (const [file, fileIssues] of sortedFiles) {
        const critCount = fileIssues.filter((i) => i.severity === 'critical').length;
        const highCount = fileIssues.filter((i) => i.severity === 'high').length;
        const medCount = fileIssues.filter((i) => i.severity === 'medium').length;
        const lowCount = fileIssues.filter((i) => i.severity === 'low').length;

        const badges = [];
        if (critCount > 0) badges.push(`🔴 ${critCount} Critical`);
        if (highCount > 0) badges.push(`🟠 ${highCount} High`);
        if (medCount > 0) badges.push(`🟡 ${medCount} Medium`);
        if (lowCount > 0) badges.push(`🔵 ${lowCount} Low`);

        comment += `\n### 📄 \`${file}\`\n`;
        comment += `**${fileIssues.length} issue${fileIssues.length > 1 ? 's' : ''}:** ${badges.join(' · ')}\n`;

        // List ALL issues per file (not just top 3)
        const sortedIssues = fileIssues
          .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        for (const issue of sortedIssues) {
          const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[issue.severity];
          comment += `- ${emoji} **Line ${issue.line}**: ${issue.message}\n`;
        }
      }
    } else {
      comment += `
## ✨ Excellent Work!

No significant issues detected. The code follows best practices and maintains good quality standards.

**Keep up the good work!** 🎉
`;
    }

    comment += `
---

## 💬 Inline Comments

${issues.filter(i => ['critical', 'high', 'medium'].includes(i.severity)).length > 0
  ? `✅ Inline comments have been posted on **Critical**, **High**, and **Medium** severity issues.

Check the "Changes" tab to see detailed suggestions at specific code lines.`
  : '✅ No inline comments needed - all issues are low severity or informational.'}

---

**🤖 ReviewBot** · Powered by Azure OpenAI Haiku 4.5
*Generated with ±10 lines of context for accurate analysis*
`;

    return comment;
  }
}

/**
 * Review job data structure for Bull queue
 */
export interface ReviewJobData {
  reviewId: string;
  projectId: number;
  mergeRequestIid: number;
}

/**
 * Issue with file information for summary
 */
export interface IssueWithFile {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'security' | 'performance' | 'logic' | 'style';
  message: string;
  suggestion: string;
}
