#!/usr/bin/env node
/**
 * SessionEnd Hook - Cleanup on session end
 *
 * Fires: When session ends (clear, compact, user exit)
 * Purpose: Delete compact marker files to reset context baseline on /clear
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 */

const fs = require('fs');
const { deleteMarker } = require('./lib/context-tracker.cjs');

async function main() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    const data = stdin ? JSON.parse(stdin) : {};
    const reason = data.reason || 'unknown';
    const sessionId = data.session_id || null;

    // Delete marker on /clear to reset context baseline
    // SessionEnd fires with OLD session_id before new session starts
    // This ensures clean slate for the next session
    if (reason === 'clear' && sessionId) {
      deleteMarker(sessionId);
    }

    process.exit(0);
  } catch (error) {
    process.exit(0);
  }
}

main();
