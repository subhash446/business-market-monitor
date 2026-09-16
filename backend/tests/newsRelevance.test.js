const {
  MAX_RELEVANT_NEWS,
  normalizeText,
  getMaterialTerms,
  getExternalFactorTerms,
  isNewsRelevant,
  filterRelevantNews,
} = require('../src/utils/newsRelevance');

describe('newsRelevance', () => {
  describe('normalizeText', () => {
    test('normalizes case, punctuation and whitespace', () => {
      expect(normalizeText('  Crude-Oil   PRICE!  ')).toBe(
        'crude-oil price'
      );
    });

    test('handles null and undefined safely', () => {
      expect(normalizeText(null)).toBe('');
      expect(normalizeText(undefined)).toBe('');
    });
  });

  describe('getMaterialTerms', () => {
    test('returns aliases for a known material', () => {
      const terms = getMaterialTerms('Bottle Caps');

      expect(terms).toContain('bottle caps');
      expect(terms).toContain('bottle cap');
      expect(terms).toContain('bottle closure');
    });

    test('returns normalized material name for unknown material', () => {
      expect(getMaterialTerms('Custom Material')).toContain(
        'custom material'
      );
    });

    test('returns empty array for empty material name', () => {
      expect(getMaterialTerms('')).toEqual([]);
    });
  });

  describe('getExternalFactorTerms', () => {
    test('returns aliases for crude oil prices', () => {
      const terms = getExternalFactorTerms('Crude Oil Prices');

      expect(terms).toContain('crude oil prices');
      expect(terms).toContain('brent crude');
      expect(terms).toContain('wti');
    });

    test('returns normalized name for unknown external factor', () => {
      expect(
        getExternalFactorTerms('Custom Market Factor')
      ).toContain('custom market factor');
    });
  });

  describe('isNewsRelevant', () => {
    test('matches a material name', () => {
      const news = {
        title: 'PET Resin prices increase in India',
        summary: 'Polymer prices rise amid supply concerns',
      };

      expect(
        isNewsRelevant(news, 'PET Resin', [])
      ).toBe(true);
    });

    test('matches an external factor alias', () => {
      const news = {
        title: 'Brent crude rises as supply concerns grow',
        summary: 'Global oil markets remain volatile',
      };

      expect(
        isNewsRelevant(news, 'PET Resin', ['Crude Oil Prices'])
      ).toBe(true);
    });

    test('rejects unrelated news', () => {
      const news = {
        title: 'Sugar prices rise in India',
        summary: 'Domestic sugar markets see higher prices',
      };

      expect(
        isNewsRelevant(news, 'Bottle Caps', ['Crude Oil Prices'])
      ).toBe(false);
    });

    test('matches against summary when title does not match', () => {
      const news = {
        title: 'Manufacturing costs under pressure',
        summary: 'PET resin prices increased sharply this week',
      };

      expect(
        isNewsRelevant(news, 'PET Resin', [])
      ).toBe(true);
    });

    test('handles missing news safely', () => {
      expect(
        isNewsRelevant(null, 'PET Resin', [])
      ).toBe(false);
    });

    test('handles news with no searchable content', () => {
      expect(
        isNewsRelevant({}, 'PET Resin', ['Crude Oil Prices'])
      ).toBe(false);
    });
  });

  describe('filterRelevantNews', () => {
    const news = [
      {
        title: 'Sugar prices increase',
        summary: 'Sugar market sees higher prices',
      },
      {
        title: 'Brent crude rises',
        summary: 'Oil prices increase globally',
      },
      {
        title: 'PET resin prices increase',
        summary: 'Polymer market remains firm',
      },
      {
        title: 'Milk prices increase',
        summary: 'Dairy market sees price pressure',
      },
      {
        title: 'WTI crude remains volatile',
        summary: 'Oil market remains uncertain',
      },
      {
        title: 'Packaging industry expands',
        summary: 'Packaging demand increases',
      },
    ];

    test('returns only relevant material news', () => {
      const result = filterRelevantNews(
        news,
        'PET Resin',
        ['Crude Oil Prices']
      );

      expect(result).toHaveLength(3);

      expect(result.map((item) => item.title)).toEqual([
        'Brent crude rises',
        'PET resin prices increase',
        'WTI crude remains volatile',
      ]);
    });

    test('limits results to five articles', () => {
      const manyNews = Array.from({ length: 10 }, (_, index) => ({
        title: `PET resin price update ${index + 1}`,
        summary: 'PET resin market update',
      }));

      const result = filterRelevantNews(
        manyNews,
        'PET Resin',
        []
      );

      expect(result).toHaveLength(MAX_RELEVANT_NEWS);
      expect(result).toHaveLength(5);
    });

    test('returns empty array when no news is relevant', () => {
      const result = filterRelevantNews(
        [
          {
            title: 'Milk prices rise',
            summary: 'Dairy market update',
          },
        ],
        'Bottle Caps',
        ['Crude Oil Prices']
      );

      expect(result).toEqual([]);
    });

    test('returns empty array for invalid news input', () => {
      expect(
        filterRelevantNews(null, 'PET Resin', [])
      ).toEqual([]);

      expect(
        filterRelevantNews('invalid', 'PET Resin', [])
      ).toEqual([]);
    });

    test('respects a lower requested limit', () => {
      const result = filterRelevantNews(
        news,
        'PET Resin',
        ['Crude Oil Prices'],
        2
      );

      expect(result).toHaveLength(2);
    });

    test('does not allow a requested limit above the maximum', () => {
      const manyNews = Array.from({ length: 10 }, (_, index) => ({
        title: `PET resin price update ${index + 1}`,
      }));

      const result = filterRelevantNews(
        manyNews,
        'PET Resin',
        [],
        100
      );

      expect(result).toHaveLength(5);
    });

    test('returns empty array when limit is zero', () => {
      const result = filterRelevantNews(
        news,
        'PET Resin',
        [],
        0
      );

      expect(result).toEqual([]);
    });
  });
});
test('deduplicates relevant news with the same normalized title', () => {
  const news = [
    {
      title: 'Plast Pack 2026 to Give Major Boost to Plastic & Packaging Industry',
      summary: 'Plastic and packaging industry event',
      source_name: 'Outlook Business',
    },
    {
      title: 'Plast Pack 2026 to Give Major Boost to Plastic & Packaging Industry',
      summary: 'Plastic and packaging industry event',
      source_name: 'NewsX',
    },
    {
      title: 'Plastic Industry Market Prices Rise',
      summary: 'Polymer prices increased',
      source_name: 'Reuters',
    },
  ];

  const result = filterRelevantNews(
    news,
    'PET Resin',
    ['Plastic Industry Trends'],
    5
  );

  expect(result).toHaveLength(2);
  expect(result[0].source_name).toBe('Outlook Business');
  expect(result[1].source_name).toBe('Reuters');
});