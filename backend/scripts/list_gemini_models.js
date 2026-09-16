/**
 * list_gemini_models.js -- safe read-only Gemini diagnostic
 *
 * Issues a single GET to list available Gemini models for your API key.
 * No content is generated. No tokens are consumed. No prompt is sent.
 *
 * Usage:
 *   $env:GEMINI_API_KEY = "your-key-here"
 *   node scripts/list_gemini_models.js
 *
 * Output: model names that support generateContent, sorted alphabetically.
 * Use the correct name as GEMINI_MODEL in your .env or shell session.
 *
 * SECURITY: The API key is read from the shell env only. It is appended
 * to the URL as a query param (Gemini REST spec) but is NEVER printed.
 */

'use strict';

if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '') {
  console.error('ERROR: GEMINI_API_KEY not set.');
  console.error('  $env:GEMINI_API_KEY = "your-key-here"');
  process.exit(1);
}

const baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
const url = baseUrl + '/models?key=' + process.env.GEMINI_API_KEY;

console.log('\nQuerying Gemini model list (GET /v1beta/models)...');
console.log('Base URL:', baseUrl);

(async () => {
  let resp;
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
  } catch (err) {
    console.error('Network error:', err.message);
    process.exit(1);
  }

  if (!resp.ok) {
    let detail = '';
    try {
      const body = await resp.json();
      detail = body?.error?.message ?? '';
    } catch (_) {}
    console.error('HTTP', resp.status, detail || '(no detail)');
    process.exit(1);
  }

  const body = await resp.json();
  const models = body.models ?? [];

  const generateContent = models.filter(m =>
    Array.isArray(m.supportedGenerationMethods) &&
    m.supportedGenerationMethods.includes('generateContent')
  );

  const others = models.filter(m =>
    !Array.isArray(m.supportedGenerationMethods) ||
    !m.supportedGenerationMethods.includes('generateContent')
  );

  console.log('\n=== Models supporting generateContent (' + generateContent.length + ') ===');
  generateContent
    .map(m => m.name)
    .sort()
    .forEach(name => console.log(' ', name));

  if (others.length > 0) {
    console.log('\n=== Other models (no generateContent) (' + others.length + ') ===');
    others.map(m => m.name).sort().forEach(name => console.log(' ', name));
  }

  console.log('\nSet the correct model in your shell:');
  console.log('  $env:GEMINI_MODEL = "<name-from-list-above>"');
  console.log('  node scripts/verify_ai_insights.js\n');
})();
