#!/usr/bin/env node
'use strict';

/**
 * Custom Claude Code statusline for Node.js
 * Cross-platform support: Windows, macOS, Linux
 * Theme: detailed | Features: directory, git, model, usage, session, tokens
 * No external dependencies - uses only Node.js built-in modules
 *
 * Context Window Calculation:
 * - 100% = compaction threshold (not model limit)
 * - Self-calibrates via PreCompact hook
 * - Falls back to smart defaults based on window size
 */

const { stdin, env } = require('process');
const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Use modularized context tracker with 3-layer self-healing detection
const { trackContext } = require('./hooks/lib/context-tracker.cjs');


/**
 * Safe command execution wrapper
 */
function exec(cmd) {
    try {
        return execSync(cmd, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
        }).trim();
    } catch (err) {
        return '';
    }
}

/**
 * Format epoch timestamp as HH:mm
 */
function formatTimeHM(epoch) {
    try {
        const date = new Date(epoch * 1000);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (err) {
        return '00:00';
    }
}

// Context tracking functions moved to ./hooks/lib/context-tracker.cjs
// Provides 3-layer self-healing detection:
// - Layer 1: Session ID change detection
// - Layer 2: Token drop detection (50% threshold)
// - Layer 3: Hook marker system (SessionStart/SessionEnd)

/**
 * Generate Unicode progress bar (horizontal rectangles)
 * Uses smooth block characters for consistent rendering
 *
 * @param {number} percent - 0-100 percentage
 * @param {number} width - bar width in characters (default 12)
 * @returns {string} Unicode progress bar like ▰▰▰▰▰▱▱▱▱▱▱▱
 */
function progressBar(percent, width = 12) {
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round(clamped * width / 100);
    const empty = width - filled;
    // ▰ (U+25B0) filled, ▱ (U+25B1) empty - smooth horizontal rectangles
    return '▰'.repeat(filled) + '▱'.repeat(empty);
}

/**
 * Get severity emoji based on percentage (no color codes)
 *
 * @param {number} percent - 0-100 percentage
 * @returns {string} Emoji indicator
 */
function getSeverityEmoji(percent) {
    if (percent >= 90) return '🔴';      // Critical
    if (percent >= 70) return '🟡';      // Warning
    return '🟢';                          // Healthy
}

/**
 * Expand home directory to ~
 */
function expandHome(filePath) {
    const homeDir = os.homedir();
    if (filePath.startsWith(homeDir)) {
        return filePath.replace(homeDir, '~');
    }
    return filePath;
}

/**
 * Read stdin asynchronously
 */
async function readStdin() {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stdin.setEncoding('utf8');

        stdin.on('data', (chunk) => {
            chunks.push(chunk);
        });

        stdin.on('end', () => {
            resolve(chunks.join(''));
        });

        stdin.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Main function
 */
async function main() {
    try {
        // Read and parse JSON input
        const input = await readStdin();
        if (!input.trim()) {
            console.error('No input provided');
            process.exit(1);
        }

        const data = JSON.parse(input);

        // Extract basic information
        let currentDir = 'unknown';
        if (data.workspace?.current_dir) {
            currentDir = data.workspace.current_dir;
        } else if (data.cwd) {
            currentDir = data.cwd;
        }
        currentDir = expandHome(currentDir);

        const modelName = data.model?.display_name || 'Claude';
        const modelVersion = data.model?.version && data.model.version !== 'null' ? data.model.version : '';

        // Git branch detection
        let gitBranch = '';
        const gitCheck = exec('git rev-parse --git-dir');
        if (gitCheck) {
            gitBranch = exec('git branch --show-current');
            if (!gitBranch) {
                gitBranch = exec('git rev-parse --short HEAD');
            }
        }

        // Native Claude Code data integration
        let sessionText = '';
        let costUSD = '';
        let linesAdded = 0;
        let linesRemoved = 0;
        let contextPercent = 0;
        let contextText = '';
        const billingMode = env.CLAUDE_BILLING_MODE || 'api';

        // Extract native cost data from Claude Code
        costUSD = data.cost?.total_cost_usd || '';
        linesAdded = data.cost?.total_lines_added || 0;
        linesRemoved = data.cost?.total_lines_removed || 0;

        // Extract context window usage (Claude Code v2.0.65+)
        // Uses 3-layer self-healing detection from context-tracker module:
        // - Layer 1: Session ID change detection
        // - Layer 2: Token drop detection (50% threshold)
        // - Layer 3: Hook marker system (SessionStart/SessionEnd)
        const contextInput = data.context_window?.total_input_tokens || 0;
        const contextOutput = data.context_window?.total_output_tokens || 0;
        const contextSize = data.context_window?.context_window_size || 0;

        if (contextSize > 0) {
            const result = trackContext({
                sessionId: data.session_id,
                contextInput,
                contextOutput,
                contextWindowSize: contextSize
            });

            contextPercent = result.percentage;

            if (result.showCompactIndicator) {
                // First render after compaction - show indicator once
                contextText = `🔄 ▱▱▱▱▱▱▱▱▱▱▱▱`;
            } else {
                const emoji = getSeverityEmoji(contextPercent);
                const bar = progressBar(contextPercent, 12);
                contextText = `${emoji} ${bar} ${contextPercent}%`;
            }
        }

        // Session timer - parse local transcript JSONL (zero external dependencies)
        const transcriptPath = data.transcript_path;

        if (transcriptPath) {
            try {
                if (fs.existsSync(transcriptPath)) {
                    const content = fs.readFileSync(transcriptPath, 'utf8');
                    const lines = content.split('\n').filter(l => l.trim());

                    // Find first API call with usage data
                    let firstApiCall = null;
                    for (const line of lines) {
                        try {
                            const entry = JSON.parse(line);
                            if (entry.usage && entry.timestamp) {
                                firstApiCall = entry.timestamp;
                                break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    if (firstApiCall) {
                        // Calculate 5-hour billing block (Anthropic windows)
                        const now = new Date();
                        const currentUtcHour = now.getUTCHours();
                        const blockStart = Math.floor(currentUtcHour / 5) * 5;
                        let blockEnd = blockStart + 5;

                        // Handle day wraparound
                        let blockEndDate = new Date(now);
                        if (blockEnd >= 24) {
                            blockEnd -= 24;
                            blockEndDate.setUTCDate(blockEndDate.getUTCDate() + 1);
                        }
                        blockEndDate.setUTCHours(blockEnd, 0, 0, 0);

                        const nowSec = Math.floor(Date.now() / 1000);
                        const blockEndSec = Math.floor(blockEndDate.getTime() / 1000);
                        const remaining = blockEndSec - nowSec;

                        if (remaining > 0 && remaining < 18000) {
                            const rh = Math.floor(remaining / 3600);
                            const rm = Math.floor((remaining % 3600) / 60);
                            const blockEndLocal = formatTimeHM(blockEndSec);
                            sessionText = `${rh}h ${rm}m until reset at ${blockEndLocal}`;
                        }
                    }
                }
            } catch (err) {
                // Silent fail - transcript not readable
            }
        }

        // Render statusline (no ANSI colors - emoji only for indicators)
        let output = '';

        // Directory
        output += `📁 ${currentDir}`;

        // Git branch
        if (gitBranch) {
            output += `  🌿 ${gitBranch}`;
        }

        // Model
        output += `  🤖 ${modelName}`;

        // Model version
        if (modelVersion) {
            output += ` ${modelVersion}`;
        }

        // Session time
        if (sessionText) {
            output += `  ⌛ ${sessionText}`;
        }

        // Cost (only show for API billing mode)
        if (billingMode === 'api' && costUSD && /^\d+(\.\d+)?$/.test(costUSD.toString())) {
            const costUSDNum = parseFloat(costUSD);
            output += `  💵 $${costUSDNum.toFixed(4)}`;
        }

        // Lines changed
        if ((linesAdded > 0 || linesRemoved > 0)) {
            output += `  📝 +${linesAdded} -${linesRemoved}`;
        }

        // Context window usage (Claude Code v2.0.65+)
        if (contextText) {
            output += `  ${contextText}`;
        }

        console.log(output);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
