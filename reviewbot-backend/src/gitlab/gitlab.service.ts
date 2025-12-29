import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Gitlab } from '@gitbeaker/rest';

/**
 * GitLab Service
 * Handles interaction with GitLab API for posting comments and fetching diffs
 */
@Injectable()
export class GitLabService {
  private readonly logger = new Logger(GitLabService.name);
  private readonly client: InstanceType<typeof Gitlab>;

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>('GITLAB_ACCESS_TOKEN');
    const host = this.configService.get<string>('GITLAB_HOST') || 'https://gitlab.com';

    if (!token) {
      this.logger.warn('GITLAB_ACCESS_TOKEN not configured - GitLab features disabled');
    }

    this.client = new Gitlab({
      token: token || 'placeholder',
      host,
    });
  }

  /**
   * Post a general comment to merge request
   * @param projectId GitLab project ID
   * @param mergeRequestIid MR IID
   * @param comment Comment text (supports Markdown)
   */
  async postMRComment(
    projectId: number,
    mergeRequestIid: number,
    comment: string,
  ): Promise<void> {
    try {
      await this.client.MergeRequestNotes.create(
        projectId,
        mergeRequestIid,
        comment,
      );
      this.logger.log(`✓ Posted summary comment to MR ${mergeRequestIid}`);
    } catch (error) {
      this.logger.error(`Failed to post MR comment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Post inline comment at specific line in diff
   * @param projectId GitLab project ID
   * @param mergeRequestIid MR IID
   * @param diffData Inline comment data with position
   */
  async postInlineComment(
    projectId: number,
    mergeRequestIid: number,
    diffData: InlineCommentData,
  ): Promise<void> {
    try {
      this.logger.log(`📝 Attempting to post inline comment:`);
      this.logger.log(`   File: ${diffData.filePath}`);
      this.logger.log(`   Line: ${diffData.line}`);
      this.logger.log(`   baseSha: ${diffData.baseSha.substring(0, 8)}`);
      this.logger.log(`   headSha: ${diffData.headSha.substring(0, 8)}`);
      this.logger.log(`   startSha: ${diffData.startSha.substring(0, 8)}`);

      await this.client.MergeRequestDiscussions.create(
        projectId,
        mergeRequestIid,
        diffData.comment,
        {
          position: {
            positionType: 'text',
            oldPath: diffData.oldPath,
            newPath: diffData.filePath,
            newLine: String(diffData.line),
            baseSha: diffData.baseSha,
            headSha: diffData.headSha,
            startSha: diffData.startSha,
          },
        },
      );
      this.logger.log(`✓ Posted inline comment at ${diffData.filePath}:${diffData.line}`);
    } catch (error) {
      this.logger.error(`❌ Failed to post inline comment at ${diffData.filePath}:${diffData.line}`);
      this.logger.error(`   Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`   Response: ${JSON.stringify(error.response)}`);
      }
      // Don't throw - inline comments are non-critical
    }
  }

  /**
   * Get cumulative merge request diff between source and target branches
   * This returns the final diff, not individual commit diffs
   * @param projectId GitLab project ID
   * @param mergeRequestIid MR IID
   * @returns Array of diff objects representing cumulative changes
   */
  async getMRDiffs(projectId: number, mergeRequestIid: number) {
    try {
      this.logger.log(`Fetching cumulative diffs for MR ${mergeRequestIid} in project ${projectId}...`);

      // Get MR details to extract branch information
      const mrDetails = await this.getMRDetails(projectId, mergeRequestIid);

      if (!mrDetails.baseSha || !mrDetails.headSha) {
        this.logger.warn(`MR ${mergeRequestIid} has no diff_refs yet (still computing)`);
        return [];
      }

      // Use Repositories.compare() to get cumulative diff between target and source
      // This ensures we only review the FINAL state, not individual commits
      this.logger.log(`Comparing ${mrDetails.targetBranch} (base) → ${mrDetails.sourceBranch} (head)`);
      this.logger.log(`   baseSha: ${mrDetails.baseSha.substring(0, 8)} → headSha: ${mrDetails.headSha.substring(0, 8)}`);

      const comparison: any = await this.client.Repositories.compare(
        projectId,
        mrDetails.baseSha,
        mrDetails.headSha,
      );

      const diffs = comparison.diffs || [];

      this.logger.log(`✓ Fetched ${diffs.length} cumulative diffs for MR ${mergeRequestIid}`);

      if (diffs.length === 0) {
        this.logger.warn(`No diffs found for MR ${mergeRequestIid}. Branches might be identical.`);
      } else {
        // Log first diff structure for debugging
        this.logger.debug(`📋 Sample diff structure:`, JSON.stringify({
          new_path: diffs[0].new_path,
          old_path: diffs[0].old_path,
          diff: diffs[0].diff ? `${diffs[0].diff.substring(0, 100)}...` : 'No diff content',
        }, null, 2));
      }

      return diffs;
    } catch (error) {
      this.logger.error(`Failed to fetch MR diffs for project ${projectId}, MR ${mergeRequestIid}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get merge request details including SHA values
   * @param projectId GitLab project ID
   * @param mergeRequestIid MR IID
   * @returns MR details with SHA values
   */
  async getMRDetails(projectId: number, mergeRequestIid: number) {
    try {
      this.logger.log(`Fetching MR details for MR ${mergeRequestIid} in project ${projectId}...`);

      const mr: any = await this.client.MergeRequests.show(projectId, mergeRequestIid);
      const diffRefs = mr.diff_refs || mr.diffRefs || {};

      const details = {
        baseSha: diffRefs.base_sha || diffRefs.baseSha || '',
        headSha: diffRefs.head_sha || diffRefs.headSha || '',
        startSha: diffRefs.start_sha || diffRefs.startSha || '',
        sourceBranch: mr.source_branch || '',
        targetBranch: mr.target_branch || '',
        sourceProjectId: mr.source_project_id || projectId,
      };

      this.logger.log(`✓ Fetched MR details: baseSha=${details.baseSha.substring(0, 8)}, headSha=${details.headSha.substring(0, 8)}, startSha=${details.startSha.substring(0, 8)}`);
      this.logger.log(`   Source: ${details.sourceBranch} → Target: ${details.targetBranch}`);

      return details;
    } catch (error) {
      this.logger.error(`Failed to fetch MR details for project ${projectId}, MR ${mergeRequestIid}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get file content at specific commit SHA with surrounding lines
   * @param projectId GitLab project ID
   * @param filePath File path in repository
   * @param sha Commit SHA
   * @param lineNumber Target line number
   * @param contextLines Number of lines before/after (default: 10)
   * @returns File content with context lines
   */
  async getFileContentWithContext(
    projectId: number,
    filePath: string,
    sha: string,
    lineNumber: number,
    contextLines: number = 10,
  ): Promise<FileContentWithContext> {
    try {
      this.logger.debug(`Fetching file ${filePath} at ${sha.substring(0, 8)} for line ${lineNumber}`);

      // Get raw file content from GitLab
      const fileContent: any = await this.client.RepositoryFiles.show(
        projectId,
        filePath,
        sha,
      );

      // Decode base64 content
      const content = Buffer.from(fileContent.content || '', 'base64').toString('utf-8');
      const lines = content.split('\n');

      // Extract imports from top of file (first 50 lines or until first non-import/comment line)
      const imports = this.extractImports(lines, filePath);

      // Calculate range for context around changed line
      const startLine = Math.max(0, lineNumber - contextLines - 1);
      const endLine = Math.min(lines.length, lineNumber + contextLines);

      // Extract lines with context
      const contextContent = lines.slice(startLine, endLine);

      return {
        lines: contextContent,
        startLineNumber: startLine + 1,
        targetLineNumber: lineNumber,
        endLineNumber: endLine,
        totalLines: lines.length,
        imports, // Include imports for LLM context
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch file context for ${filePath}:${lineNumber}: ${error.message}`);
      return {
        lines: [],
        startLineNumber: 0,
        targetLineNumber: lineNumber,
        endLineNumber: 0,
        totalLines: 0,
        imports: [],
      };
    }
  }

  /**
   * Extract import statements from file
   * Looks at first 50 lines for import/require statements
   * @param lines File lines
   * @param filePath File path to detect language
   * @returns Array of import lines
   */
  private extractImports(lines: string[], filePath: string): string[] {
    const imports: string[] = [];
    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    // Language-specific import patterns
    const patterns = {
      // JavaScript/TypeScript: import, require, type imports
      ts: /^\s*(import\s+|export\s+\{|from\s+['"]|const\s+.*=\s*require\(|type\s+\{)/,
      js: /^\s*(import\s+|export\s+\{|from\s+['"]|const\s+.*=\s*require\()/,

      // Python: import, from...import
      py: /^\s*(import\s+|from\s+\S+\s+import\s+)/,

      // Java: import, package
      java: /^\s*(import\s+|package\s+)/,

      // Go: import
      go: /^\s*(import\s+[\("'])/,

      // Rust: use
      rs: /^\s*(use\s+)/,

      // PHP: use, require, include
      php: /^\s*(use\s+|require|include)/,
    };

    const pattern = patterns[ext] || patterns['ts']; // Default to TS pattern

    // Scan first 50 lines or until we hit non-import code
    let consecutiveNonImports = 0;
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i].trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.startsWith('#')) {
        continue;
      }

      // Check if line matches import pattern
      if (pattern.test(line)) {
        imports.push(lines[i]); // Preserve original indentation
        consecutiveNonImports = 0;
      } else {
        consecutiveNonImports++;
        // Stop if we see 3 consecutive non-import lines (likely past imports)
        if (consecutiveNonImports >= 3) {
          break;
        }
      }
    }

    return imports;
  }

  /**
   * Get full file content at specific commit SHA
   * Used by IssueVerifier for thorough checking
   * @param projectId GitLab project ID
   * @param filePath File path in repository
   * @param sha Commit SHA
   * @returns Full file content as string
   */
  async getFileContent(
    projectId: number,
    filePath: string,
    sha: string,
  ): Promise<string> {
    try {
      this.logger.debug(`Fetching full file ${filePath} at ${sha.substring(0, 8)}`);

      const fileContent: any = await this.client.RepositoryFiles.show(
        projectId,
        filePath,
        sha,
      );

      // Decode base64 content
      const content = Buffer.from(fileContent.content || '', 'base64').toString('utf-8');
      return content;
    } catch (error) {
      this.logger.warn(`Failed to fetch file ${filePath}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Inline comment data structure for GitLab discussions
 */
export interface InlineCommentData {
  filePath: string;
  oldPath: string;
  line: number;
  comment: string;
  baseSha: string;
  headSha: string;
  startSha: string;
}

/**
 * File content with context lines and imports
 */
export interface FileContentWithContext {
  lines: string[];
  startLineNumber: number;
  targetLineNumber: number;
  endLineNumber: number;
  totalLines: number;
  imports: string[]; // Import statements from top of file
}
