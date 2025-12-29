#!/usr/bin/env node
/**
 * SessionStart Hook - Initializes session environment with project detection
 *
 * Fires: Once per session (startup, resume, clear, compact)
 * Purpose: Load config, detect project info, persist to env vars, output context
 *
 * Exit Codes:
 *   0 - Success (non-blocking, allows continuation)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const {
  loadConfig,
  writeEnv,
  writeSessionState,
  resolvePlanPath,
  getReportsPath,
  resolveNamingPattern
} = require('./lib/ck-config-utils.cjs');
const { writeResetMarker } = require('./lib/context-tracker.cjs');

/**
 * Safely execute shell command with optional timeout
 * @param {string} cmd - Command to execute
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 */
function execSafe(cmd, timeoutMs = 5000) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    return null;
  }
}

/**
 * Safely execute a binary with arguments (no shell interpolation)
 * Prevents command injection and handles paths with spaces correctly
 * @param {string} binary - Path to the executable
 * @param {string[]} args - Arguments array
 * @param {number} timeoutMs - Timeout in milliseconds (default: 2000)
 */
function execFileSafe(binary, args, timeoutMs = 2000) {
  try {
    return execFileSync(binary, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    return null;
  }
}

/**
 * Validate that a path is a file (not directory) and doesn't contain shell metacharacters
 * @param {string} p - Path to validate
 */
function isValidPythonPath(p) {
  if (!p || typeof p !== 'string') return false;
  // Reject paths with shell metacharacters that could indicate injection attempts
  if (/[;&|`$(){}[\]<>!#*?]/.test(p)) return false;
  try {
    const stat = fs.statSync(p);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}

/**
 * Build platform-specific Python paths for fast filesystem check
 * Avoids slow shell initialization (pyenv, conda) by checking paths directly
 */
function getPythonPaths() {
  const paths = [];

  // User override takes priority
  if (process.env.PYTHON_PATH) {
    paths.push(process.env.PYTHON_PATH);
  }

  if (process.platform === 'win32') {
    // Windows paths
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    // Microsoft Store Python (most common on modern Windows)
    if (localAppData) {
      paths.push(path.join(localAppData, 'Microsoft', 'WindowsApps', 'python.exe'));
      paths.push(path.join(localAppData, 'Microsoft', 'WindowsApps', 'python3.exe'));
      // User-installed Python (common versions)
      for (const ver of ['313', '312', '311', '310', '39']) {
        paths.push(path.join(localAppData, 'Programs', 'Python', `Python${ver}`, 'python.exe'));
      }
    }

    // System-wide Python installations
    for (const ver of ['313', '312', '311', '310', '39']) {
      paths.push(path.join(programFiles, `Python${ver}`, 'python.exe'));
      paths.push(path.join(programFilesX86, `Python${ver}`, 'python.exe'));
    }

    // Legacy paths
    paths.push('C:\\Python313\\python.exe');
    paths.push('C:\\Python312\\python.exe');
    paths.push('C:\\Python311\\python.exe');
    paths.push('C:\\Python310\\python.exe');
    paths.push('C:\\Python39\\python.exe');
  } else {
    // Unix-like paths (Linux, macOS)
    paths.push('/usr/bin/python3');
    paths.push('/usr/local/bin/python3');
    paths.push('/opt/homebrew/bin/python3');      // macOS ARM (Homebrew)
    paths.push('/opt/homebrew/bin/python');       // macOS ARM fallback
    paths.push('/usr/bin/python');
    paths.push('/usr/local/bin/python');
  }

  return paths;
}

/**
 * Find Python binary using fast filesystem check
 * Returns first existing valid file path, avoiding slow shell spawns
 */
function findPythonBinary() {
  const paths = getPythonPaths();
  for (const p of paths) {
    if (isValidPythonPath(p)) return p;
  }
  return null;
}

/**
 * Get Python version with optimized detection
 * Layer 0: Fast path pre-check (instant fs lookup)
 * Layer 1: Timeout protection (2s max per command)
 * Layer 2: Graceful degradation (returns null on failure)
 */
function getPythonVersion() {
  // Layer 0: Fast path pre-check - instant filesystem lookup
  const pythonPath = findPythonBinary();
  if (pythonPath) {
    // Use execFileSafe to prevent command injection and handle paths with spaces
    // Direct binary execution bypasses shell initialization (pyenv, conda)
    const result = execFileSafe(pythonPath, ['--version']);
    if (result) return result;
  }

  // Fallback: Try shell resolution with strict timeout
  // This catches non-standard installations but caps at 2s
  // Note: Shell fallback still needed for pyenv/asdf where binary isn't in standard paths
  const commands = ['python3', 'python'];
  for (const cmd of commands) {
    const result = execFileSafe(cmd, ['--version']);
    if (result) return result;
  }

  return null;
}

/**
 * Get git remote URL
 */
function getGitRemoteUrl() {
  return execSafe('git config --get remote.origin.url');
}

/**
 * Get current git branch
 */
function getGitBranch() {
  return execSafe('git branch --show-current');
}

/**
 * Detect project type based on workspace indicators
 */
function detectProjectType(configOverride) {
  if (configOverride && configOverride !== 'auto') return configOverride;

  if (fs.existsSync('pnpm-workspace.yaml')) return 'monorepo';
  if (fs.existsSync('lerna.json')) return 'monorepo';

  if (fs.existsSync('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      if (pkg.workspaces) return 'monorepo';
      if (pkg.main || pkg.exports) return 'library';
    } catch (e) { /* ignore */ }
  }

  return 'single-repo';
}

/**
 * Detect package manager from lock files
 */
function detectPackageManager(configOverride) {
  if (configOverride && configOverride !== 'auto') return configOverride;

  if (fs.existsSync('bun.lockb')) return 'bun';
  if (fs.existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (fs.existsSync('yarn.lock')) return 'yarn';
  if (fs.existsSync('package-lock.json')) return 'npm';

  return null;
}

/**
 * Detect framework from package.json dependencies
 */
function detectFramework(configOverride) {
  if (configOverride && configOverride !== 'auto') return configOverride;
  if (!fs.existsSync('package.json')) return null;

  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['next']) return 'next';
    if (deps['nuxt']) return 'nuxt';
    if (deps['astro']) return 'astro';
    if (deps['@remix-run/node'] || deps['@remix-run/react']) return 'remix';
    if (deps['svelte'] || deps['@sveltejs/kit']) return 'svelte';
    if (deps['vue']) return 'vue';
    if (deps['react']) return 'react';
    if (deps['express']) return 'express';
    if (deps['fastify']) return 'fastify';
    if (deps['hono']) return 'hono';
    if (deps['elysia']) return 'elysia';

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Get coding level style name mapping
 * @param {number} level - Coding level (0-5)
 * @returns {string} Style name for /output-style command
 */
function getCodingLevelStyleName(level) {
  const styleMap = {
    0: 'coding-level-0-eli5',
    1: 'coding-level-1-junior',
    2: 'coding-level-2-mid',
    3: 'coding-level-3-senior',
    4: 'coding-level-4-lead',
    5: 'coding-level-5-god'
  };
  return styleMap[level] || 'coding-level-5-god';
}

/**
 * Get coding level guidelines by reading from output-styles .md files
 * This ensures single source of truth - users can customize the .md files directly
 * @param {number} level - Coding level (-1 to 5)
 * @returns {string|null} Guidelines text (frontmatter stripped) or null if disabled
 */
function getCodingLevelGuidelines(level) {
  // -1 = disabled (no injection, saves tokens)
  // 5 = god mode (still injects minimal guidelines)
  if (level === -1 || level === null || level === undefined) return null;

  const styleName = getCodingLevelStyleName(level);
  const stylePath = path.join(__dirname, '..', 'output-styles', `${styleName}.md`);

  try {
    if (!fs.existsSync(stylePath)) return null;

    const content = fs.readFileSync(stylePath, 'utf8');
    // Strip YAML frontmatter (between --- markers at start of file)
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n*/, '').trim();
    return withoutFrontmatter;
  } catch (e) {
    return null;
  }
}

/**
 * Build context summary for output (compact, single line)
 * @param {Object} config - Loaded config
 * @param {Object} detections - Project detections
 * @param {{ path: string|null, resolvedBy: string|null }} resolved - Plan resolution result
 */
function buildContextOutput(config, detections, resolved) {
  const lines = [`Project: ${detections.type || 'unknown'}`];
  if (detections.pm) lines.push(`PM: ${detections.pm}`);
  lines.push(`Plan naming: ${config.plan.namingFormat}`);

  // Show plan status with resolution context
  if (resolved.path) {
    if (resolved.resolvedBy === 'session') {
      lines.push(`Plan: ${resolved.path}`);
    } else {
      lines.push(`Suggested: ${resolved.path}`);
    }
  }

  return lines.join(' | ');
}

/**
 * Main hook execution
 */
async function main() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    const data = stdin ? JSON.parse(stdin) : {};
    const envFile = process.env.CLAUDE_ENV_FILE;
    const source = data.source || 'unknown';
    const sessionId = data.session_id || null;

    const config = loadConfig();

    // Layer 3: Write reset marker on /clear to signal statusline to reset baseline
    // This ensures context window percentage resets to 0% on fresh sessions
    if (source === 'clear' && sessionId) {
      writeResetMarker(sessionId, 'clear');
    }

    const detections = {
      type: detectProjectType(config.project?.type),
      pm: detectPackageManager(config.project?.packageManager),
      framework: detectFramework(config.project?.framework)
    };

    // Resolve plan - now returns { path, resolvedBy }
    const resolved = resolvePlanPath(null, config);

    // CRITICAL FIX: Only persist explicitly-set plans to session state
    // Branch-matched plans are "suggested" - stored separately, not as activePlan
    // This prevents stale plan pollution on fresh sessions
    if (sessionId) {
      writeSessionState(sessionId, {
        sessionOrigin: process.cwd(),
        // Only session-resolved plans are truly "active"
        activePlan: resolved.resolvedBy === 'session' ? resolved.path : null,
        // Track suggested plan separately (for UI hints, not for report paths)
        suggestedPlan: resolved.resolvedBy === 'branch' ? resolved.path : null,
        timestamp: Date.now(),
        source
      });
    }

    // Reports path only uses active plans, not suggested ones
    const reportsPath = getReportsPath(resolved.path, resolved.resolvedBy, config.plan, config.paths);

    // Collect static environment info (computed once per session)
    const staticEnv = {
      nodeVersion: process.version,
      pythonVersion: getPythonVersion(),
      osPlatform: process.platform,
      gitUrl: getGitRemoteUrl(),
      gitBranch: getGitBranch(),
      user: process.env.USERNAME || process.env.USER || process.env.LOGNAME || os.userInfo().username,
      locale: process.env.LANG || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      claudeSettingsDir: path.resolve(__dirname, '..')
    };

    // Compute resolved naming pattern (date + issue resolved, {slug} kept as placeholder)
    const namePattern = resolveNamingPattern(config.plan, staticEnv.gitBranch);

    if (envFile) {
      // Session & plan config
      writeEnv(envFile, 'CK_SESSION_ID', sessionId || '');
      writeEnv(envFile, 'CK_PLAN_NAMING_FORMAT', config.plan.namingFormat);
      writeEnv(envFile, 'CK_PLAN_DATE_FORMAT', config.plan.dateFormat);
      writeEnv(envFile, 'CK_PLAN_ISSUE_PREFIX', config.plan.issuePrefix || '');
      writeEnv(envFile, 'CK_PLAN_REPORTS_DIR', config.plan.reportsDir);

      // NEW: Resolved naming pattern for DRY file naming in agents
      // Example: "251212-1830-GH-88-{slug}" or "251212-1830-{slug}"
      // Agents use: `{agent-type}-$CK_NAME_PATTERN.md` and substitute {slug}
      writeEnv(envFile, 'CK_NAME_PATTERN', namePattern);

      // Plan resolution
      writeEnv(envFile, 'CK_ACTIVE_PLAN', resolved.resolvedBy === 'session' ? resolved.path : '');
      writeEnv(envFile, 'CK_SUGGESTED_PLAN', resolved.resolvedBy === 'branch' ? resolved.path : '');
      writeEnv(envFile, 'CK_REPORTS_PATH', reportsPath);

      // Paths
      writeEnv(envFile, 'CK_DOCS_PATH', config.paths.docs);
      writeEnv(envFile, 'CK_PLANS_PATH', config.paths.plans);
      writeEnv(envFile, 'CK_PROJECT_ROOT', process.cwd());

      // Project detection
      writeEnv(envFile, 'CK_PROJECT_TYPE', detections.type || '');
      writeEnv(envFile, 'CK_PACKAGE_MANAGER', detections.pm || '');
      writeEnv(envFile, 'CK_FRAMEWORK', detections.framework || '');

      // NEW: Static environment info (so other hooks don't need to recompute)
      writeEnv(envFile, 'CK_NODE_VERSION', staticEnv.nodeVersion);
      writeEnv(envFile, 'CK_PYTHON_VERSION', staticEnv.pythonVersion || '');
      writeEnv(envFile, 'CK_OS_PLATFORM', staticEnv.osPlatform);
      writeEnv(envFile, 'CK_GIT_URL', staticEnv.gitUrl || '');
      writeEnv(envFile, 'CK_GIT_BRANCH', staticEnv.gitBranch || '');
      writeEnv(envFile, 'CK_USER', staticEnv.user);
      writeEnv(envFile, 'CK_LOCALE', staticEnv.locale);
      writeEnv(envFile, 'CK_TIMEZONE', staticEnv.timezone);
      writeEnv(envFile, 'CK_CLAUDE_SETTINGS_DIR', staticEnv.claudeSettingsDir);

      // Locale config
      if (config.locale?.thinkingLanguage) {
        writeEnv(envFile, 'CK_THINKING_LANGUAGE', config.locale.thinkingLanguage);
      }
      if (config.locale?.responseLanguage) {
        writeEnv(envFile, 'CK_RESPONSE_LANGUAGE', config.locale.responseLanguage);
      }

      // Plan validation config (for /plan:validate, /plan:hard, /plan:parallel)
      const validation = config.plan?.validation || {};
      writeEnv(envFile, 'CK_VALIDATION_MODE', validation.mode || 'prompt');
      writeEnv(envFile, 'CK_VALIDATION_MIN_QUESTIONS', validation.minQuestions || 3);
      writeEnv(envFile, 'CK_VALIDATION_MAX_QUESTIONS', validation.maxQuestions || 8);
      writeEnv(envFile, 'CK_VALIDATION_FOCUS_AREAS', (validation.focusAreas || ['assumptions', 'risks', 'tradeoffs', 'architecture']).join(','));

      // Coding level config (for output style selection)
      const codingLevel = config.codingLevel ?? 5;
      writeEnv(envFile, 'CK_CODING_LEVEL', codingLevel);
      writeEnv(envFile, 'CK_CODING_LEVEL_STYLE', getCodingLevelStyleName(codingLevel));
    }

    console.log(`Session ${source}. ${buildContextOutput(config, detections, resolved)}`);

    // Auto-inject coding level guidelines (if not disabled)
    const codingLevel = config.codingLevel ?? -1;
    const guidelines = getCodingLevelGuidelines(codingLevel);
    if (guidelines) {
      console.log(`\n${guidelines}`);
    }

    if (config.assertions?.length > 0) {
      console.log(`\nUser Assertions:`);
      config.assertions.forEach((assertion, i) => {
        console.log(`  ${i + 1}. ${assertion}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error(`SessionStart hook error: ${error.message}`);
    process.exit(0);
  }
}

main();
