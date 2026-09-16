/**
 * Unit tests for gemini.provider.js (Phase H)
 *
 * All HTTP is mocked via jest.spyOn(global, 'fetch'). No real network calls.
 * Tests cover:
 *   - Successful response: JSON mode output parsed and validated correctly
 *   - Timeout: AbortError propagated as PROVIDER_TIMEOUT
 *   - Auth failure: 401/403 -> PROVIDER_AUTH
 *   - HTTP failure: non-2xx -> PROVIDER_HTTP
 *   - Parse failure: non-JSON body -> PROVIDER_PARSE
 *   - Schema validation: missing fields -> PROVIDER_INVALID
 *   - Schema validation: bad outlook value -> PROVIDER_INVALID
 *   - Schema validation: bad confidence value -> PROVIDER_INVALID
 *   - Schema validation: headline too long -> PROVIDER_INVALID
 *   - Schema validation: empty required field -> PROVIDER_INVALID
 *   - PROVIDER_HTTP includes error detail from response body when available
 *   - validateInsightSchema strips unexpected extra fields from LLM output
 */

jest.mock('../src/config/env', () => ({
  gemini: {
    apiKey:  'test-gemini-key',
    model:   'gemini-3.8-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    timeoutMs: 30000,
  },
  aiInsights: {
    enabled:   false,
    timeoutMs: 30000,
  },
}));

const { generateInsight, ProviderError } = require('../src/providers/gemini.provider');

// Minimal valid InsightResponse fixture
const VALID_INSIGHT = {
  headline:        'WTI crude oil prices rose 4% this week on supply concerns.',
  what_happened:   'WTI spot price increased from 71.2 to 74.1 over 7 days.',
  why_it_happened: 'Recent news indicates production disruptions in key regions.',
  business_impact: 'Raw material costs may increase by 3-5% in the near term.',
  outlook:         'BULLISH',
  confidence:      'MEDIUM',
};

/** Build a mock fetch response with JSON mode Gemini response body */
function mockGeminiResponse(insightObj, status = 200) {
  const body = {
    candidates: [{
      content: {
        parts: [{ text: JSON.stringify(insightObj) }],
      },
    }],
  };
  return Promise.resolve({
    ok:     status >= 200 && status < 300,
    status: status,
    json:   () => Promise.resolve(body),
  });
}

/** Build a mock fetch response returning a plain error body */
function mockErrorResponse(status, errorMessage) {
  return Promise.resolve({
    ok:     false,
    status: status,
    json:   () => Promise.resolve({ error: { message: errorMessage } }),
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('returns validated InsightResponse on success', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(VALID_INSIGHT));
  const result = await generateInsight('test prompt');
  expect(result).toEqual(VALID_INSIGHT);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('strips unexpected extra fields from LLM output', async () => {
  const withExtras = { ...VALID_INSIGHT, extra_field: 'should be removed', nested: { bad: true } };
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(withExtras));
  const result = await generateInsight('test prompt');
  expect(result).not.toHaveProperty('extra_field');
  expect(result).not.toHaveProperty('nested');
  expect(result.headline).toBe(VALID_INSIGHT.headline);
});

test('trims whitespace from text fields', async () => {
  const padded = { ...VALID_INSIGHT, headline: '  padded headline  ', what_happened: ' text ' };
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(padded));
  const result = await generateInsight('test prompt');
  expect(result.headline).toBe('padded headline');
  expect(result.what_happened).toBe('text');
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

test('throws PROVIDER_TIMEOUT on AbortError', async () => {
  const abortErr = new Error('The operation was aborted');
  abortErr.name = 'AbortError';
  jest.spyOn(global, 'fetch').mockRejectedValueOnce(abortErr);

  await expect(generateInsight('test prompt')).rejects.toMatchObject({
    name: 'ProviderError',
    code: 'PROVIDER_TIMEOUT',
  });
});

// ---------------------------------------------------------------------------
// Auth errors
// ---------------------------------------------------------------------------

test('throws PROVIDER_AUTH on 401', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) })
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_AUTH' });
});

test('throws PROVIDER_AUTH on 403', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) })
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_AUTH' });
});

// ---------------------------------------------------------------------------
// HTTP errors
// ---------------------------------------------------------------------------

test('throws PROVIDER_HTTP on 500 and includes error detail', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    mockErrorResponse(500, 'Internal Server Error')
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({
    code:    'PROVIDER_HTTP',
    message: expect.stringContaining('Internal Server Error'),
  });
});

test('throws PROVIDER_HTTP on 429 (rate limited)', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    Promise.resolve({ ok: false, status: 429, json: () => Promise.reject(new Error('no body')) })
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_HTTP' });
});

test('throws PROVIDER_HTTP on 503 (high-demand / service overloaded)', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    mockErrorResponse(503, 'The model is overloaded. Please try again later.')
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({
    code:    'PROVIDER_HTTP',
    message: expect.stringContaining('503: The model is overloaded'),
  });
});

test('throws PROVIDER_HTTP on network error', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network unreachable'));
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_HTTP' });
});

// ---------------------------------------------------------------------------
// Parse errors
// ---------------------------------------------------------------------------

test('throws PROVIDER_PARSE when response body is not JSON', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    })
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_PARSE' });
});

test('throws PROVIDER_PARSE when candidates array is missing', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ candidates: [] }) })
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_PARSE' });
});

test('throws PROVIDER_PARSE when text content in candidate is empty', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: '' }] } }],
      }),
    })
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_PARSE' });
});

test('throws PROVIDER_PARSE when text is not valid JSON', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'not json at all' }] } }],
      }),
    })
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_PARSE' });
});

// ---------------------------------------------------------------------------
// Schema validation (PROVIDER_INVALID)
// ---------------------------------------------------------------------------

test('throws PROVIDER_INVALID for invalid outlook value', async () => {
  const bad = { ...VALID_INSIGHT, outlook: 'VERY_BULLISH' };
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(bad));
  await expect(generateInsight('prompt')).rejects.toMatchObject({
    code:    'PROVIDER_INVALID',
    message: expect.stringContaining('outlook'),
  });
});

test('throws PROVIDER_INVALID for invalid confidence value', async () => {
  const bad = { ...VALID_INSIGHT, confidence: 'VERY_HIGH' };
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(bad));
  await expect(generateInsight('prompt')).rejects.toMatchObject({
    code:    'PROVIDER_INVALID',
    message: expect.stringContaining('confidence'),
  });
});

test('throws PROVIDER_INVALID when headline exceeds 500 chars', async () => {
  const bad = { ...VALID_INSIGHT, headline: 'x'.repeat(501) };
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(bad));
  await expect(generateInsight('prompt')).rejects.toMatchObject({
    code:    'PROVIDER_INVALID',
    message: expect.stringContaining('headline'),
  });
});

test('throws PROVIDER_INVALID when required field is missing', async () => {
  const { business_impact, ...bad } = VALID_INSIGHT;
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(bad));
  await expect(generateInsight('prompt')).rejects.toMatchObject({
    code:    'PROVIDER_INVALID',
    message: expect.stringContaining('business_impact'),
  });
});

test('throws PROVIDER_INVALID when required field is empty string', async () => {
  const bad = { ...VALID_INSIGHT, what_happened: '   ' };
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(bad));
  await expect(generateInsight('prompt')).rejects.toMatchObject({
    code:    'PROVIDER_INVALID',
    message: expect.stringContaining('what_happened'),
  });
});

test('throws PROVIDER_INVALID when response is not an object', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(
    Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: '"just a string"' }] } }],
      }),
    })
  );
  await expect(generateInsight('prompt')).rejects.toMatchObject({ code: 'PROVIDER_INVALID' });
});

// ---------------------------------------------------------------------------
// All 4 valid outlook values are accepted
// ---------------------------------------------------------------------------

test.each(['BEARISH', 'NEUTRAL', 'BULLISH', 'VOLATILE'])(
  'accepts valid outlook value: %s',
  async (outlook) => {
    jest.spyOn(global, 'fetch').mockReturnValueOnce(
      mockGeminiResponse({ ...VALID_INSIGHT, outlook })
    );
    const result = await generateInsight('prompt');
    expect(result.outlook).toBe(outlook);
  }
);

// ---------------------------------------------------------------------------
// All 3 valid confidence values are accepted
// ---------------------------------------------------------------------------

test.each(['LOW', 'MEDIUM', 'HIGH'])(
  'accepts valid confidence value: %s',
  async (confidence) => {
    jest.spyOn(global, 'fetch').mockReturnValueOnce(
      mockGeminiResponse({ ...VALID_INSIGHT, confidence })
    );
    const result = await generateInsight('prompt');
    expect(result.confidence).toBe(confidence);
  }
);

// ---------------------------------------------------------------------------
// Request body shape (regression: role:'user' must be present)
// ---------------------------------------------------------------------------

test('fetch request body includes role:"user" in contents (regression: missing role caused 30s stall)', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(VALID_INSIGHT));
  await generateInsight('my test prompt');

  const [_url, options] = fetch.mock.calls[0];
  const body = JSON.parse(options.body);

  // The Gemini REST API requires role:'user' on each content object.
  // Without it the server stalls the connection until the client timeout fires.
  expect(body.contents).toHaveLength(1);
  expect(body.contents[0].role).toBe('user');
  expect(body.contents[0].parts[0].text).toBe('my test prompt');
});

test('fetch options do NOT include dispatcher (undici not standalone on Node v24, dispatcher is no-op)', async () => {
  jest.spyOn(global, 'fetch').mockReturnValueOnce(mockGeminiResponse(VALID_INSIGHT));
  await generateInsight('prompt');

  const [_url, options] = fetch.mock.calls[0];
  // On Node v24, require('undici') fails -- dispatcher was removed as dead code.
  // Passing dispatcher:undefined would be silently ignored by global fetch anyway.
  expect(options).not.toHaveProperty('dispatcher');
});

