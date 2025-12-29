#!/usr/bin/env node
'use strict';

/**
 * Context Window Tracker - Self-healing context reset detection
 *
 * Fixes #177: Race condition from shared global state file
 * Fixes #178: Consolidates temp files to /tmp/ck/ namespace
 *
 * Architecture:
 * - NO global state file (was causing race conditions in concurrent sessions)
 * - All state embedded in session-specific marker files
 * - Each session is completely isolated (no shared state)
 *
 * Detection layers:
 * - Layer 1: Hook markers (explicit reset signal from PreCompact/SessionStart)
 * - Layer 2: Token drop detection (50% threshold fallback for hook failures)
 *
 * Removed:
 * - Old Layer 1 (session ID change detection) - was the BUG source
 * - Global STATE_FILE - caused race conditions in concurrent sessions
 *
 * Marker schema:
 * {
 *   sessionId: string,
 *   trigger: string,           // 'session_start_clear', 'manual', 'auto', 'new_session', 'token_drop'
 *   baselineRecorded: boolean,
 *   baseline: number,          // Token count at baseline
 *   lastTokenTotal: number,    // For token drop detection (replaces global state)
 *   timestamp: number
 * }
 *
 * @module context-tracker
 */

const fs = require('fs');
const {
  MARKERS_DIR,
  CALIBRATION_PATH,
  ensureDir,
  getMarkerPath
} = require('./ck-paths.cjs');

// Token drop threshold for Layer 2 detection (50%)
// Rationale: /compact typically reduces tokens by 60-80%, so 50% catches
// context resets while avoiding false positives from normal token accumulation.
// Exclusive: drops below (<) 50% trigger reset
const TOKEN_DROP_THRESHOLD = 0.5;

/**
 * Get smart default compact threshold based on context window size
 * Research-based defaults:
 * - 200k window: ~77.5% (155k) - confirmed from GitHub issues
 * - 1M window: ~33% (330k) - derived from user observations
 *
 * @param {number} contextWindowSize - Model's context window size
 * @returns {number} Estimated compact threshold in tokens
 */
function getDefaultCompactThreshold(contextWindowSize) {
  const KNOWN_THRESHOLDS = {
    200000: 155000,   // 77.5% - confirmed via /context showing 45k buffer
    1000000: 330000,  // 33% - 1M beta window
  };

  if (KNOWN_THRESHOLDS[contextWindowSize]) {
    return KNOWN_THRESHOLDS[contextWindowSize];
  }

  // Tiered defaults based on window size
  if (contextWindowSize >= 1000000) {
    return Math.floor(contextWindowSize * 0.33);
  }
  return Math.floor(contextWindowSize * 0.775);
}

/**
 * Read calibration data from file (recorded by PreCompact hook)
 * @returns {Object} Calibration data keyed by context window size
 */
function readCalibration() {
  try {
    if (fs.existsSync(CALIBRATION_PATH)) {
      return JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf8'));
    }
  } catch (err) {
    // Silent fail - use defaults
  }
  return {};
}

/**
 * Get compact threshold, preferring calibrated value over default
 * @param {number} contextWindowSize - Model's context window size
 * @returns {number} Compact threshold in tokens
 */
function getCompactThreshold(contextWindowSize) {
  const calibration = readCalibration();
  const key = String(contextWindowSize);

  if (calibration[key] && calibration[key].threshold > 0) {
    return calibration[key].threshold;
  }
  return getDefaultCompactThreshold(contextWindowSize);
}

/**
 * Read marker file for a session
 * Defensive: handles missing/empty/corrupt files gracefully
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Marker data or null
 */
function readMarker(sessionId) {
  try {
    const markerPath = getMarkerPath(sessionId);
    if (!fs.existsSync(markerPath)) return null;
    const data = fs.readFileSync(markerPath, 'utf8');
    if (!data.trim()) return null; // Catch empty/corrupt files
    const marker = JSON.parse(data);
    // Basic schema validation
    if (!marker || typeof marker.sessionId !== 'string') {
      return null;
    }
    return marker;
  } catch (err) {
    // Silent fail - corrupt JSON or read error
  }
  return null;
}

/**
 * Write marker file for a session
 * @param {string} sessionId - Session ID
 * @param {Object} marker - Marker data
 */
function writeMarker(sessionId, marker) {
  try {
    ensureDir(MARKERS_DIR);
    const markerPath = getMarkerPath(sessionId);
    fs.writeFileSync(markerPath, JSON.stringify(marker));
  } catch (err) {
    // Silent fail
  }
}

/**
 * Delete marker file for a session
 * @param {string} sessionId - Session ID
 */
function deleteMarker(sessionId) {
  try {
    const markerPath = getMarkerPath(sessionId);
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath);
    }
  } catch (err) {
    // Silent fail
  }
}

/**
 * Layer 2: Detect significant token drop (50%+ reduction)
 * Uses session-specific lastTokenTotal from marker (no global state)
 * @param {number} currentTotal - Current cumulative token total
 * @param {Object|null} marker - Session marker with lastTokenTotal
 * @returns {boolean} True if token drop detected
 */
function detectTokenDrop(currentTotal, marker) {
  if (!marker || !marker.lastTokenTotal || marker.lastTokenTotal <= 0 || currentTotal <= 0) {
    return false;
  }

  // Token total dropped by more than 50%
  const dropRatio = currentTotal / marker.lastTokenTotal;
  return dropRatio < TOKEN_DROP_THRESHOLD;
}

/**
 * Layer 1: Check for explicit reset marker from hooks
 * @param {Object|null} marker - Session marker
 * @returns {{ shouldReset: boolean, trigger: string|null }}
 */
function checkResetMarker(marker) {
  if (!marker) {
    return { shouldReset: false, trigger: null };
  }

  // Check if marker indicates a reset (clear/compact)
  const resetTriggers = ['clear', 'session_start_clear'];
  if (resetTriggers.includes(marker.trigger)) {
    return { shouldReset: true, trigger: marker.trigger };
  }

  return { shouldReset: false, trigger: marker.trigger };
}

/**
 * Main context tracking function with 2-layer self-healing detection
 *
 * Layer 1: Hook markers (explicit reset from PreCompact/SessionStart)
 * Layer 2: Token drop detection (50% threshold fallback)
 *
 * NO global state - all state is session-specific in marker files
 *
 * @param {Object} params - Tracking parameters
 * @param {string} params.sessionId - Current session ID
 * @param {number} params.contextInput - Input tokens
 * @param {number} params.contextOutput - Output tokens
 * @param {number} params.contextWindowSize - Model's context window size
 * @returns {Object} { percentage, baseline, showCompactIndicator, resetLayer }
 */
function trackContext({ sessionId, contextInput, contextOutput, contextWindowSize }) {
  const currentTotal = contextInput + contextOutput;
  const compactThreshold = getCompactThreshold(contextWindowSize);
  const effectiveSessionId = sessionId || 'default';

  // Read session-specific marker (no global state!)
  let marker = readMarker(effectiveSessionId);

  // Track which layer triggered reset (for debugging)
  let resetLayer = null;
  let baseline = 0;
  let showCompactIndicator = false;

  // --- Layer 1: Hook marker system ---
  // Markers from PreCompact/SessionStart hooks are explicit signals
  const { shouldReset, trigger } = checkResetMarker(marker);
  if (shouldReset) {
    resetLayer = `marker_${trigger}`;
    baseline = currentTotal;
    // Clear the reset trigger after processing
    marker = null; // Force fresh marker creation below
  }

  // --- Layer 2: Token drop detection (fallback for hook failures) ---
  if (!resetLayer && detectTokenDrop(currentTotal, marker)) {
    resetLayer = 'token_drop';
    baseline = currentTotal;
    marker = null; // Force fresh marker creation below
  }

  // --- No reset triggered - use existing marker/baseline ---
  if (!resetLayer && marker) {
    if (!marker.baselineRecorded) {
      // Marker exists but baseline not recorded yet (from PreCompact)
      marker.baselineRecorded = true;
      marker.baseline = currentTotal;
      marker.lastTokenTotal = currentTotal;
      writeMarker(effectiveSessionId, marker);
      baseline = currentTotal;
      // PreCompact triggers: "manual" (from /compact) or "auto" (from auto-compact)
      showCompactIndicator = ['compact', 'manual', 'auto'].includes(marker.trigger);
    } else {
      // Use stored baseline
      baseline = marker.baseline || 0;
    }
  }

  // --- Create fresh marker if needed ---
  if (!marker || resetLayer) {
    const newMarker = {
      sessionId: effectiveSessionId,
      trigger: resetLayer || 'new_session',
      baselineRecorded: true,
      baseline: currentTotal,
      lastTokenTotal: currentTotal,
      timestamp: Date.now()
    };
    writeMarker(effectiveSessionId, newMarker);
    if (!resetLayer) {
      baseline = currentTotal;
    }
  } else {
    // Update lastTokenTotal for next token drop detection
    marker.lastTokenTotal = currentTotal;
    writeMarker(effectiveSessionId, marker);
  }

  // Calculate effective tokens (since baseline)
  let effectiveTotal = baseline > 0 ? currentTotal - baseline : currentTotal;
  if (effectiveTotal < 0) effectiveTotal = 0;

  // Calculate percentage against compact threshold (not model limit)
  const percentage = Math.min(100, Math.floor(effectiveTotal * 100 / compactThreshold));

  return {
    percentage,
    baseline,
    effectiveTotal,
    compactThreshold,
    showCompactIndicator,
    resetLayer
  };
}

/**
 * Write reset marker for session (called by SessionStart hook on /clear)
 * @param {string} sessionId - Session ID
 * @param {string} trigger - Reset trigger ('clear', 'compact', etc.)
 */
function writeResetMarker(sessionId, trigger = 'clear') {
  const effectiveSessionId = sessionId || 'default';
  ensureDir(MARKERS_DIR);
  writeMarker(effectiveSessionId, {
    sessionId: effectiveSessionId,
    trigger: `session_start_${trigger}`,
    baselineRecorded: false,
    baseline: 0,
    lastTokenTotal: 0,
    timestamp: Date.now()
  });
}

/**
 * Clear all markers (for testing/cleanup)
 * Uses new /tmp/ck/ namespace
 */
function clearAllState() {
  const { cleanAll } = require('./ck-paths.cjs');
  cleanAll();
}

module.exports = {
  trackContext,
  writeResetMarker,
  clearAllState,
  getCompactThreshold,
  // Export for testing
  detectTokenDrop,
  checkResetMarker,
  readMarker,
  writeMarker,
  deleteMarker,
  TOKEN_DROP_THRESHOLD,
  MARKERS_DIR
};
