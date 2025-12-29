import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AzureOpenAI } from 'openai';
import pRetry from 'p-retry';
import { FileContentWithContext } from '../gitlab/gitlab.service';

/**
 * LLM Service
 * Integrates with Azure OpenAI for code review analysis
 * Optimized for token efficiency by reviewing only changed lines
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: AzureOpenAI;
  private readonly deployment: string;
  private readonly modelName: string;
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>('AZURE_OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('AZURE_OPENAI_KEY');
    this.deployment = this.configService.get<string>('AZURE_OPENAI_DEPLOYMENT') || 'haiku-4-5';
    this.modelName = this.configService.get<string>('AZURE_OPENAI_MODEL_NAME') || 'haiku-4-5';
    const apiVersion = this.configService.get<string>('AZURE_OPENAI_API_VERSION') || '2024-12-01-preview';

    if (!endpoint || !apiKey) {
      this.logger.warn('Azure OpenAI not configured - AI review features disabled');
      this.enabled = false;
      return;
    }

    this.enabled = true;
    // Configure Azure OpenAI client with proper parameters
    this.client = new AzureOpenAI({
      endpoint,
      apiKey,
      deployment: this.deployment,
      apiVersion,
    });
    this.logger.log('✓ Azure OpenAI client initialized');
  }

  /**
   * Check if LLM service is enabled and configured
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Review multiple chunks in a single LLM call (batching for efficiency)
   * @param chunks Array of diff chunks to review together
   * @returns Structured code review result with issues from all files
   */
  async reviewMultipleChunks(chunks: DiffChunk[]): Promise<BatchedCodeReviewResult> {
    if (!this.enabled) {
      this.logger.warn('LLM service disabled - returning empty review');
      return { summary: '', issues: [] };
    }

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildBatchedPrompt(chunks);

    this.logger.log('='.repeat(80));
    this.logger.log(`📤 SENDING BATCHED PROMPT (${chunks.length} files)`);
    this.logger.log('='.repeat(80));
    console.log('\n🔷 SYSTEM PROMPT:');
    console.log(systemPrompt);
    console.log('\n🔷 USER PROMPT (Batched):');
    console.log(userPrompt);
    console.log('\n' + '='.repeat(80) + '\n');

    try {
      const review = await pRetry(
        async () => {
          const response = await this.client.chat.completions.create({
            model: this.modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_completion_tokens: 40000,
          });

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw new Error('Empty response from Azure OpenAI');
          }

          this.logger.log('='.repeat(80));
          this.logger.log('📥 RECEIVED BATCHED RESPONSE');
          this.logger.log('='.repeat(80));
          console.log('\n🔶 RAW RESPONSE:');
          console.log(content);
          console.log('\n🔶 TOKEN USAGE:');
          console.log(JSON.stringify({
            prompt_tokens: response.usage?.prompt_tokens,
            completion_tokens: response.usage?.completion_tokens,
            total_tokens: response.usage?.total_tokens,
          }, null, 2));
          console.log('\n' + '='.repeat(80) + '\n');

          return content;
        },
        {
          retries: 3,
          onFailedAttempt: (err: any) => {
            this.logger.warn(`Retry ${err.attemptNumber}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          },
        },
      );

      const parsed = this.parseBatchedReviewResponse(review);
      this.logger.log(`✅ Parsed batched review: ${parsed.issues.length} total issues`);

      return parsed;
    } catch (error) {
      this.logger.error(`Failed to get batched LLM review: ${error.message}`);
      return { summary: 'Error during batched review', issues: [] };
    }
  }

  /**
   * Review code changes using Azure OpenAI
   * @param chunk Diff chunk with changed lines and context
   * @returns Structured code review result
   */
  async reviewChangedLines(chunk: DiffChunk): Promise<CodeReviewResult> {
    if (!this.enabled) {
      this.logger.warn('LLM service disabled - returning empty review');
      return { summary: '', issues: [] };
    }

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildOptimizedPrompt(chunk);

    // Log prompt being sent to LLM
    this.logger.log('='.repeat(80));
    this.logger.log('📤 SENDING PROMPT TO LLM');
    this.logger.log('='.repeat(80));
    console.log('\n🔷 SYSTEM PROMPT:');
    console.log(systemPrompt);
    console.log('\n🔷 USER PROMPT:');
    console.log(userPrompt);
    console.log('\n' + '='.repeat(80) + '\n');

    try {
      const review = await pRetry(
        async () => {
          const response = await this.client.chat.completions.create({
            model: this.modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_completion_tokens: 40000,
          });

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw new Error('Empty response from Azure OpenAI');
          }

          // Log LLM response
          this.logger.log('='.repeat(80));
          this.logger.log('📥 RECEIVED RESPONSE FROM LLM');
          this.logger.log('='.repeat(80));
          console.log('\n🔶 RAW RESPONSE:');
          console.log(content);
          console.log('\n🔶 TOKEN USAGE:');
          console.log(JSON.stringify({
            prompt_tokens: response.usage?.prompt_tokens,
            completion_tokens: response.usage?.completion_tokens,
            total_tokens: response.usage?.total_tokens,
          }, null, 2));
          console.log('\n' + '='.repeat(80) + '\n');

          return content;
        },
        {
          retries: 3,
          onFailedAttempt: (err: any) => {
            this.logger.warn(`Retry ${err.attemptNumber}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          },
        },
      );

      const parsed = this.parseReviewResponse(review);

      // Log parsed result
      this.logger.log('✅ Parsed review result:');
      console.log(JSON.stringify(parsed, null, 2));

      return parsed;
    } catch (error) {
      this.logger.error(`Failed to get LLM review: ${error.message}`);
      return { summary: 'Error during review', issues: [] };
    }
  }

  /**
   * Build batched prompt combining multiple file changes
   * @param chunks Array of chunks to review
   * @returns Combined prompt
   */
  private buildBatchedPrompt(chunks: DiffChunk[]): string {
    let prompt = `# Batched Code Review Task

Reviewing ${chunks.length} file(s) with changes.

`;

    // Add each file as a section
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      prompt += `---\n\n## File ${i + 1}/${chunks.length}: ${chunk.filename}\n\n`;
      prompt += `**Language:** ${chunk.language}\n`;
      prompt += `**Changes:** +${chunk.additions} -${chunk.deletions}\n\n`;

      // Imports
      if (chunk.fileContext?.imports && chunk.fileContext.imports.length > 0) {
        prompt += `### ✅ Available Imports\n\n`;
        prompt += `\`\`\`${chunk.language}\n${chunk.fileContext.imports.join('\n')}\n\`\`\`\n\n`;
      }

      // Context
      if (chunk.fileContext && chunk.fileContext.lines.length > 0) {
        prompt += `### Code Context\n\n`;
        prompt += `\`\`\`${chunk.language}\n`;
        prompt += chunk.fileContext.lines.map((line, idx) => {
          const lineNum = chunk.fileContext!.startLineNumber + idx;
          const isTargetLine = lineNum === chunk.fileContext!.targetLineNumber;
          return `${lineNum.toString().padStart(4, ' ')} ${isTargetLine ? '→' : ' '} ${line}`;
        }).join('\n');
        prompt += `\n\`\`\`\n\n`;
      }

      // Diff
      prompt += `### Changes to Review\n\n`;
      prompt += `\`\`\`diff\n${chunk.hunks}\n\`\`\`\n\n`;
    }

    prompt += `---\n\n## Instructions\n\n`;
    prompt += `1. Review ALL ${chunks.length} files listed above\n`;
    prompt += `2. For EACH file, check the Available Imports before reporting missing imports\n`;
    prompt += `3. Provide line numbers and file names in your response\n`;
    prompt += `4. Focus on security, logic, and performance issues\n`;
    prompt += `5. Return a single JSON with all issues from all files\n\n`;
    prompt += `**Response format:**\n`;
    prompt += `\`\`\`json\n{\n`;
    prompt += `  "summary": "Overall assessment of all ${chunks.length} files",\n`;
    prompt += `  "issues": [\n`;
    prompt += `    {\n`;
    prompt += `      "file": "path/to/file.ts",\n`;
    prompt += `      "line": <line_number>,\n`;
    prompt += `      "severity": "critical|high|medium|low",\n`;
    prompt += `      "type": "security|performance|logic|style",\n`;
    prompt += `      "message": "Issue description",\n`;
    prompt += `      "suggestion": "Fix recommendation"\n`;
    prompt += `    }\n`;
    prompt += `  ]\n`;
    prompt += `}\n\`\`\`\n`;

    return prompt;
  }

  /**
   * Get system prompt for code review
   * Emphasizes reviewing only changed lines for token efficiency
   */
  private getSystemPrompt(): string {
    return `You are an expert code reviewer analyzing ONLY CHANGED lines in diffs.

CRITICAL RULES:
1. Review ONLY lines starting with + (added) or - (removed)
2. Context lines (no prefix) are for understanding only - DO NOT review them
3. **BEFORE reporting "missing import", CHECK the "Available Imports" section**
4. **BEFORE reporting "undefined variable", CHECK the "Code Context" section**
5. Focus on actual bugs, security issues, and performance problems

⚠️ IMPORT VERIFICATION RULE (MOST IMPORTANT):
- The prompt includes an "Available Imports" section showing ALL imports from the file
- If an import appears in that section, it IS available in the file
- DO NOT report "missing import" if it exists in the imports section
- Only report import issues if the import is truly absent from the list

⚠️ VARIABLE VERIFICATION RULE:
- The prompt includes "Code Context" showing ±10 lines around changes
- Check if variables are defined in the context before reporting undefined
- Only report undefined if truly not present in context or imports

Focus areas (in priority order):
1. Security vulnerabilities (SQL injection, XSS, authentication flaws)
2. Logic errors and bugs
3. Performance issues (N+1 queries, inefficient algorithms)
4. Best practice violations that cause problems
5. Style issues (lowest priority)

Response format (valid JSON only):
{
  "summary": "Brief overall assessment in 1-2 sentences",
  "issues": [
    {
      "line": <line_number_in_new_file>,
      "severity": "critical|high|medium|low",
      "type": "security|performance|logic|style",
      "message": "Clear description of the issue",
      "suggestion": "Specific fix recommendation"
    }
  ]
}

If no significant issues found, return: {"summary": "No major issues found", "issues": []}`;
  }

  /**
   * Build optimized prompt with diff chunk and file context
   * @param chunk Processed diff chunk
   * @returns Formatted prompt for LLM
   */
  private buildOptimizedPrompt(chunk: DiffChunk): string {
    let prompt = `# Code Review Task

## File Information
- **Path:** ${chunk.filename}
- **Language:** ${chunk.language}
- **Changes:** +${chunk.additions} -${chunk.deletions}

`;

    // Add imports if available (shows decorators, types, dependencies)
    if (chunk.fileContext?.imports && chunk.fileContext.imports.length > 0) {
      prompt += `## ✅ Available Imports (VERIFIED - These imports ARE present in the file)

**⚠️ CRITICAL: BEFORE reporting any "missing import" issue, verify the import is NOT in this list!**

\`\`\`${chunk.language}
${chunk.fileContext.imports.join('\n')}
\`\`\`

**Total imports detected:** ${chunk.fileContext.imports.length}
**Rule:** If an import exists above, DO NOT report it as missing.

`;
    } else {
      prompt += `## ⚠️ No Imports Detected

This file has no imports at the top. Any external dependencies WILL be missing.

`;
    }

    // Add actual file content with context if available
    if (chunk.fileContext && chunk.fileContext.lines.length > 0) {
      prompt += `## Code Context (±10 lines around changes)

\`\`\`${chunk.language}
${chunk.fileContext.lines.map((line, idx) => {
  const lineNum = chunk.fileContext!.startLineNumber + idx;
  const isTargetLine = lineNum === chunk.fileContext!.targetLineNumber;
  return `${lineNum.toString().padStart(4, ' ')} ${isTargetLine ? '→' : ' '} ${line}`;
}).join('\n')}
\`\`\`

`;
    }

    prompt += `## Changes to Review (diff format)

**Review ONLY the lines with + (added) or - (removed) prefix:**

\`\`\`diff
${chunk.hunks}
\`\`\`

---

## Review Instructions

1. **Available Imports section** shows ALL imports - these ARE in the file
2. **Code Context section** shows ±10 lines around changes for understanding
3. **Review ONLY** lines with plus or minus prefix in the diff
4. **DO NOT** report missing imports that are in the Available Imports section
5. **DO NOT** report undefined variables that are in the Code Context section
6. Provide line numbers relative to the NEW file (after changes)
7. Focus on security, logic errors, and performance - not minor style issues

**Remember:** Imports and context are DEFINITIVE - if they are shown, they exist!`;

    return prompt;
  }

  /**
   * Parse LLM response into structured format
   * @param response Raw LLM response string
   * @returns Structured code review result
   */
  private parseReviewResponse(response: string): CodeReviewResult {
    try {
      // Remove markdown code blocks if present
      const cleanResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanResponse);

      // Validate structure
      if (!parsed.summary || !Array.isArray(parsed.issues)) {
        throw new Error('Invalid response structure');
      }

      return {
        summary: parsed.summary,
        issues: parsed.issues.map((issue: any) => ({
          line: parseInt(issue.line) || 0,
          severity: issue.severity || 'low',
          type: issue.type || 'style',
          message: issue.message || 'No description',
          suggestion: issue.suggestion || 'No suggestion',
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to parse LLM response: ${error.message}`);
      this.logger.debug(`Raw response: ${response}`);
      return {
        summary: 'Failed to parse review results',
        issues: [],
      };
    }
  }

  /**
   * Parse batched LLM response with issues from multiple files
   * @param response Raw LLM response string
   * @returns Batched review result
   */
  private parseBatchedReviewResponse(response: string): BatchedCodeReviewResult {
    try {
      const cleanResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanResponse);

      if (!parsed.summary || !Array.isArray(parsed.issues)) {
        throw new Error('Invalid batched response structure');
      }

      return {
        summary: parsed.summary,
        issues: parsed.issues.map((issue: any) => ({
          file: issue.file || 'unknown',
          line: parseInt(issue.line) || 0,
          severity: issue.severity || 'low',
          type: issue.type || 'style',
          message: issue.message || 'No description',
          suggestion: issue.suggestion || 'No suggestion',
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to parse batched LLM response: ${error.message}`);
      this.logger.debug(`Raw response: ${response}`);
      return {
        summary: 'Failed to parse batched review results',
        issues: [],
      };
    }
  }
}

/**
 * Diff chunk for LLM review
 */
export interface DiffChunk {
  filename: string;
  language: string;
  hunks: string; // Formatted diff with context
  additions: number;
  deletions: number;
  fileContext?: FileContentWithContext;
}

/**
 * Structured code review result from LLM
 */
export interface CodeReviewResult {
  summary: string;
  issues: Array<{
    line: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: 'security' | 'performance' | 'logic' | 'style';
    message: string;
    suggestion: string;
  }>;
}

/**
 * Batched code review result with issues from multiple files
 */
export interface BatchedCodeReviewResult {
  summary: string;
  issues: Array<{
    file: string;
    line: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    type: 'security' | 'performance' | 'logic' | 'style';
    message: string;
    suggestion: string;
  }>;
}
