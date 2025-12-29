#!/usr/bin/env node
/**
 * Git Worktree Manager for ClaudeKit
 * Cross-platform Node.js script for creating isolated git worktrees
 *
 * Usage: node worktree.cjs <command> [options]
 * Commands:
 *   create <project> <feature>  Create a new worktree (project optional for standalone)
 *   remove <name-or-path>       Remove a worktree and its branch
 *   info                        Get repo info (type, projects, env files)
 *   list                        List existing worktrees
 *
 * Options:
 *   --prefix <type>    Branch prefix (feat|fix|refactor|docs|test|chore|perf)
 *   --json             Output in JSON format for LLM consumption
 *   --env <files>      Comma-separated list of .env files to copy
 *   --dry-run          Show what would be done without executing
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Minimum Node.js version check
const MIN_NODE_VERSION = 18;
const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < MIN_NODE_VERSION) {
  outputError('NODE_VERSION_ERROR', `Node.js ${MIN_NODE_VERSION}+ required. Current: ${process.version}`);
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const jsonIndex = args.indexOf('--json');
if (jsonIndex > -1) args.splice(jsonIndex, 1);

const prefixIndex = args.indexOf('--prefix');
let branchPrefix = 'feat';
if (prefixIndex > -1) {
  branchPrefix = args[prefixIndex + 1] || 'feat';
  args.splice(prefixIndex, 2);
}

const envIndex = args.indexOf('--env');
let envFilesToCopy = [];
if (envIndex > -1) {
  envFilesToCopy = (args[envIndex + 1] || '').split(',').filter(Boolean);
  args.splice(envIndex, 2);
}

const dryRunIndex = args.indexOf('--dry-run');
const dryRun = dryRunIndex > -1;
if (dryRunIndex > -1) args.splice(dryRunIndex, 1);

const command = args[0];
// For create: args[1] is project (or feature for standalone), args[2] is feature
// For remove: args[1] is worktree name or path
const arg1 = args[1];
const arg2 = args[2];

// Output helpers
function output(data) {
  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (data.success) {
      console.log(`\n✅ ${data.message}`);
      if (data.worktreePath) {
        console.log(`\n📋 Next Steps:`);
        console.log(`   1. cd ${data.worktreePath}`);
        console.log(`   2. claude`);
        console.log(`   3. Start working on your feature`);
        console.log(`\n🧹 Cleanup when done:`);
        console.log(`   git worktree remove ${data.worktreePath}`);
        console.log(`   git branch -d ${data.branch}`);
      }
      if (data.envFilesCopied && data.envFilesCopied.length > 0) {
        console.log(`\n📄 Environment files copied:`);
        data.envFilesCopied.forEach(f => console.log(`   ✓ ${f}`));
      }
      if (data.warnings && data.warnings.length > 0) {
        console.log(`\n⚠️  Warnings:`);
        data.warnings.forEach(w => console.log(`   ${w}`));
      }
    } else if (data.info) {
      // Info output
      console.log(`\n📦 Repository Info:`);
      console.log(`   Type: ${data.repoType}`);
      console.log(`   Base branch: ${data.baseBranch}`);
      if (data.projects && data.projects.length > 0) {
        console.log(`\n📁 Available projects:`);
        data.projects.forEach(p => console.log(`   - ${p.name} (${p.path})`));
      }
      if (data.envFiles && data.envFiles.length > 0) {
        console.log(`\n🔐 Environment files found:`);
        data.envFiles.forEach(f => console.log(`   - ${f}`));
      }
      if (data.dirtyState) {
        console.log(`\n⚠️  Working directory has uncommitted changes`);
      }
    }
  }
}

function outputError(code, message, details = {}) {
  const errorData = {
    success: false,
    error: { code, message, ...details }
  };
  if (jsonOutput) {
    console.log(JSON.stringify(errorData, null, 2));
  } else {
    console.error(`\n❌ Error [${code}]: ${message}`);
    if (details.suggestion) {
      console.error(`   💡 ${details.suggestion}`);
    }
    if (details.availableProjects) {
      console.error(`\n   Available projects:`);
      details.availableProjects.forEach(p => console.error(`     - ${p}`));
    }
  }
  process.exit(1);
}

// Git command wrapper with error handling
function git(command, options = {}) {
  try {
    const result = execSync(`git ${command}`, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      cwd: options.cwd || process.cwd()
    });
    return { success: true, output: result.trim() };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stderr: error.stderr?.toString().trim() || '',
      code: error.status
    };
  }
}

// Check if in git repo
function checkGitRepo() {
  const result = git('rev-parse --show-toplevel', { silent: true });
  if (!result.success) {
    outputError('NOT_GIT_REPO', 'Not in a git repository', {
      suggestion: 'Run this command from within a git repository'
    });
  }
  return result.output;
}

// Check git version supports worktree
function checkGitVersion() {
  const result = git('worktree list', { silent: true });
  if (!result.success && result.stderr.includes('not a git command')) {
    outputError('GIT_VERSION_ERROR', 'Git version too old (worktree requires git 2.5+)', {
      suggestion: 'Upgrade git to version 2.5 or newer'
    });
  }
}

// Detect base branch
function detectBaseBranch(cwd) {
  const branches = ['dev', 'develop', 'main', 'master'];
  for (const branch of branches) {
    const local = git(`show-ref --verify --quiet refs/heads/${branch}`, { silent: true, cwd });
    if (local.success) return branch;
    const remote = git(`show-ref --verify --quiet refs/remotes/origin/${branch}`, { silent: true, cwd });
    if (remote.success) return branch;
  }
  return 'main'; // fallback
}

// Check for uncommitted changes
function checkDirtyState() {
  const diff = git('diff --quiet', { silent: true });
  const diffCached = git('diff --cached --quiet', { silent: true });
  return !diff.success || !diffCached.success;
}

// Get dirty state details
function getDirtyStateDetails() {
  const status = git('status --porcelain', { silent: true });
  if (!status.success) return null;
  const lines = status.output.split('\n').filter(Boolean);
  const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
  const staged = lines.filter(l => l.startsWith('A ') || l.startsWith('M ') || l.startsWith('D ')).length;
  const untracked = lines.filter(l => l.startsWith('??')).length;
  return { modified, staged, untracked, total: lines.length };
}

// Parse .gitmodules for monorepo detection
function parseGitModules(gitRoot) {
  const modulesPath = path.join(gitRoot, '.gitmodules');
  if (!fs.existsSync(modulesPath)) return [];

  const content = fs.readFileSync(modulesPath, 'utf-8');
  const projects = [];
  const pathRegex = /path\s*=\s*(.+)/g;
  let match;
  while ((match = pathRegex.exec(content)) !== null) {
    const projectPath = match[1].trim();
    projects.push({
      path: projectPath,
      name: path.basename(projectPath)
    });
  }
  return projects;
}

// Find .env files
function findEnvFiles(dir) {
  try {
    const files = fs.readdirSync(dir);
    return files.filter(f => {
      if (!f.startsWith('.env')) return false;
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      return stat.isFile() && !stat.isSymbolicLink();
    });
  } catch {
    return [];
  }
}

// Find matching projects
function findMatchingProjects(projects, query) {
  const queryLower = query.toLowerCase();
  return projects.filter(p =>
    p.name.toLowerCase().includes(queryLower) ||
    p.path.toLowerCase().includes(queryLower)
  );
}

// Check if branch is already checked out
function isBranchCheckedOut(branchName, cwd) {
  const result = git('worktree list --porcelain', { silent: true, cwd });
  if (!result.success) return false;
  return result.output.includes(`branch refs/heads/${branchName}`);
}

// Check if branch exists
function branchExists(branchName, cwd) {
  const local = git(`show-ref --verify --quiet refs/heads/${branchName}`, { silent: true, cwd });
  if (local.success) return 'local';
  const remote = git(`show-ref --verify --quiet refs/remotes/origin/${branchName}`, { silent: true, cwd });
  if (remote.success) return 'remote';
  return false;
}

// Sanitize feature name to valid branch name
function sanitizeFeatureName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50); // Limit length
}

// COMMANDS

function cmdInfo() {
  const gitRoot = checkGitRepo();
  checkGitVersion();

  const projects = parseGitModules(gitRoot);
  const isMonorepo = projects.length > 0;
  const baseBranch = detectBaseBranch(gitRoot);
  const dirtyState = checkDirtyState();
  const dirtyDetails = dirtyState ? getDirtyStateDetails() : null;
  const envFiles = findEnvFiles(gitRoot);

  // For monorepo, also check each project for env files
  const projectEnvFiles = {};
  if (isMonorepo) {
    projects.forEach(p => {
      const projectDir = path.join(gitRoot, p.path);
      if (fs.existsSync(projectDir)) {
        const files = findEnvFiles(projectDir);
        if (files.length > 0) {
          projectEnvFiles[p.name] = files;
        }
      }
    });
  }

  output({
    info: true,
    repoType: isMonorepo ? 'monorepo' : 'standalone',
    gitRoot,
    baseBranch,
    projects: isMonorepo ? projects : [],
    envFiles,
    projectEnvFiles: isMonorepo ? projectEnvFiles : {},
    dirtyState,
    dirtyDetails
  });
}

function cmdList() {
  checkGitRepo();
  const result = git('worktree list', { silent: true });
  if (!result.success) {
    outputError('WORKTREE_LIST_ERROR', 'Failed to list worktrees', {
      suggestion: 'Ensure you are in a git repository'
    });
  }

  const worktrees = result.output.split('\n').filter(Boolean).map(line => {
    const parts = line.split(/\s+/);
    return {
      path: parts[0],
      commit: parts[1],
      branch: parts[2]?.replace(/[\[\]]/g, '') || 'detached'
    };
  });

  if (jsonOutput) {
    console.log(JSON.stringify({ success: true, worktrees }, null, 2));
  } else {
    console.log('\n📂 Existing worktrees:');
    worktrees.forEach(w => {
      console.log(`   ${w.path}`);
      console.log(`      Branch: ${w.branch} (${w.commit.slice(0, 7)})`);
    });
  }
}

function cmdCreate() {
  const gitRoot = checkGitRepo();
  checkGitVersion();

  const projects = parseGitModules(gitRoot);
  const isMonorepo = projects.length > 0;
  const warnings = [];

  // Parse arguments based on repo type
  // Monorepo: create <project> <feature>
  // Standalone: create <feature>
  let project, feature;
  if (isMonorepo) {
    project = arg1;
    feature = arg2;
    if (!project || !feature) {
      outputError('MISSING_ARGS', 'Both project and feature are required for monorepo', {
        suggestion: 'Usage: node worktree.cjs create <project> <feature> --prefix <type>',
        availableProjects: projects.map(p => p.name)
      });
    }
  } else {
    feature = arg1;
    if (!feature) {
      outputError('MISSING_FEATURE', 'Feature name is required', {
        suggestion: 'Usage: node worktree.cjs create <feature> --prefix <type>'
      });
    }
  }

  // Check dirty state
  if (checkDirtyState()) {
    const details = getDirtyStateDetails();
    warnings.push(`Uncommitted changes: ${details.modified} modified, ${details.staged} staged, ${details.untracked} untracked`);
  }

  // Determine working directory
  let workDir = gitRoot;
  let projectPath = '';
  let projectName = '';

  if (isMonorepo) {
    const matches = findMatchingProjects(projects, project);

    if (matches.length === 0) {
      outputError('PROJECT_NOT_FOUND', `Project "${project}" not found`, {
        suggestion: 'Check available projects with: node worktree.cjs info',
        availableProjects: projects.map(p => p.name)
      });
    }

    if (matches.length > 1) {
      outputError('MULTIPLE_PROJECTS_MATCH', `Multiple projects match "${project}"`, {
        suggestion: 'Use AskUserQuestion to let user select one',
        matchingProjects: matches.map(p => ({ name: p.name, path: p.path }))
      });
    }

    projectPath = matches[0].path;
    projectName = matches[0].name;
    workDir = path.join(gitRoot, projectPath);

    if (!fs.existsSync(workDir)) {
      outputError('PROJECT_DIR_NOT_FOUND', `Project directory not found: ${workDir}`, {
        suggestion: 'Initialize submodules: git submodule update --init'
      });
    }
  }

  // Sanitize feature name
  const sanitizedFeature = sanitizeFeatureName(feature);
  if (sanitizedFeature !== feature.toLowerCase().replace(/\s+/g, '-')) {
    warnings.push(`Feature name sanitized: "${feature}" → "${sanitizedFeature}"`);
  }

  // Create branch name
  const branchName = `${branchPrefix}/${sanitizedFeature}`;

  // Detect base branch
  const baseBranch = detectBaseBranch(workDir);

  // Check if branch already checked out
  if (isBranchCheckedOut(branchName, workDir)) {
    outputError('BRANCH_CHECKED_OUT', `Branch "${branchName}" is already checked out in another worktree`, {
      suggestion: 'Use a different feature name or remove the existing worktree'
    });
  }

  // Determine worktree path
  let worktreesDir, worktreeName;
  if (isMonorepo) {
    worktreesDir = path.join(gitRoot, 'worktrees');
    worktreeName = `${projectName}-${sanitizedFeature}`;
  } else {
    const repoName = path.basename(gitRoot);
    worktreesDir = path.join(path.dirname(gitRoot), 'worktrees');
    worktreeName = `${repoName}-${sanitizedFeature}`;
  }

  const worktreePath = path.join(worktreesDir, worktreeName);

  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    outputError('WORKTREE_EXISTS', `Worktree already exists: ${worktreePath}`, {
      suggestion: `To use: cd ${worktreePath} && claude\nTo remove: git worktree remove ${worktreePath}`
    });
  }

  // Check if branch exists
  const branchStatus = branchExists(branchName, workDir);

  // Dry-run mode: show what would be done
  if (dryRun) {
    output({
      success: true,
      dryRun: true,
      message: 'Dry run - no changes made',
      wouldCreate: {
        worktreePath,
        branch: branchName,
        baseBranch,
        branchExists: !!branchStatus,
        project: isMonorepo ? projectName : null,
        envFilesToCopy: envFilesToCopy.length > 0 ? envFilesToCopy : undefined
      },
      warnings: warnings.length > 0 ? warnings : undefined
    });
    return;
  }

  // Create worktrees directory
  try {
    fs.mkdirSync(worktreesDir, { recursive: true });
  } catch (err) {
    outputError('MKDIR_FAILED', `Failed to create worktrees directory: ${worktreesDir}`, {
      suggestion: 'Check write permissions'
    });
  }

  // Fetch remote branch if needed
  if (branchStatus === 'remote') {
    const fetchResult = git(`fetch origin ${branchName}`, { silent: true, cwd: workDir });
    if (!fetchResult.success) {
      outputError('FETCH_FAILED', `Failed to fetch branch from remote: ${branchName}`, {
        suggestion: 'Check network connection and remote repository access'
      });
    }
  }

  // Create worktree
  let createResult;
  if (branchStatus) {
    createResult = git(`worktree add "${worktreePath}" ${branchName}`, { cwd: workDir });
  } else {
    createResult = git(`worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`, { cwd: workDir });
  }

  if (!createResult.success) {
    outputError('WORKTREE_CREATE_FAILED', `Failed to create worktree`, {
      suggestion: createResult.stderr || createResult.error,
      gitError: createResult.stderr
    });
  }

  // Copy env files if specified
  const envFilesCopied = [];
  if (envFilesToCopy.length > 0) {
    const sourceDir = isMonorepo ? workDir : gitRoot;
    envFilesToCopy.forEach(envFile => {
      const sourcePath = path.join(sourceDir, envFile);
      const destPath = path.join(worktreePath, envFile);
      if (fs.existsSync(sourcePath)) {
        try {
          fs.copyFileSync(sourcePath, destPath);
          envFilesCopied.push(envFile);
        } catch (err) {
          warnings.push(`Failed to copy ${envFile}: ${err.message}`);
        }
      } else {
        warnings.push(`Env file not found: ${envFile}`);
      }
    });
  }

  output({
    success: true,
    message: 'Worktree created successfully!',
    worktreePath,
    branch: branchName,
    baseBranch,
    project: isMonorepo ? projectName : null,
    envFilesCopied,
    warnings: warnings.length > 0 ? warnings : undefined
  });
}

function cmdRemove() {
  if (!arg1) {
    outputError('MISSING_WORKTREE', 'Worktree name or path is required', {
      suggestion: 'Usage: node worktree.cjs remove <name-or-path>\nUse "node worktree.cjs list" to see available worktrees'
    });
  }

  const gitRoot = checkGitRepo();
  checkGitVersion();

  // Get list of worktrees
  const result = git('worktree list --porcelain', { silent: true });
  if (!result.success) {
    outputError('WORKTREE_LIST_ERROR', 'Failed to list worktrees');
  }

  // Parse worktrees
  const worktrees = [];
  let current = {};
  result.output.split('\n').forEach(line => {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.replace('worktree ', '') };
    } else if (line.startsWith('branch ')) {
      current.branch = line.replace('branch refs/heads/', '');
    }
  });
  if (current.path) worktrees.push(current);

  // Find matching worktree
  const searchTerm = arg1.toLowerCase();
  const matches = worktrees.filter(w => {
    const name = path.basename(w.path).toLowerCase();
    const fullPath = w.path.toLowerCase();
    return name.includes(searchTerm) || fullPath.includes(searchTerm) ||
           (w.branch && w.branch.toLowerCase().includes(searchTerm));
  });

  // Exclude main worktree (bare .git or the primary checkout)
  const removableMatches = matches.filter(w => !w.path.includes('.git/'));

  if (removableMatches.length === 0) {
    outputError('WORKTREE_NOT_FOUND', `No worktree matching "${arg1}" found`, {
      suggestion: 'Use "node worktree.cjs list" to see available worktrees',
      availableWorktrees: worktrees.filter(w => !w.path.includes('.git/')).map(w => path.basename(w.path))
    });
  }

  if (removableMatches.length > 1) {
    outputError('MULTIPLE_WORKTREES_MATCH', `Multiple worktrees match "${arg1}"`, {
      suggestion: 'Be more specific or use full path',
      matchingWorktrees: removableMatches.map(w => ({ name: path.basename(w.path), path: w.path, branch: w.branch }))
    });
  }

  const worktree = removableMatches[0];
  const worktreePath = worktree.path;
  const branchName = worktree.branch;

  // Dry-run mode
  if (dryRun) {
    output({
      success: true,
      dryRun: true,
      message: 'Dry run - no changes made',
      wouldRemove: {
        worktreePath,
        branch: branchName,
        deleteBranch: !!branchName
      }
    });
    return;
  }

  // Remove worktree
  const removeResult = git(`worktree remove "${worktreePath}" --force`, { silent: true });
  if (!removeResult.success) {
    outputError('WORKTREE_REMOVE_FAILED', `Failed to remove worktree: ${worktreePath}`, {
      suggestion: removeResult.stderr || 'Check if the worktree has uncommitted changes',
      gitError: removeResult.stderr
    });
  }

  // Delete branch if it exists
  let branchDeleted = false;
  if (branchName) {
    const deleteResult = git(`branch -d "${branchName}"`, { silent: true });
    if (deleteResult.success) {
      branchDeleted = true;
    } else {
      // Try force delete if normal delete fails
      const forceDeleteResult = git(`branch -D "${branchName}"`, { silent: true });
      branchDeleted = forceDeleteResult.success;
    }
  }

  output({
    success: true,
    message: 'Worktree removed successfully!',
    removedPath: worktreePath,
    branchDeleted: branchDeleted ? branchName : null,
    branchKept: !branchDeleted && branchName ? branchName : null
  });
}

// Main
function main() {
  switch (command) {
    case 'create':
      cmdCreate();
      break;
    case 'remove':
      cmdRemove();
      break;
    case 'info':
      cmdInfo();
      break;
    case 'list':
      cmdList();
      break;
    default:
      outputError('UNKNOWN_COMMAND', `Unknown command: ${command || '(none)'}`, {
        suggestion: 'Available commands: create, remove, info, list'
      });
  }
}

main();
