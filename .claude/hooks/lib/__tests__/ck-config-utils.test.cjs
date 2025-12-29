/**
 * Tests for ck-config-utils edge case handling
 * Run: node .claude/hooks/lib/__tests__/ck-config-utils.test.cjs
 */

const path = require('path');
const {
  normalizePath,
  isAbsolutePath,
  sanitizePath,
  sanitizeSlug,
  validateNamingPattern
} = require('../ck-config-utils.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${e.message}`);
    failed++;
  }
}

function assertEquals(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
  }
}

console.log('\n=== normalizePath tests ===\n');

test('trailing slashes: "plans///" → "plans"', () => {
  assertEquals(normalizePath('plans///'), 'plans');
});

test('trailing slashes: "my-plans///" → "my-plans"', () => {
  assertEquals(normalizePath('my-plans///'), 'my-plans');
});

test('empty paths: "   " → null', () => {
  assertEquals(normalizePath('   '), null);
});

test('empty string → null', () => {
  assertEquals(normalizePath(''), null);
});

test('null → null', () => {
  assertEquals(normalizePath(null), null);
});

test('undefined → null', () => {
  assertEquals(normalizePath(undefined), null);
});

test('whitespace around path trimmed', () => {
  assertEquals(normalizePath('  plans  '), 'plans');
});

console.log('\n=== isAbsolutePath tests ===\n');

test('absolute path: "/tmp/all-plans" → true', () => {
  assertEquals(isAbsolutePath('/tmp/all-plans'), true);
});

test('relative path: "plans" → false', () => {
  assertEquals(isAbsolutePath('plans'), false);
});

test('relative path: "./plans" → false', () => {
  assertEquals(isAbsolutePath('./plans'), false);
});

test('Windows absolute: "C:\\Users" → true (Linux: false)', () => {
  // On Linux, Windows paths aren't recognized as absolute - expected behavior
  const expected = process.platform === 'win32';
  assertEquals(isAbsolutePath('C:\\Users'), expected);
});

test('empty → false', () => {
  assertEquals(isAbsolutePath(''), false);
});

console.log('\n=== sanitizePath tests ===\n');

// sanitizePath needs projectRoot as second param
const projectRoot = '/home/user/project';

test('path traversal: "../../../tmp" → null (blocked)', () => {
  assertEquals(sanitizePath('../../../tmp', projectRoot), null);
});

test('absolute path respected: "/tmp/all-plans"', () => {
  const result = sanitizePath('/tmp/all-plans', projectRoot);
  assertEquals(result, '/tmp/all-plans');
});

test('relative path within project returns normalized relative', () => {
  // sanitizePath returns normalized path, not joined (joining done by caller)
  const result = sanitizePath('plans', projectRoot);
  assertEquals(result, 'plans');
});

test('null byte injection blocked', () => {
  assertEquals(sanitizePath('plans\x00evil', projectRoot), null);
});

console.log('\n=== sanitizeSlug tests ===\n');

test('invalid filename chars removed: <, >, :, ", etc.', () => {
  const result = sanitizeSlug('test<>:"/\\|?*slug');
  assertEquals(result, 'testslug');
});

test('control chars removed', () => {
  const result = sanitizeSlug('test\x00\x1fslug');
  assertEquals(result, 'testslug');
});

test('length limited to 100 chars', () => {
  const longSlug = 'a'.repeat(150);
  const result = sanitizeSlug(longSlug);
  assertEquals(result.length, 100);
});

test('empty slug returns empty (caller handles fallback)', () => {
  // sanitizeSlug returns empty, caller decides fallback
  const result = sanitizeSlug('');
  assertEquals(result, '');
});

console.log('\n=== validateNamingPattern tests ===\n');

test('valid pattern with {slug}', () => {
  const result = validateNamingPattern('251217-{slug}');
  assertEquals(result.valid, true);
});

test('pattern without {slug} → invalid', () => {
  const result = validateNamingPattern('251217-feature');
  assertEquals(result.valid, false);
  assertEquals(result.error, 'Pattern must contain {slug} placeholder');
});

test('empty pattern → invalid', () => {
  const result = validateNamingPattern('');
  assertEquals(result.valid, false);
});

test('unresolved placeholder → invalid', () => {
  const result = validateNamingPattern('{date}-{slug}');
  assertEquals(result.valid, false);
});

// Summary
console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
