import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { resolveApiBase } from '../src/api/client.js';

describe('resolveApiBase()', () => {
  test('falls back to /api/v1 when VITE_API_BASE_URL is undefined or unset', () => {
    assert.equal(resolveApiBase(undefined), '/api/v1');
  });

  test('falls back to /api/v1 when VITE_API_BASE_URL is null', () => {
    assert.equal(resolveApiBase(null), '/api/v1');
  });

  test('falls back to /api/v1 when VITE_API_BASE_URL is empty or whitespace', () => {
    assert.equal(resolveApiBase(''), '/api/v1');
    assert.equal(resolveApiBase('   '), '/api/v1');
  });

  test('appends /api/v1 to a base URL without trailing slash', () => {
    const result = resolveApiBase('https://business-market-monitor-api.onrender.com');
    assert.equal(result, 'https://business-market-monitor-api.onrender.com/api/v1');
  });

  test('normalizes trailing slash so no double-slash bug occurs', () => {
    const result = resolveApiBase('https://business-market-monitor-api.onrender.com/');
    assert.equal(result, 'https://business-market-monitor-api.onrender.com/api/v1');
  });

  test('normalizes multiple trailing slashes and whitespace', () => {
    const result = resolveApiBase('  https://business-market-monitor-api.onrender.com///  ');
    assert.equal(result, 'https://business-market-monitor-api.onrender.com/api/v1');
  });

  test('does not duplicate /api/v1 if the base URL already includes it', () => {
    assert.equal(
      resolveApiBase('https://business-market-monitor-api.onrender.com/api/v1'),
      'https://business-market-monitor-api.onrender.com/api/v1'
    );
    assert.equal(
      resolveApiBase('https://business-market-monitor-api.onrender.com/api/v1/'),
      'https://business-market-monitor-api.onrender.com/api/v1'
    );
  });
});

