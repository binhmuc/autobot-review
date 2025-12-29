#!/usr/bin/env node
/**
 * privacy-block.cjs - Block access to sensitive files unless user-approved
 *
 * PRIVACY-based blocking (separate from SIZE-based scout-block)
 * Blocks sensitive files. LLM must get user approval and use APPROVED: prefix.
 *
 * Flow:
 * 1. LLM tries: Read ".env" → BLOCKED
 * 2. LLM asks user for permission
 * 3. User approves
 * 4. LLM retries: Read "APPROVED:.env" → ALLOWED
 */

const path = require('path');
const fs = require('fs');

const APPROVED_PREFIX = 'APPROVED:';

// Safe file patterns - exempt from privacy checks (documentation/template files)
const SAFE_PATTERNS = [
  /\.example$/i,   // .env.example, config.example
  /\.sample$/i,    // .env.sample
  /\.template$/i,  // .env.template
];

// Privacy-sensitive patterns
const PRIVACY_PATTERNS = [
  /^\.env$/,              // .env
  /^\.env\./,             // .env.local, .env.production, etc.
  /\.env$/,               // path/to/.env
  /\/\.env\./,            // path/to/.env.local
  /credentials/i,         // credentials.json, etc.
  /secrets?\.ya?ml$/i,    // secrets.yaml, secret.yml
  /\.pem$/,               // Private keys
  /\.key$/,               // Private keys
  /id_rsa/,               // SSH keys
  /id_ed25519/,           // SSH keys
];

/**
 * Load .ck.json config to check if privacy block is disabled
 * @returns {boolean} true if privacy block should be skipped
 */
function isPrivacyBlockDisabled() {
  try {
    const configPath = path.join(process.cwd(), '.claude', '.ck.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.privacyBlock === false;
  } catch {
    return false; // Default to enabled on error (file not found or invalid JSON)
  }
}

/**
 * Check if path is a safe file (example/sample/template)
 * @param {string} testPath - Path to check
 * @returns {boolean} true if file matches safe patterns
 */
function isSafeFile(testPath) {
  if (!testPath) return false;
  const basename = path.basename(testPath);
  return SAFE_PATTERNS.some(p => p.test(basename));
}

/**
 * Check if path has APPROVED: prefix
 * @param {string} testPath - Path to check
 * @returns {boolean} true if path starts with APPROVED:
 */
function hasApprovalPrefix(testPath) {
  return testPath && testPath.startsWith(APPROVED_PREFIX);
}

/**
 * Strip APPROVED: prefix from path, warn on suspicious paths
 * @param {string} testPath - Path to process
 * @returns {string} Path without APPROVED: prefix
 */
function stripApprovalPrefix(testPath) {
  if (hasApprovalPrefix(testPath)) {
    const stripped = testPath.slice(APPROVED_PREFIX.length);

    // Warn on suspicious paths (path traversal or absolute)
    if (stripped.includes('..') || path.isAbsolute(stripped)) {
      console.error('\x1b[33mWARN:\x1b[0m Approved path is outside project:', stripped);
    }

    return stripped;
  }
  return testPath;
}

/**
 * Check if path matches privacy patterns
 * @param {string} testPath - Path to check
 * @returns {boolean} true if path matches privacy-sensitive patterns
 */
function isPrivacySensitive(testPath) {
  if (!testPath) return false;

  // Strip prefix for pattern matching
  const cleanPath = stripApprovalPrefix(testPath);
  let normalized = cleanPath.replace(/\\/g, '/');

  // Decode URI components to catch obfuscated paths (%2e = '.')
  try {
    normalized = decodeURIComponent(normalized);
  } catch (e) {
    // Invalid encoding, use as-is
  }

  // Check safe patterns first - exempt example/sample/template files
  if (isSafeFile(normalized)) {
    return false;
  }

  const basename = path.basename(normalized);

  for (const pattern of PRIVACY_PATTERNS) {
    if (pattern.test(basename) || pattern.test(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract paths from tool input
 * @param {Object} toolInput - Tool input object with file_path, path, pattern, or command
 * @returns {Array<{value: string, field: string}>} Array of extracted paths with field names
 */
function extractPaths(toolInput) {
  const paths = [];
  if (!toolInput) return paths;

  if (toolInput.file_path) paths.push({ value: toolInput.file_path, field: 'file_path' });
  if (toolInput.path) paths.push({ value: toolInput.path, field: 'path' });
  if (toolInput.pattern) paths.push({ value: toolInput.pattern, field: 'pattern' });

  // Check bash commands for file paths
  if (toolInput.command) {
    // Look for APPROVED:.env or .env patterns
    const approvedMatch = toolInput.command.match(/APPROVED:[^\s]+/g) || [];
    approvedMatch.forEach(p => paths.push({ value: p, field: 'command' }));

    // Only look for .env if no APPROVED: version found
    if (approvedMatch.length === 0) {
      const envMatch = toolInput.command.match(/\.env[^\s]*/g) || [];
      envMatch.forEach(p => paths.push({ value: p, field: 'command' }));

      // Also check bash variable assignments (FILE=.env, ENV_FILE=.env.local)
      const varAssignments = toolInput.command.match(/\w+=[^\s]*\.env[^\s]*/g) || [];
      varAssignments.forEach(a => {
        const value = a.split('=')[1];
        if (value) paths.push({ value, field: 'command' });
      });

      // Check command substitution containing sensitive patterns - extract .env from inside
      const cmdSubst = toolInput.command.match(/\$\([^)]*?(\.env[^\s)]*)[^)]*\)/g) || [];
      for (const subst of cmdSubst) {
        const inner = subst.match(/\.env[^\s)]*/);
        if (inner) paths.push({ value: inner[0], field: 'command' });
      }
    }
  }

  return paths.filter(p => p.value);
}

/**
 * Format block message with approval instructions
 * @param {string} filePath - Blocked file path
 * @returns {string} Formatted block message
 */
function formatBlockMessage(filePath) {
  const basename = path.basename(filePath);
  return `
\x1b[36mNOTE:\x1b[0m This is not an error - this block protects sensitive data.

\x1b[33mPRIVACY BLOCK\x1b[0m: Sensitive file access requires user approval

  \x1b[33mFile:\x1b[0m ${filePath}

  This file may contain secrets (API keys, passwords, tokens).

  \x1b[34mAction required:\x1b[0m
  Ask user: "I need to read ${basename} which may contain sensitive data. Approve?"

  \x1b[32mIf YES:\x1b[0m Retry with prefix: APPROVED:${filePath}
  \x1b[31mIf NO:\x1b[0m  Do NOT retry. Continue without this file.
`;
}

/**
 * Format approval notice
 * @param {string} filePath - Approved file path
 * @returns {string} Formatted approval notice
 */
function formatApprovalNotice(filePath) {
  return `\x1b[32m✓\x1b[0m Privacy: User-approved access to ${path.basename(filePath)}`;
}

// Main
async function main() {
  // Check if privacy block is disabled via .ck.json
  if (isPrivacyBlockDisabled()) {
    process.exit(0); // Disabled, allow all
  }

  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch (e) {
    process.exit(0); // Invalid JSON, allow
  }

  const { tool_input: toolInput } = hookData;
  const paths = extractPaths(toolInput);

  // Check each path
  for (const { value: testPath } of paths) {
    if (!isPrivacySensitive(testPath)) continue;

    // Check for approval prefix
    if (hasApprovalPrefix(testPath)) {
      // User approved - allow with notice
      console.error(formatApprovalNotice(testPath));
      continue; // Check other paths
    }

    // No approval - block
    console.error(formatBlockMessage(testPath));
    process.exit(2); // Block
  }

  process.exit(0); // Allow
}

main().catch(() => process.exit(0));

// Export functions for unit testing
if (typeof module !== 'undefined') {
  module.exports = {
    isSafeFile,
    isPrivacyBlockDisabled,
    isPrivacySensitive,
    hasApprovalPrefix,
    stripApprovalPrefix,
    extractPaths,
  };
}
