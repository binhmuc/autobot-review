import { Injectable, Logger } from '@nestjs/common';
import { GitLabService, FileContentWithContext } from '../gitlab/gitlab.service';

/**
 * Issue Verifier Service
 * Validates LLM-reported issues before posting to GitLab
 * Filters false positives by checking actual file contents
 */
@Injectable()
export class IssueVerifier {
  private readonly logger = new Logger(IssueVerifier.name);

  constructor(private gitlabService: GitLabService) {}

  /**
   * Verify if a reported issue is real or false positive
   * @param issue Code review issue from LLM
   * @param context File context with imports and code
   * @param projectId GitLab project ID
   * @param filePath File path to verify
   * @param sha Commit SHA
   * @returns true if issue is real, false if false positive
   */
  async verifyIssue(
    issue: CodeIssue,
    context: VerificationContext,
  ): Promise<VerificationResult> {
    this.logger.debug(`Verifying issue: ${issue.message.substring(0, 50)}...`);

    // Route to specific verifier based on issue type
    if (this.isImportIssue(issue.message)) {
      return this.verifyImportIssue(issue, context);
    }

    if (this.isDefinitionIssue(issue.message)) {
      return this.verifyDefinitionIssue(issue, context);
    }

    // Security and performance issues pass through (trust LLM)
    if (issue.type === 'security' || issue.type === 'performance') {
      return {
        isValid: true,
        confidence: 'high',
        reason: 'Security/performance issues are not verified',
      };
    }

    // Other issues: assume valid but with medium confidence
    return {
      isValid: true,
      confidence: 'medium',
      reason: 'Issue type does not require verification',
    };
  }

  /**
   * Verify import-related issues
   * Checks if import exists in fileContext.imports or full file
   * Also checks for false "duplicate import" claims
   */
  private async verifyImportIssue(
    issue: CodeIssue,
    context: VerificationContext,
  ): Promise<VerificationResult> {
    const importName = this.extractImportName(issue.message);
    if (!importName) {
      return {
        isValid: true,
        confidence: 'low',
        reason: 'Could not parse import name from issue message',
      };
    }

    this.logger.debug(`Checking import: ${importName}`);

    // Check for "duplicate import" false positives
    if (issue.message.toLowerCase().includes('duplicate')) {
      return this.verifyDuplicateImportClaim(importName, context);
    }

    // Step 1: Check fileContext.imports (fast)
    if (context.fileContext?.imports && context.fileContext.imports.length > 0) {
      const existsInImports = context.fileContext.imports.some((imp) =>
        this.matchesImport(imp, importName),
      );

      if (existsInImports) {
        this.logger.log(`✗ False positive filtered: Import "${importName}" exists in file context`);
        return {
          isValid: false,
          confidence: 'high',
          reason: `Import "${importName}" is already present in file imports`,
        };
      }
    }

    // Step 2: Fetch full file and double-check (thorough)
    try {
      const fullFile = await this.gitlabService.getFileContent(
        context.projectId,
        context.filePath,
        context.sha,
      );

      const existsInFile = this.matchesImport(fullFile, importName);

      if (existsInFile) {
        this.logger.log(`✗ False positive filtered: Import "${importName}" found in full file`);
        return {
          isValid: false,
          confidence: 'high',
          reason: `Import "${importName}" exists in full file but was not in context`,
        };
      }

      // Import truly missing
      this.logger.log(`✓ Verified: Import "${importName}" is genuinely missing`);
      return {
        isValid: true,
        confidence: 'high',
        reason: `Import "${importName}" is not present in file`,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch full file for verification: ${error.message}`);
      // If we can't fetch file, assume issue is valid but with low confidence
      return {
        isValid: true,
        confidence: 'low',
        reason: 'Could not fetch full file for verification',
      };
    }
  }

  /**
   * Verify variable/function definition issues
   * Checks if variable is defined in context or file
   */
  private async verifyDefinitionIssue(
    issue: CodeIssue,
    context: VerificationContext,
  ): Promise<VerificationResult> {
    const identifier = this.extractIdentifier(issue.message);
    if (!identifier) {
      return {
        isValid: true,
        confidence: 'low',
        reason: 'Could not parse identifier from issue message',
      };
    }

    this.logger.debug(`Checking definition: ${identifier}`);

    // Step 1: Check context lines (fast)
    if (context.fileContext?.lines && context.fileContext.lines.length > 0) {
      const definedInContext = context.fileContext.lines.some((line) =>
        this.matchesDefinition(line, identifier),
      );

      if (definedInContext) {
        this.logger.log(`✗ False positive filtered: "${identifier}" is defined in context`);
        return {
          isValid: false,
          confidence: 'high',
          reason: `"${identifier}" is defined in the provided context`,
        };
      }
    }

    // Step 2: Fetch extended context (±50 lines) to be thorough
    try {
      const extendedContext = await this.gitlabService.getFileContentWithContext(
        context.projectId,
        context.filePath,
        context.sha,
        issue.line,
        50, // ±50 lines
      );

      const definedInExtended = extendedContext.lines.some((line) =>
        this.matchesDefinition(line, identifier),
      );

      if (definedInExtended) {
        this.logger.log(`✗ False positive filtered: "${identifier}" found in extended context`);
        return {
          isValid: false,
          confidence: 'high',
          reason: `"${identifier}" is defined within ±50 lines of the issue`,
        };
      }

      // Step 3: Check imports (identifier might be imported)
      if (extendedContext.imports) {
        const importedIdentifier = extendedContext.imports.some((imp) =>
          imp.includes(identifier),
        );

        if (importedIdentifier) {
          this.logger.log(`✗ False positive filtered: "${identifier}" is imported`);
          return {
            isValid: false,
            confidence: 'high',
            reason: `"${identifier}" is imported at the top of the file`,
          };
        }
      }

      // Truly undefined
      this.logger.log(`✓ Verified: "${identifier}" is genuinely undefined`);
      return {
        isValid: true,
        confidence: 'high',
        reason: `"${identifier}" is not defined within ±50 lines or imports`,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch extended context: ${error.message}`);
      return {
        isValid: true,
        confidence: 'low',
        reason: 'Could not fetch extended context for verification',
      };
    }
  }

  /**
   * Verify "duplicate import" claims
   * Counts actual occurrences in imports - if <= 1, it's false positive
   */
  private verifyDuplicateImportClaim(
    importName: string,
    context: VerificationContext,
  ): VerificationResult {
    if (!context.fileContext?.imports || context.fileContext.imports.length === 0) {
      return {
        isValid: true,
        confidence: 'low',
        reason: 'No imports context available to verify duplicate claim',
      };
    }

    // Count occurrences in imports
    const count = context.fileContext.imports.filter((imp) =>
      this.matchesImport(imp, importName),
    ).length;

    this.logger.debug(`Import "${importName}" appears ${count} time(s) in imports`);

    if (count <= 1) {
      this.logger.log(`✗ False positive filtered: "${importName}" only appears ${count} time(s), not duplicate`);
      return {
        isValid: false,
        confidence: 'high',
        reason: `Import "${importName}" appears ${count} time(s), not a duplicate (need 2+ for duplicate)`,
      };
    }

    // Actually is duplicate
    this.logger.log(`✓ Verified: "${importName}" appears ${count} times, is duplicate`);
    return {
      isValid: true,
      confidence: 'high',
      reason: `Import "${importName}" genuinely appears ${count} times`,
    };
  }

  /**
   * Check if issue message indicates import problem
   */
  private isImportIssue(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes('import') ||
      lowerMessage.includes('not imported') ||
      lowerMessage.includes('missing import') ||
      lowerMessage.includes('cannot find')
    );
  }

  /**
   * Check if issue message indicates definition problem
   */
  private isDefinitionIssue(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes('not defined') ||
      lowerMessage.includes('undefined') ||
      lowerMessage.includes('not declared') ||
      lowerMessage.includes('cannot find name')
    );
  }

  /**
   * Extract import name from issue message
   * Examples:
   *   "Missing import for useState" → "useState"
   *   "Import 'Button' is required" → "Button"
   */
  private extractImportName(message: string): string | null {
    // Try to match quoted imports: 'useState' or "Button"
    const quotedMatch = message.match(/['"`]([A-Za-z0-9_$]+)['"`]/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Try to match "import X" or "X import"
    const importMatch = message.match(/\b(import\s+)?([A-Z][A-Za-z0-9_$]*)\b/);
    if (importMatch) {
      return importMatch[2];
    }

    return null;
  }

  /**
   * Extract identifier from issue message
   * Examples:
   *   "Variable 'count' is not defined" → "count"
   *   "Function handleClick is undefined" → "handleClick"
   */
  private extractIdentifier(message: string): string | null {
    // Try to match quoted identifiers: 'count' or "handleClick"
    const quotedMatch = message.match(/['"`]([A-Za-z0-9_$]+)['"`]/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Try to match variable/function names
    const identifierMatch = message.match(/\b([a-z][A-Za-z0-9_$]*)\b/);
    if (identifierMatch) {
      return identifierMatch[1];
    }

    return null;
  }

  /**
   * Check if import statement matches the import name
   * Examples:
   *   matchesImport("import { useState } from 'react'", "useState") → true
   *   matchesImport("import Button from './Button'", "Button") → true
   */
  private matchesImport(importStatement: string, importName: string): boolean {
    // Direct match
    if (importStatement.includes(importName)) {
      return true;
    }

    // Match in destructured imports: { useState, useEffect }
    const destructuredMatch = importStatement.match(/\{\s*([^}]+)\s*\}/);
    if (destructuredMatch) {
      const imports = destructuredMatch[1].split(',').map((s) => s.trim());
      return imports.some((imp) => {
        // Handle aliases: { useState as useStateHook }
        const [name] = imp.split(' as ');
        return name.trim() === importName;
      });
    }

    return false;
  }

  /**
   * Check if line contains definition of identifier
   * Examples:
   *   matchesDefinition("const count = 0;", "count") → true
   *   matchesDefinition("function handleClick() {}", "handleClick") → true
   */
  private matchesDefinition(line: string, identifier: string): boolean {
    // Variable declarations
    const varPattern = new RegExp(`\\b(const|let|var)\\s+${identifier}\\b`);
    if (varPattern.test(line)) {
      return true;
    }

    // Function declarations
    const funcPattern = new RegExp(`\\bfunction\\s+${identifier}\\b`);
    if (funcPattern.test(line)) {
      return true;
    }

    // Arrow functions
    const arrowPattern = new RegExp(`\\b${identifier}\\s*=\\s*\\(`);
    if (arrowPattern.test(line)) {
      return true;
    }

    // Class/interface names
    const classPattern = new RegExp(`\\b(class|interface|type|enum)\\s+${identifier}\\b`);
    if (classPattern.test(line)) {
      return true;
    }

    return false;
  }
}

/**
 * Code issue from LLM review
 */
export interface CodeIssue {
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'security' | 'performance' | 'logic' | 'style';
  message: string;
  suggestion: string;
}

/**
 * Context for verification
 */
export interface VerificationContext {
  projectId: number;
  filePath: string;
  sha: string;
  fileContext?: FileContentWithContext;
}

/**
 * Verification result
 */
export interface VerificationResult {
  isValid: boolean; // true = real issue, false = false positive
  confidence: 'high' | 'medium' | 'low';
  reason: string; // Explanation for debugging
}
