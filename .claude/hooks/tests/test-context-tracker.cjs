#!/usr/bin/env node
'use strict';

/**
 * Tests for context-tracker.cjs 2-layer self-healing detection
 *
 * Fixes #177: Tests now verify NO global state (race condition fix)
 * Fixes #178: Tests use /tmp/ck/ namespace
 */

const {
  trackContext,
  writeResetMarker,
  clearAllState,
  detectTokenDrop,
  checkResetMarker,
  readMarker,
  writeMarker,
  deleteMarker,
  TOKEN_DROP_THRESHOLD,
  MARKERS_DIR
} = require('../lib/context-tracker.cjs');

const { cleanAll } = require('../lib/ck-paths.cjs');

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, msg = '') {
  if (!condition) {
    throw new Error(msg || 'Assertion failed');
  }
}

// Clean up before tests
clearAllState();

console.log('\n=== Namespace Verification (#178) ===\n');

test('MARKERS_DIR uses /tmp/ck/ namespace', () => {
  assertTrue(
    MARKERS_DIR.includes('/ck/') || MARKERS_DIR.includes('\\ck\\'),
    `MARKERS_DIR should use /ck/ namespace: ${MARKERS_DIR}`
  );
});

console.log('\n=== Layer 1: Hook Marker System ===\n');

test('writeResetMarker creates marker with correct trigger', () => {
  writeResetMarker('marker-test', 'clear');
  const marker = readMarker('marker-test');
  assertTrue(marker !== null, 'Marker should exist');
  assertEqual(marker.trigger, 'session_start_clear', 'Trigger should be session_start_clear');
  assertEqual(marker.baselineRecorded, false, 'Baseline should not be recorded yet');
  deleteMarker('marker-test');
});

test('checkResetMarker detects clear trigger', () => {
  const marker = {
    sessionId: 'reset-check',
    trigger: 'session_start_clear',
    baselineRecorded: false,
    baseline: 0,
    lastTokenTotal: 0,
    timestamp: Date.now()
  };
  writeMarker('reset-check', marker);
  const { shouldReset, trigger } = checkResetMarker(readMarker('reset-check'));
  assertTrue(shouldReset, 'Should detect reset');
  assertEqual(trigger, 'session_start_clear', 'Trigger should match');
  deleteMarker('reset-check');
});

test('checkResetMarker ignores non-clear triggers', () => {
  const marker = {
    sessionId: 'no-reset',
    trigger: 'new_session',
    baselineRecorded: true,
    baseline: 1000,
    lastTokenTotal: 1000,
    timestamp: Date.now()
  };
  writeMarker('no-reset', marker);
  const { shouldReset } = checkResetMarker(readMarker('no-reset'));
  assertTrue(!shouldReset, 'Should not trigger reset for new_session');
  deleteMarker('no-reset');
});

console.log('\n=== Layer 2: Token Drop Detection ===\n');

test('detects 50%+ token drop', () => {
  const marker = {
    sessionId: 'drop-test',
    trigger: 'new_session',
    baselineRecorded: true,
    baseline: 0,
    lastTokenTotal: 10000,
    timestamp: Date.now()
  };
  const dropped = detectTokenDrop(4000, marker); // 40% of original = drop
  assertTrue(dropped, 'Should detect token drop below 50%');
});

test('no drop when tokens within threshold', () => {
  const marker = {
    sessionId: 'no-drop',
    trigger: 'new_session',
    baselineRecorded: true,
    baseline: 0,
    lastTokenTotal: 10000,
    timestamp: Date.now()
  };
  const dropped = detectTokenDrop(6000, marker); // 60% of original = no drop
  assertTrue(!dropped, 'Should not detect drop above 50%');
});

test('no drop when lastTokenTotal is 0', () => {
  const marker = {
    sessionId: 'zero-test',
    trigger: 'new_session',
    baselineRecorded: true,
    baseline: 0,
    lastTokenTotal: 0,
    timestamp: Date.now()
  };
  const dropped = detectTokenDrop(5000, marker);
  assertTrue(!dropped, 'Should not detect drop with no baseline');
});

test('no drop with null marker', () => {
  const dropped = detectTokenDrop(5000, null);
  assertTrue(!dropped, 'Should not detect drop with null marker');
});

console.log('\n=== Full Integration: trackContext ===\n');

// Reset state for integration tests
clearAllState();

test('fresh session creates marker and tracks from 0%', () => {
  const result = trackContext({
    sessionId: 'fresh-session',
    contextInput: 5000,
    contextOutput: 5000,
    contextWindowSize: 200000
  });

  // Baseline should be set to current total (10000)
  // Effective total = 10000 - 10000 = 0
  // Percentage should be ~0%
  assertEqual(result.percentage, 0, 'Percentage should be 0% for fresh session');
});

test('second call shows accumulated tokens', () => {
  const result = trackContext({
    sessionId: 'fresh-session',
    contextInput: 10000,
    contextOutput: 10000,
    contextWindowSize: 200000
  });

  // Baseline was 10000, current is 20000
  // Effective = 20000 - 10000 = 10000
  // Threshold ~155000 for 200k window
  // ~6% expected
  assertTrue(result.percentage > 0, 'Percentage should increase');
  assertTrue(result.percentage < 20, 'Percentage should be reasonable');
});

test('concurrent sessions are isolated (NO race condition)', () => {
  // This is the KEY test for #177 fix
  clearAllState();

  // Session A starts
  const resultA1 = trackContext({
    sessionId: 'session-A',
    contextInput: 5000,
    contextOutput: 5000,
    contextWindowSize: 200000
  });
  assertEqual(resultA1.percentage, 0, 'Session A should start at 0%');

  // Session B starts (concurrent)
  const resultB1 = trackContext({
    sessionId: 'session-B',
    contextInput: 5000,
    contextOutput: 5000,
    contextWindowSize: 200000
  });
  assertEqual(resultB1.percentage, 0, 'Session B should start at 0%');

  // Session A continues (should NOT reset due to B's presence)
  const resultA2 = trackContext({
    sessionId: 'session-A',
    contextInput: 10000,
    contextOutput: 10000,
    contextWindowSize: 200000
  });
  assertTrue(resultA2.percentage > 0, 'Session A should show progress');
  assertTrue(resultA2.resetLayer === null || resultA2.resetLayer === undefined,
    'Session A should NOT reset');

  // Session B continues (should NOT reset due to A's presence)
  const resultB2 = trackContext({
    sessionId: 'session-B',
    contextInput: 10000,
    contextOutput: 10000,
    contextWindowSize: 200000
  });
  assertTrue(resultB2.percentage > 0, 'Session B should show progress');
  assertTrue(resultB2.resetLayer === null || resultB2.resetLayer === undefined,
    'Session B should NOT reset');
});

test('token drop detection triggers reset', () => {
  clearAllState();

  // Setup: track high token count
  trackContext({
    sessionId: 'drop-test',
    contextInput: 50000,
    contextOutput: 50000,
    contextWindowSize: 200000
  });

  // Simulate: dramatic token drop (post-compaction scenario)
  const result = trackContext({
    sessionId: 'drop-test',
    contextInput: 10000,
    contextOutput: 10000, // 20k vs previous 100k = 20% = drop
    contextWindowSize: 200000
  });

  assertEqual(result.resetLayer, 'token_drop', 'Should detect token drop');
  assertEqual(result.percentage, 0, 'Percentage should reset to 0%');
});

test('explicit reset marker triggers reset', () => {
  clearAllState();

  // Setup existing session with moderate tokens
  trackContext({
    sessionId: 'marker-reset-test',
    contextInput: 10000,
    contextOutput: 10000,
    contextWindowSize: 200000
  });

  // Write reset marker (simulating SessionStart with source=clear)
  writeResetMarker('marker-reset-test', 'clear');

  // Next track call should detect and reset
  // Use similar token count to avoid triggering Layer 2 (token drop)
  const result = trackContext({
    sessionId: 'marker-reset-test',
    contextInput: 15000,
    contextOutput: 15000, // 30k vs 20k = 150% = no drop
    contextWindowSize: 200000
  });

  assertTrue(result.resetLayer && result.resetLayer.includes('marker'), 'Should detect marker reset');
  assertEqual(result.percentage, 0, 'Percentage should reset to 0%');
});

console.log('\n=== Concurrency: 3+ Sessions (#177 Critical) ===\n');

test('3 concurrent sessions remain isolated', () => {
  clearAllState();

  // All 3 sessions start
  trackContext({ sessionId: 'sess-1', contextInput: 5000, contextOutput: 5000, contextWindowSize: 200000 });
  trackContext({ sessionId: 'sess-2', contextInput: 5000, contextOutput: 5000, contextWindowSize: 200000 });
  trackContext({ sessionId: 'sess-3', contextInput: 5000, contextOutput: 5000, contextWindowSize: 200000 });

  // All 3 continue - none should reset
  const r1 = trackContext({ sessionId: 'sess-1', contextInput: 15000, contextOutput: 15000, contextWindowSize: 200000 });
  const r2 = trackContext({ sessionId: 'sess-2', contextInput: 15000, contextOutput: 15000, contextWindowSize: 200000 });
  const r3 = trackContext({ sessionId: 'sess-3', contextInput: 15000, contextOutput: 15000, contextWindowSize: 200000 });

  assertTrue(r1.percentage > 0 && !r1.resetLayer, 'Session 1 should NOT reset');
  assertTrue(r2.percentage > 0 && !r2.resetLayer, 'Session 2 should NOT reset');
  assertTrue(r3.percentage > 0 && !r3.resetLayer, 'Session 3 should NOT reset');
});

test('rapid session switching (ping-pong pattern) - original bug', () => {
  // This was the EXACT bug pattern: A→B→A→B caused constant resets
  clearAllState();

  // Initial setup
  trackContext({ sessionId: 'ping', contextInput: 5000, contextOutput: 5000, contextWindowSize: 200000 });
  trackContext({ sessionId: 'pong', contextInput: 5000, contextOutput: 5000, contextWindowSize: 200000 });

  // Rapid switching - each should accumulate, not reset
  const results = [];
  for (let i = 0; i < 5; i++) {
    results.push(trackContext({
      sessionId: i % 2 === 0 ? 'ping' : 'pong',
      contextInput: 10000 + (i * 2000),
      contextOutput: 10000 + (i * 2000),
      contextWindowSize: 200000
    }));
  }

  // None should have resetLayer (except possibly the very first call if baseline wasn't set)
  const unexpectedResets = results.filter(r => r.resetLayer);
  assertTrue(unexpectedResets.length === 0, `No resets expected, got ${unexpectedResets.length}`);
});

console.log('\n=== Edge Cases: Session ID ===\n');

test('null session ID falls back to default', () => {
  clearAllState();
  const result = trackContext({
    sessionId: null,
    contextInput: 5000,
    contextOutput: 5000,
    contextWindowSize: 200000
  });
  assertEqual(result.percentage, 0, 'Should work with null session ID');
});

test('undefined session ID falls back to default', () => {
  clearAllState();
  const result = trackContext({
    sessionId: undefined,
    contextInput: 5000,
    contextOutput: 5000,
    contextWindowSize: 200000
  });
  assertEqual(result.percentage, 0, 'Should work with undefined session ID');
});

test('empty string session ID falls back to default', () => {
  clearAllState();
  const result = trackContext({
    sessionId: '',
    contextInput: 5000,
    contextOutput: 5000,
    contextWindowSize: 200000
  });
  assertEqual(result.percentage, 0, 'Should work with empty session ID');
});

console.log('\n=== Token Drop Threshold Boundaries ===\n');

test('exactly 50% drop triggers reset (boundary)', () => {
  clearAllState();
  trackContext({ sessionId: 'boundary', contextInput: 50000, contextOutput: 50000, contextWindowSize: 200000 });

  // Exactly 50% = 50000 (threshold is < 0.5, so 50% exactly should NOT trigger)
  const result = trackContext({
    sessionId: 'boundary',
    contextInput: 25000,
    contextOutput: 25000, // 50k vs 100k = exactly 50%
    contextWindowSize: 200000
  });

  // 50% is NOT < 50%, so should NOT reset
  assertTrue(!result.resetLayer, 'Exactly 50% should NOT trigger reset');
});

test('49% (just below threshold) DOES trigger reset', () => {
  clearAllState();
  trackContext({ sessionId: 'below', contextInput: 50000, contextOutput: 50000, contextWindowSize: 200000 });

  const result = trackContext({
    sessionId: 'below',
    contextInput: 24500,
    contextOutput: 24500, // 49k vs 100k = 49%
    contextWindowSize: 200000
  });

  assertEqual(result.resetLayer, 'token_drop', '49% should trigger reset');
});

test('51% (just above threshold) does NOT trigger reset', () => {
  clearAllState();
  trackContext({ sessionId: 'above', contextInput: 50000, contextOutput: 50000, contextWindowSize: 200000 });

  const result = trackContext({
    sessionId: 'above',
    contextInput: 25500,
    contextOutput: 25500, // 51k vs 100k = 51%
    contextWindowSize: 200000
  });

  assertTrue(!result.resetLayer, '51% should NOT trigger reset');
});

console.log('\n=== Robustness: Corrupt/Missing Files ===\n');

test('handles corrupt marker JSON gracefully', () => {
  clearAllState();
  const { ensureDir, getMarkerPath } = require('../lib/ck-paths.cjs');
  ensureDir(MARKERS_DIR);

  // Write corrupt JSON
  fs.writeFileSync(getMarkerPath('corrupt'), 'not valid json{{{');

  // Should not throw, should treat as new session
  const result = trackContext({
    sessionId: 'corrupt',
    contextInput: 5000,
    contextOutput: 5000,
    contextWindowSize: 200000
  });

  assertEqual(result.percentage, 0, 'Should handle corrupt marker gracefully');
});

test('handles empty marker file gracefully', () => {
  clearAllState();
  const { ensureDir, getMarkerPath } = require('../lib/ck-paths.cjs');
  ensureDir(MARKERS_DIR);

  // Write empty file
  fs.writeFileSync(getMarkerPath('empty'), '');

  const result = trackContext({
    sessionId: 'empty',
    contextInput: 5000,
    contextOutput: 5000,
    contextWindowSize: 200000
  });

  assertEqual(result.percentage, 0, 'Should handle empty marker gracefully');
});

// Cleanup
clearAllState();

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
