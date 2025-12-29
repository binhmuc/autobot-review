#!/usr/bin/env node
/**
 * SubagentStart Hook - Injects context to subagents (Optimized)
 *
 * Fires: When a subagent (Task tool call) is started
 * Purpose: Inject minimal context using env vars from SessionStart
 * Target: ~200 tokens (down from ~350)
 *
 * Exit Codes:
 *   0 - Success (non-blocking, allows continuation)
 */

const fs = require('fs');
const {
  loadConfig,
  resolveNamingPattern,
  getGitBranch,
  resolvePlanPath,
  getReportsPath,
  normalizePath
} = require('./lib/ck-config-utils.cjs');

/**
 * Get agent-specific context from config
 */
function getAgentContext(agentType, config) {
  const agentConfig = config.subagent?.agents?.[agentType];
  if (!agentConfig?.contextPrefix) return null;
  return agentConfig.contextPrefix;
}

/**
 * Build trust verification section if enabled
 */
function buildTrustVerification(config) {
  if (!config.trust?.enabled || !config.trust?.passphrase) return [];
  return [
    ``,
    `## Trust Verification`,
    `Passphrase: "${config.trust.passphrase}"`
  ];
}

/**
 * Main hook execution
 */
async function main() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    if (!stdin) process.exit(0);

    const payload = JSON.parse(stdin);
    const agentType = payload.agent_type || 'unknown';
    const agentId = payload.agent_id || 'unknown';

    // Load config for trust verification, naming, and agent-specific context
    const config = loadConfig({ includeProject: false, includeAssertions: false });

    // Compute naming pattern directly (don't rely on env vars which may not propagate)
    const gitBranch = getGitBranch();
    const namePattern = resolveNamingPattern(config.plan, gitBranch);

    // Resolve plan and reports path
    const resolved = resolvePlanPath(null, config);
    const reportsPath = getReportsPath(resolved.path, resolved.resolvedBy, config.plan, config.paths);
    const activePlan = resolved.resolvedBy === 'session' ? resolved.path : '';
    const suggestedPlan = resolved.resolvedBy === 'branch' ? resolved.path : '';
    const plansPath = normalizePath(config.paths?.plans) || 'plans';
    const docsPath = normalizePath(config.paths?.docs) || 'docs';
    const thinkingLanguage = config.locale?.thinkingLanguage || '';
    const responseLanguage = config.locale?.responseLanguage || '';
    // Auto-default thinkingLanguage to 'en' when only responseLanguage is set
    const effectiveThinking = thinkingLanguage || (responseLanguage ? 'en' : '');

    // Build compact context (~200 tokens)
    const lines = [];

    // Subagent identification
    lines.push(`## Subagent: ${agentType}`);
    lines.push(`ID: ${agentId} | CWD: ${payload.cwd || process.cwd()}`);
    lines.push(``);

    // Plan context (from env vars)
    lines.push(`## Context`);
    if (activePlan) {
      lines.push(`- Plan: ${activePlan}`);
    } else if (suggestedPlan) {
      lines.push(`- Plan: none | Suggested: ${suggestedPlan}`);
    } else {
      lines.push(`- Plan: none`);
    }
    lines.push(`- Reports: ${reportsPath}`);
    lines.push(`- Paths: ${plansPath}/ | ${docsPath}/`);
    lines.push(``);

    // Language (thinking + response, if configured)
    const hasThinking = effectiveThinking && effectiveThinking !== responseLanguage;
    if (hasThinking || responseLanguage) {
      lines.push(`## Language`);
      if (hasThinking) {
        lines.push(`- Thinking: Use ${effectiveThinking} for reasoning (logic, precision).`);
      }
      if (responseLanguage) {
        lines.push(`- Response: Respond in ${responseLanguage} (natural, fluent).`);
      }
      lines.push(``);
    }

    // Core rules (minimal)
    lines.push(`## Rules`);
    lines.push(`- Reports → ${reportsPath}`);
    lines.push(`- YAGNI / KISS / DRY`);
    lines.push(`- Concise, list unresolved Qs at end`);

    // Naming templates (computed directly for reliable injection)
    lines.push(``);
    lines.push(`## Naming`);
    lines.push(`- Report: ${reportsPath}${agentType}-${namePattern}.md`);
    lines.push(`- Plan dir: ${plansPath}/${namePattern}/`);

    // Trust verification (if enabled)
    lines.push(...buildTrustVerification(config));

    // Agent-specific context (if configured)
    const agentContext = getAgentContext(agentType, config);
    if (agentContext) {
      lines.push(``);
      lines.push(`## Agent Instructions`);
      lines.push(agentContext);
    }

    // CRITICAL: SubagentStart requires hookSpecificOutput.additionalContext format
    const output = {
      hookSpecificOutput: {
        hookEventName: "SubagentStart",
        additionalContext: lines.join('\n')
      }
    };

    console.log(JSON.stringify(output));
    process.exit(0);
  } catch (error) {
    console.error(`SubagentStart hook error: ${error.message}`);
    process.exit(0); // Fail-open
  }
}

main();
