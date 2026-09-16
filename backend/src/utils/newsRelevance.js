const MAX_RELEVANT_NEWS = 5;

const TERM_ALIASES = {
  'PET Resin': [
    'pet resin',
    'pet polymer',
    'polyethylene terephthalate',
  ],

  'Bottle Caps': [
    'bottle cap',
    'bottle caps',
    'plastic cap',
    'plastic caps',
    'bottle closure',
    'bottle closures',
  ],

  Labels: [
    'label',
    'labels',
    'packaging label',
    'packaging labels',
  ],

  Cartons: [
    'carton',
    'cartons',
    'corrugated box',
    'corrugated boxes',
    'packaging box',
    'packaging boxes',
  ],

  'Shrink Film': [
    'shrink film',
    'shrink wrap',
    'shrink wrapping',
  ],

  'HDPE Granules': [
    'hdpe granule',
    'hdpe granules',
    'hdpe',
    'high density polyethylene',
  ],

  Polypropylene: [
    'polypropylene',
    'pp polymer',
    'pp resin',
  ],

  Masterbatch: [
    'masterbatch',
    'color masterbatch',
    'colour masterbatch',
  ],

  'Recycled Plastic': [
    'recycled plastic',
    'recycled plastics',
    'plastic recycling',
    'recycled polymer',
  ],

  Wheat: [
    'wheat',
    'wheat price',
    'wheat prices',
    'wheat market',
  ],

  Sugar: [
    'sugar',
    'sugar price',
    'sugar prices',
    'sugar market',
  ],

  'Edible Oil': [
    'edible oil',
    'edible oils',
    'vegetable oil',
    'cooking oil',
  ],

  'Packaging Material': [
    'packaging material',
    'packaging materials',
    'packaging',
  ],

  'Raw Milk': [
    'raw milk',
    'milk price',
    'milk prices',
    'milk supply',
    'milk market',
  ],

  Preservatives: [
    'preservative',
    'preservatives',
    'food preservatives',
  ],
};

const EXTERNAL_FACTOR_ALIASES = {
  'Crude Oil Prices': [
    'crude oil',
    'crude oil price',
    'crude oil prices',
    'brent crude',
    'wti crude',
    'wti',
    'brent',
  ],

  'Plastic Industry Trends': [
  'plastic industry',
  'plastic industries',
  'plastic market',
  'plastic prices',
  'plastic packaging industry',
  'plastic packaging market',
  'polymer industry',
  'polymer market',
  'polymer prices',
],

  'Government Policies': [
    'government policy',
    'government policies',
    'government regulation',
    'government regulations',
  ],

  'GST / Regulatory Changes': [
    'gst',
    'gst update',
    'gst changes',
    'tax regulation',
    'regulatory changes',
  ],

  'Fuel Price Changes': [
    'fuel price',
    'fuel prices',
    'diesel price',
    'diesel prices',
    'petrol price',
    'petrol prices',
  ],

  'Naphtha Prices': [
    'naphtha',
    'naphtha price',
    'naphtha prices',
  ],

  'Monsoon / Agri Season': [
    'monsoon',
    'monsoon forecast',
    'agriculture',
    'agricultural season',
    'crop',
    'crop prices',
  ],

  'Import / Export Restrictions': [
    'import restriction',
    'import restrictions',
    'export restriction',
    'export restrictions',
    'import ban',
    'export ban',
    'trade restriction',
  ],
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTerms(name, aliases = {}) {
  const normalizedName = String(name || '').trim();

  if (!normalizedName) {
    return [];
  }

  const configuredAliases = aliases[normalizedName] || [];

  return [...new Set([
    normalizeText(normalizedName),
    ...configuredAliases.map(normalizeText),
  ].filter(Boolean))];
}

function getMaterialTerms(materialName) {
  return getTerms(materialName, TERM_ALIASES);
}

function getExternalFactorTerms(externalFactorName) {
  return getTerms(externalFactorName, EXTERNAL_FACTOR_ALIASES);
}

function newsMatchesTerms(news, terms) {
  if (!news || !Array.isArray(terms) || terms.length === 0) {
    return false;
  }

  const searchableText = normalizeText(
    [
      news.title,
      news.summary,
      news.description,
      news.source_name,
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (!searchableText) {
    return false;
  }

  return terms.some((term) => searchableText.includes(term));
}

function isNewsRelevant(news, materialName, externalFactorNames = []) {
  const materialTerms = getMaterialTerms(materialName);

  const externalFactorTerms = externalFactorNames.flatMap(
    getExternalFactorTerms
  );

  const terms = [...new Set([
    ...materialTerms,
    ...externalFactorTerms,
  ])];

  return newsMatchesTerms(news, terms);
}

function filterRelevantNews(
  newsItems,
  materialName,
  externalFactorNames = [],
  limit = MAX_RELEVANT_NEWS
) {
  if (!Array.isArray(newsItems)) {
    return [];
  }

  const parsedLimit = Number(limit);

  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 0), MAX_RELEVANT_NEWS)
    : MAX_RELEVANT_NEWS;

  if (safeLimit === 0) {
    return [];
  }

  const seenTitles = new Set();
  const relevantNews = [];

  for (const news of newsItems) {
    if (!isNewsRelevant(news, materialName, externalFactorNames)) {
      continue;
    }

    const normalizedTitle = normalizeText(news.title);

    // Skip syndicated/duplicate stories with the same normalized title.
    if (normalizedTitle && seenTitles.has(normalizedTitle)) {
      continue;
    }

    if (normalizedTitle) {
      seenTitles.add(normalizedTitle);
    }

    relevantNews.push(news);

    if (relevantNews.length >= safeLimit) {
      break;
    }
  }

  return relevantNews;
}

module.exports = {
  MAX_RELEVANT_NEWS,
  normalizeText,
  getMaterialTerms,
  getExternalFactorTerms,
  isNewsRelevant,
  filterRelevantNews,
};