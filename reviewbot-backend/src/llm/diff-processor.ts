import { Injectable, Logger } from '@nestjs/common';
import * as parseDiff from 'parse-diff';

/**
 * Diff Processor
 * Extracts changed lines from diffs with context for token-efficient reviews
 */
@Injectable()
export class DiffProcessor {
  private readonly logger = new Logger(DiffProcessor.name);

  /**
   * Extract changed lines with surrounding context from diff
   * @param diff Raw diff string
   * @param contextLines Number of context lines before/after changes (default: 20)
   * @returns Array of processed diffs ready for LLM review
   */
  extractChangedLinesWithContext(
    diff: string,
    contextLines: number = 20,
  ): ProcessedDiff[] {
    try {
      const files = parseDiff(diff);
      const results: ProcessedDiff[] = [];

      this.logger.log(`📋 Parsed ${files.length} files from diff`);

      for (const file of files) {
        this.logger.debug(`Processing file: to="${file.to}", from="${file.from}", binary=${(file as any).binary}, deleted=${file.deleted}`);

        // Skip binary files
        if ((file as any).binary) {
          this.logger.debug(`Skipping binary file: ${file.to}`);
          continue;
        }

        // Skip deleted files
        if (file.deleted) {
          this.logger.debug(`Skipping deleted file: ${file.from}`);
          continue;
        }

        if (!file.chunks || file.chunks.length === 0) {
          this.logger.debug(`No chunks found for file: ${file.to || file.from}`);
          continue;
        }

        for (const chunk of file.chunks) {
          const processedChunk = this.processChunk(chunk, contextLines);

          if (processedChunk.hasChanges) {
            const filename = file.to || file.from || 'unknown';
            this.logger.log(`📝 Extracted chunk from: ${filename} (+${processedChunk.additions} -${processedChunk.deletions})`);

            results.push({
              filename,
              language: this.detectLanguage(file.to || ''),
              hunks: processedChunk.content,
              additions: processedChunk.additions,
              deletions: processedChunk.deletions,
              changedLines: processedChunk.changedLines,
            });
          }
        }
      }

      this.logger.log(`✓ Extracted ${results.length} diff chunks for review`);
      return results;
    } catch (error) {
      this.logger.error(`Failed to process diff: ${error.message}`);
      return [];
    }
  }

  /**
   * Process a single chunk with context
   * @param chunk Parsed diff chunk
   * @param contextLines Number of context lines
   * @returns Processed chunk with formatted content
   */
  private processChunk(chunk: any, contextLines: number) {
    const lines = chunk.changes || [];
    const result: string[] = [];
    const changedLines: number[] = [];
    let additions = 0;
    let deletions = 0;
    let hasChanges = false;

    // Track which lines we've already added to avoid duplicates
    const addedIndices = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.type === 'add') {
        additions++;
        hasChanges = true;
        changedLines.push(line.ln || 0);

        // Add context before (if not already added)
        for (let j = Math.max(0, i - contextLines); j < i; j++) {
          if (!addedIndices.has(j) && lines[j].type === 'normal') {
            result.push(` ${lines[j].content || ''}`);
            addedIndices.add(j);
          }
        }

        // Add the changed line
        result.push(`+${line.content || ''}`);
        addedIndices.add(i);

        // Add context after
        for (
          let j = i + 1;
          j < Math.min(lines.length, i + contextLines + 1);
          j++
        ) {
          if (!addedIndices.has(j)) {
            if (lines[j].type === 'normal') {
              result.push(` ${lines[j].content || ''}`);
              addedIndices.add(j);
            } else if (lines[j].type === 'add' || lines[j].type === 'del') {
              // Stop at next change
              break;
            }
          }
        }
      } else if (line.type === 'del') {
        deletions++;
        hasChanges = true;
        result.push(`-${line.content || ''}`);
        addedIndices.add(i);
      }
    }

    // Limit chunk size to prevent token overflow (max 100 lines)
    const maxLines = 100;
    const content = result.slice(0, maxLines).join('\n');

    if (result.length > maxLines) {
      this.logger.warn(`Chunk truncated from ${result.length} to ${maxLines} lines`);
    }

    return {
      content,
      hasChanges,
      additions,
      deletions,
      changedLines,
    };
  }

  /**
   * Detect programming language from file extension
   * @param filepath File path
   * @returns Language name
   */
  private detectLanguage(filepath: string): string {
    const ext = filepath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      sql: 'sql',
      sh: 'bash',
      yaml: 'yaml',
      yml: 'yaml',
      json: 'json',
      md: 'markdown',
    };
    return langMap[ext || ''] || 'unknown';
  }
}

/**
 * Processed diff result ready for LLM review
 */
export interface ProcessedDiff {
  filename: string;
  language: string;
  hunks: string;
  additions: number;
  deletions: number;
  changedLines: number[];
}
