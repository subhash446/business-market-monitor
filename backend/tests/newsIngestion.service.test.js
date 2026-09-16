/**
 * Tests for newsIngestion.service.js — ingestArticle() and tagArticle().
 *
 * Covers:
 *   - Successful insert + keyword-based tagging
 *   - Deduplication (existsByUrlHash → true → skip)
 *   - Multi-industry tagging (one tag per industry, first keyword wins)
 *   - No match — article not tagged to any industry
 *   - DB error returns status='error' without throwing
 *   - Case-insensitive keyword matching
 */

jest.mock('../src/database/connection', () => ({
  pool: { execute: jest.fn() },
}));

jest.mock('../src/repositories/news.repository', () => ({
  existsByUrlHash: jest.fn(),
  create:          jest.fn(),
  createTag:       jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
}));

const { ingestArticle } = require('../src/services/newsIngestion.service');
const newsRepo           = require('../src/repositories/news.repository');

// ── Sample data ───────────────────────────────────────────────────────────────

function makeArticle(overrides = {}) {
  return {
    title:       'Crude oil price India rises sharply',
    url:         'https://example.com/article/1',
    sourceName:  'Reuters',
    publishedAt: '2026-09-15T08:00:00Z',
    summary:     'Oil prices surged on Monday amid supply concerns.',
    ...overrides,
  };
}

const KEYWORDS = [
  { id: 1, keyword: 'PET resin price',       industry_id: 1 },
  { id: 2, keyword: 'crude oil price India',  industry_id: 1 },
  { id: 5, keyword: 'plastic granule price',  industry_id: 2 },
  { id: 8, keyword: 'wheat price India',      industry_id: 3 },
  { id: 12, keyword: 'milk price India',      industry_id: 4 },
];

afterEach(() => jest.clearAllMocks());

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('newsIngestion.service — ingestArticle()', () => {

  // ── 1. Happy path ─────────────────────────────────────────────────────────

  test('1. new article — inserted and tagged to matching industry', async () => {
    newsRepo.existsByUrlHash.mockResolvedValue(false);
    newsRepo.create.mockResolvedValue({ insertId: 42 });
    newsRepo.createTag.mockResolvedValue(undefined);

    const result = await ingestArticle(makeArticle(), KEYWORDS);

    expect(result).toEqual({ status: 'inserted', newsItemId: 42 });
    expect(newsRepo.create).toHaveBeenCalledWith(
  expect.objectContaining({
    ...makeArticle(),
    publishedAt: '2026-09-15 08:00:00',
  })
);
    // 'crude oil price India' matches industry_id=1 → one tag row
    expect(newsRepo.createTag).toHaveBeenCalledWith(
      expect.objectContaining({ newsItemId: 42, industryId: 1, matchedKeywordId: 2 })
    );
  });

  // ── 2. Deduplication ─────────────────────────────────────────────────────

  test('2. duplicate URL — returns skipped/duplicate, create never called', async () => {
    newsRepo.existsByUrlHash.mockResolvedValue(true);

    const result = await ingestArticle(makeArticle(), KEYWORDS);

    expect(result).toEqual({ status: 'skipped', reason: 'duplicate' });
    expect(newsRepo.create).not.toHaveBeenCalled();
    expect(newsRepo.createTag).not.toHaveBeenCalled();
  });

  // ── 3. Multi-industry tagging ─────────────────────────────────────────────

  test('3. article matching keywords for two industries — tagged to both', async () => {
    newsRepo.existsByUrlHash.mockResolvedValue(false);
    newsRepo.create.mockResolvedValue({ insertId: 55 });
    newsRepo.createTag.mockResolvedValue(undefined);

    // Article that matches both industry 1 (crude oil) AND industry 3 (wheat)
    const article = makeArticle({
      title:   'Crude oil price India and wheat price India both surge',
      summary: 'Market update.',
    });

    await ingestArticle(article, KEYWORDS);

    const calls = newsRepo.createTag.mock.calls.map((c) => c[0]);
    const industries = calls.map((c) => c.industryId).sort();
    expect(industries).toEqual([1, 3]);
    // Both have matchedKeywordId set
    for (const call of calls) {
      expect(call.matchedKeywordId).toBeTruthy();
    }
  });

  // ── 4. No match — article not tagged ──────────────────────────────────────

  test('4. article that matches no keywords — inserted but not tagged', async () => {
    newsRepo.existsByUrlHash.mockResolvedValue(false);
    newsRepo.create.mockResolvedValue({ insertId: 99 });

    const article = makeArticle({ title: 'New tech product launch', summary: 'A new gadget.' });
    await ingestArticle(article, KEYWORDS);

    expect(newsRepo.create).toHaveBeenCalled();
    expect(newsRepo.createTag).not.toHaveBeenCalled();
  });

  // ── 5. First keyword per industry wins ────────────────────────────────────

  test('5. multiple keywords match same industry — only one tag row created', async () => {
    newsRepo.existsByUrlHash.mockResolvedValue(false);
    newsRepo.create.mockResolvedValue({ insertId: 7 });
    newsRepo.createTag.mockResolvedValue(undefined);

    // Both keyword id=1 and id=2 belong to industry_id=1
    // Article contains both: 'PET resin price' AND 'crude oil price India'
    const article = makeArticle({
      title:   'PET resin price drops as crude oil price India falls',
      summary: null,
    });

    await ingestArticle(article, KEYWORDS);

    const industryOneCalls = newsRepo.createTag.mock.calls.filter(
      (c) => c[0].industryId === 1
    );
    // Only ONE createTag call for industry 1 — first keyword wins
    expect(industryOneCalls).toHaveLength(1);
    expect(industryOneCalls[0][0].matchedKeywordId).toBe(1); // keyword id=1 appears first in KEYWORDS
  });

  // ── 6. Case-insensitive matching ──────────────────────────────────────────

  test('6. keyword match is case-insensitive', async () => {
    newsRepo.existsByUrlHash.mockResolvedValue(false);
    newsRepo.create.mockResolvedValue({ insertId: 20 });
    newsRepo.createTag.mockResolvedValue(undefined);

    const article = makeArticle({
      title:   'CRUDE OIL PRICE INDIA hits new high',
      summary: null,
    });

    await ingestArticle(article, KEYWORDS);

    expect(newsRepo.createTag).toHaveBeenCalledWith(
      expect.objectContaining({ industryId: 1 })
    );
  });

  // ── 7. DB error — returned as status='error' ──────────────────────────────

  test('7. DB error in create — returns status=error without throwing', async () => {
    newsRepo.existsByUrlHash.mockResolvedValue(false);
    newsRepo.create.mockRejectedValue(new Error('ER_LOCK_WAIT_TIMEOUT'));

    const result = await ingestArticle(makeArticle(), KEYWORDS);

    expect(result.status).toBe('error');
    expect(result.error.message).toBe('ER_LOCK_WAIT_TIMEOUT');
  });
});
