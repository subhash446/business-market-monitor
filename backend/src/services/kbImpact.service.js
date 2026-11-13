/**
 * Knowledge Base Multi-Hop Impact Analysis Service (BMM V2 — T-05).
 *
 * Responsibilities:
 *   1. Resolve directed multi-hop structural dependency chains from the
 *      existing `knowledge_base_dependencies` graph (`RAW_MATERIAL` ->
 *      intermediate `COST_DRIVER` / `RAW_MATERIAL` / `EXTERNAL_FACTOR`,
 *      directed source -> target, default maxDepth = 3, hard ceiling = 4).
 *   2. Build sanitized, bounded, token-safe `KB_IMPACT_CHAINS_JSON` payloads
 *      for background AI insight prompt construction (`T-04` trust boundary).
 *   3. Assess empirical evidence readiness & signal contradictions (stale or
 *      insufficient prices, missing news, price-vs-news divergence).
 *   4. Power read-only `GET /api/v1/materials/:materialId/impact-analysis`
 *      with strict tenant isolation, server-resolved industry scope, explicit
 *      separation between `structural_only` KB chains and empirical price/news
 *      evidence, and zero synchronous LLM invocations.
 */

const AppError = require('../utils/AppError');
const { isStrictPositiveInteger } = require('../utils/validationHelpers');
const { filterRelevantNews } = require('../utils/newsRelevance');
const {
  sanitizeInlineContext,
  sanitizeHeadlineText,
} = require('../utils/aiInsightValidation');

// Repository / sibling-service dependencies are resolved lazily inside the
// async entry points that use them so lightweight unit tests importing only
// pure prompt/chain helpers (or job tests mocking a subset of repos) never
// pull in unmocked database/connection pools at module load time.

const DEFAULT_MAX_DEPTH = 3;
const HARD_MAX_DEPTH = 4;
const DEFAULT_MAX_PATHS = 25;
const MAX_PROMPT_CHAINS = 12;
const MIN_PRICE_POINTS = 3;
const PRICE_WINDOW_DAYS = 30;
const STALE_PRICE_DAYS = 30;
const MAX_DESCRIPTION_CHARS = 180;

const ALLOWED_ENTITY_TYPES = new Set([
  'RAW_MATERIAL',
  'COST_DRIVER',
  'EXTERNAL_FACTOR',
]);

const ALLOWED_DEPENDENCY_TYPES = new Set([
  'DRIVES_COST',
  'INFLUENCES',
  'CORRELATES_WITH',
]);

function clampDepth(rawDepth, { strictInvalidThrow = false } = {}) {
  if (rawDepth === undefined || rawDepth === null || rawDepth === '') {
    return DEFAULT_MAX_DEPTH;
  }

  if (!isStrictPositiveInteger(rawDepth)) {
    if (strictInvalidThrow) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `maxDepth must be a positive integer (1 to ${HARD_MAX_DEPTH})`
      );
    }
    return DEFAULT_MAX_DEPTH;
  }

  const parsed = Number(rawDepth);
  return Math.min(HARD_MAX_DEPTH, Math.max(1, parsed));
}

function clampPaths(rawMaxPaths) {
  if (!isStrictPositiveInteger(rawMaxPaths)) {
    return DEFAULT_MAX_PATHS;
  }
  return Math.min(DEFAULT_MAX_PATHS, Math.max(1, Number(rawMaxPaths)));
}

function makeNodeKey(entityType, entityId, entityName) {
  if (isStrictPositiveInteger(entityId)) {
    return `${entityType}:id:${Number(entityId)}`;
  }
  const safeName = String(entityName || '').trim().toLowerCase();
  return `${entityType}:name:${safeName}`;
}

function normalizeEdgeRow(row, fallbackRawMaterialId, fallbackMaterialName) {
  if (!row || typeof row !== 'object') return null;

  const rawTargetType = String(row.target_entity_type || '').trim().toUpperCase();
  const targetType = ALLOWED_ENTITY_TYPES.has(rawTargetType) ? rawTargetType : null;
  if (!targetType) return null;

  const rawTargetName = row.target_entity_name || row.external_factor_name || '';
  const targetName = sanitizeInlineContext(rawTargetName, 100);
  if (!targetName) return null;

  const rawSourceType = String(row.source_entity_type || 'RAW_MATERIAL').trim().toUpperCase();
  const sourceType = ALLOWED_ENTITY_TYPES.has(rawSourceType) ? rawSourceType : 'RAW_MATERIAL';

  const sourceId = isStrictPositiveInteger(row.source_entity_id)
    ? Number(row.source_entity_id)
    : (sourceType === 'RAW_MATERIAL' && isStrictPositiveInteger(fallbackRawMaterialId)
        ? Number(fallbackRawMaterialId)
        : null);

  const targetId = isStrictPositiveInteger(row.target_entity_id)
    ? Number(row.target_entity_id)
    : null;

  const sourceName = sanitizeInlineContext(
    row.source_entity_name || (sourceType === 'RAW_MATERIAL' ? fallbackMaterialName : ''),
    100
  );
  if (!sourceName) return null;

  const rawDepType = String(row.dependency_type || 'INFLUENCES').trim().toUpperCase();
  const dependencyType = ALLOWED_DEPENDENCY_TYPES.has(rawDepType) ? rawDepType : 'INFLUENCES';

  const description = sanitizeHeadlineText(row.description || '', MAX_DESCRIPTION_CHARS);

  return {
    dependency_id: isStrictPositiveInteger(row.dependency_id) ? Number(row.dependency_id) : null,
    source_entity_type: sourceType,
    source_entity_id: sourceId,
    source_entity_name: sourceName,
    source_key: makeNodeKey(sourceType, sourceId, sourceName),
    target_entity_type: targetType,
    target_entity_id: targetId,
    target_entity_name: targetName,
    target_key: makeNodeKey(targetType, targetId, targetName),
    dependency_type: dependencyType,
    description: description || null,
  };
}

/**
 * Reconstruct bounded, cycle-free directed impact chains starting at
 * `(RAW_MATERIAL, rawMaterialId)` up to `maxDepth`.
 */
function buildImpactChainsFromEdges(
  rawEdges,
  { rawMaterialId, materialName, maxDepth = DEFAULT_MAX_DEPTH, maxPaths = DEFAULT_MAX_PATHS } = {}
) {
  const safeMaxDepth = clampDepth(maxDepth);
  const safeMaxPaths = clampPaths(maxPaths);
  const safeMaterialName = sanitizeInlineContext(materialName || '', 100);

  if (!Array.isArray(rawEdges) || rawEdges.length === 0) {
    return [];
  }

  const normalized = [];
  const seenEdgeKeys = new Set();

  for (const row of rawEdges) {
    const edge = normalizeEdgeRow(row, rawMaterialId, safeMaterialName);
    if (!edge) continue;

    // Self-loop guard
    if (edge.source_key === edge.target_key) continue;

    const dedupKey = `${edge.source_key}->${edge.target_key}:${edge.dependency_type}`;
    if (seenEdgeKeys.has(dedupKey)) continue;
    seenEdgeKeys.add(dedupKey);
    normalized.push(edge);
  }

  if (normalized.length === 0) {
    return [];
  }

  const adjacency = new Map();
  for (const edge of normalized) {
    if (!adjacency.has(edge.source_key)) {
      adjacency.set(edge.source_key, []);
    }
    adjacency.get(edge.source_key).push(edge);
  }

  const primaryRootKey = makeNodeKey('RAW_MATERIAL', rawMaterialId, safeMaterialName);
  const nameFallbackRootKey = makeNodeKey('RAW_MATERIAL', null, safeMaterialName);
  const rootKey = adjacency.has(primaryRootKey)
    ? primaryRootKey
    : (adjacency.has(nameFallbackRootKey) ? nameFallbackRootKey : null);

  if (!rootKey) {
    return [];
  }

  const rawPaths = [];

  function dfs(currentKey, visited, steps) {
    if (rawPaths.length >= safeMaxPaths) {
      return;
    }

    const outgoing = adjacency.get(currentKey) || [];
    const canExtend = steps.length < safeMaxDepth
      ? outgoing.filter((edge) => !visited.has(edge.target_key))
      : [];

    if (canExtend.length === 0) {
      if (steps.length > 0) {
        rawPaths.push(steps.slice());
      }
      return;
    }

    for (const edge of canExtend) {
      if (rawPaths.length >= safeMaxPaths) {
        break;
      }
      visited.add(edge.target_key);
      steps.push(edge);
      dfs(edge.target_key, visited, steps);
      steps.pop();
      visited.delete(edge.target_key);
    }
  }

  const initialVisited = new Set([rootKey]);
  dfs(rootKey, initialVisited, []);

  rawPaths.sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    const labelA = a.map((s) => `${s.source_entity_name}->${s.target_entity_name}`).join('|');
    const labelB = b.map((s) => `${s.source_entity_name}->${s.target_entity_name}`).join('|');
    return labelA.localeCompare(labelB);
  });

  return rawPaths.map((steps, index) => {
    const last = steps[steps.length - 1];
    const pathParts = [steps[0].source_entity_name];
    for (const s of steps) {
      pathParts.push(`--[${s.dependency_type}]--> ${s.target_entity_name}`);
    }

    return {
      chain_id: `C${index + 1}`,
      depth: steps.length,
      path_label: pathParts.join(' '),
      terminal_entity: {
        entity_type: last.target_entity_type,
        entity_id: last.target_entity_id,
        name: last.target_entity_name,
      },
      steps: steps.map((s, idx) => ({
        hop: idx + 1,
        dependency_id: s.dependency_id,
        source_entity_type: s.source_entity_type,
        source_entity_id: s.source_entity_id,
        source_name: s.source_entity_name,
        target_entity_type: s.target_entity_type,
        target_entity_id: s.target_entity_id,
        target_name: s.target_entity_name,
        dependency_type: s.dependency_type,
        description: s.description,
        evidence_nature: 'structural_only',
      })),
    };
  });
}

function extractEntitiesFromChains(chains) {
  const externalFactors = [];
  const costDrivers = [];
  const relatedMaterials = [];

  const seenEF = new Set();
  const seenCD = new Set();
  const seenRM = new Set();

  for (const chain of chains) {
    for (const step of chain.steps) {
      const name = step.target_name;
      const lower = name.toLowerCase();
      if (step.target_entity_type === 'EXTERNAL_FACTOR' && !seenEF.has(lower)) {
        seenEF.add(lower);
        externalFactors.push(name);
      } else if (step.target_entity_type === 'COST_DRIVER' && !seenCD.has(lower)) {
        seenCD.add(lower);
        costDrivers.push(name);
      } else if (step.target_entity_type === 'RAW_MATERIAL' && !seenRM.has(lower)) {
        seenRM.add(lower);
        relatedMaterials.push(name);
      }
    }
  }

  const relevanceTerms = [];
  const seenTerms = new Set();
  for (const term of [...externalFactors, ...costDrivers, ...relatedMaterials]) {
    const key = term.toLowerCase();
    if (!seenTerms.has(key)) {
      seenTerms.add(key);
      relevanceTerms.push(term);
    }
  }

  return {
    externalFactors,
    costDrivers,
    relatedMaterials,
    relevanceTerms,
  };
}

function emptyImpactResult({
  coverage,
  rawMaterialId = null,
  industryId = null,
  materialName = '',
  maxDepth = DEFAULT_MAX_DEPTH,
  errorNote = null,
}) {
  return {
    coverage,
    evidenceClassification: 'structural_only',
    traversalDirection: 'source_to_target',
    maxDepthApplied: clampDepth(maxDepth),
    rawMaterialId: isStrictPositiveInteger(rawMaterialId) ? Number(rawMaterialId) : null,
    industryId: isStrictPositiveInteger(industryId) ? Number(industryId) : null,
    materialName: sanitizeInlineContext(materialName || '', 100),
    chains: [],
    costDrivers: [],
    externalFactors: [],
    relatedMaterials: [],
    relevanceTerms: [],
    summary: {
      totalChains: 0,
      maxObservedDepth: 0,
      directCount: 0,
      indirectCount: 0,
      costDriversCount: 0,
      externalFactorsCount: 0,
    },
    ...(errorNote ? { errorNote } : {}),
  };
}

/**
 * Fetch and structure directed multi-hop KB dependencies for one material.
 * Handles custom materials (`rawMaterialId == null`), empty dependencies,
 * legacy single-hop mocks, and non-fatal repository failures gracefully.
 */
async function fetchMultiHopImpactForMaterial({
  rawMaterialId,
  industryId,
  materialName = '',
  maxDepth = DEFAULT_MAX_DEPTH,
  maxPaths = DEFAULT_MAX_PATHS,
} = {}) {
  const safeMaxDepth = clampDepth(maxDepth);
  const safeMaxPaths = clampPaths(maxPaths);

  if (!isStrictPositiveInteger(rawMaterialId)) {
    return emptyImpactResult({
      coverage: 'custom_material_no_kb_links',
      rawMaterialId: null,
      industryId,
      materialName,
      maxDepth: safeMaxDepth,
    });
  }

  if (!isStrictPositiveInteger(industryId)) {
    return emptyImpactResult({
      coverage: 'missing_industry_context',
      rawMaterialId,
      industryId: null,
      materialName,
      maxDepth: safeMaxDepth,
    });
  }

  const safeMaterialId = Number(rawMaterialId);
  const safeIndustryId = Number(industryId);
  const knowledgeBaseRepository = require('../repositories/knowledgeBase.repository');

  let rawEdges = [];
  let traversalMode = 'multi_hop_cte';

  try {
    if (typeof knowledgeBaseRepository.getMultiHopImpactEdges === 'function') {
      rawEdges = await knowledgeBaseRepository.getMultiHopImpactEdges(
        safeMaterialId,
        safeIndustryId,
        { maxDepth: safeMaxDepth, maxPaths: safeMaxPaths }
      );
    } else if (typeof knowledgeBaseRepository.getDependenciesForRawMaterial === 'function') {
      traversalMode = 'legacy_single_hop_fallback';
      rawEdges = await knowledgeBaseRepository.getDependenciesForRawMaterial(
        safeMaterialId,
        safeIndustryId
      );
    }
  } catch (err) {
    return emptyImpactResult({
      coverage: 'kb_unavailable',
      rawMaterialId: safeMaterialId,
      industryId: safeIndustryId,
      materialName,
      maxDepth: safeMaxDepth,
      errorNote: 'Knowledge Base traversal unavailable',
    });
  }

  const safeRawEdges = Array.isArray(rawEdges) ? rawEdges : [];
  const chains = buildImpactChainsFromEdges(safeRawEdges, {
    rawMaterialId: safeMaterialId,
    materialName,
    maxDepth: safeMaxDepth,
    maxPaths: safeMaxPaths,
  });

  if (chains.length === 0) {
    return emptyImpactResult({
      coverage: 'no_kb_dependencies',
      rawMaterialId: safeMaterialId,
      industryId: safeIndustryId,
      materialName,
      maxDepth: safeMaxDepth,
    });
  }

  const entities = extractEntitiesFromChains(chains);
  const maxObservedDepth = Math.max(...chains.map((c) => c.depth));
  const directCount = chains.filter((c) => c.depth === 1).length;
  const indirectCount = chains.filter((c) => c.depth >= 2).length;

  return {
    coverage: maxObservedDepth >= 2 ? 'multi_hop' : 'direct_only',
    traversalMode,
    evidenceClassification: 'structural_only',
    traversalDirection: 'source_to_target',
    maxDepthApplied: safeMaxDepth,
    rawMaterialId: safeMaterialId,
    industryId: safeIndustryId,
    materialName: sanitizeInlineContext(materialName || '', 100),
    chains,
    costDrivers: entities.costDrivers,
    externalFactors: entities.externalFactors,
    relatedMaterials: entities.relatedMaterials,
    relevanceTerms: entities.relevanceTerms,
    summary: {
      totalChains: chains.length,
      maxObservedDepth,
      directCount,
      indirectCount,
      costDriversCount: entities.costDrivers.length,
      externalFactorsCount: entities.externalFactors.length,
    },
  };
}

/**
 * Build a sanitized, token-bounded representation of multi-hop KB impact
 * chains for inclusion inside `UNTRUSTED_CONTEXT_DATA` in LLM prompts.
 */
function buildPromptKbContext(impactResult) {
  if (!impactResult || typeof impactResult !== 'object') {
    return {
      evidence_classification: 'structural_kb_only',
      note: 'Structural KB dependencies indicate possible cost pathways only, never confirmed empirical causation.',
      coverage: 'no_kb_dependencies',
      max_depth: 0,
      cost_drivers: [],
      external_factors: [],
      related_materials: [],
      impact_chains: [],
    };
  }

  const chains = Array.isArray(impactResult.chains) ? impactResult.chains : [];

  return {
    evidence_classification: 'structural_kb_only',
    note: 'Structural KB dependencies indicate possible cost pathways only, never confirmed empirical causation.',
    coverage: sanitizeInlineContext(impactResult.coverage || 'no_kb_dependencies', 40),
    max_depth: Number(impactResult.summary?.maxObservedDepth || 0),
    cost_drivers: (impactResult.costDrivers || [])
      .slice(0, 10)
      .map((name) => sanitizeInlineContext(name, 100))
      .filter(Boolean),
    external_factors: (impactResult.externalFactors || [])
      .slice(0, 12)
      .map((name) => sanitizeInlineContext(name, 100))
      .filter(Boolean),
    related_materials: (impactResult.relatedMaterials || [])
      .slice(0, 8)
      .map((name) => sanitizeInlineContext(name, 100))
      .filter(Boolean),
    impact_chains: chains.slice(0, MAX_PROMPT_CHAINS).map((chain) => ({
      depth: Number(chain.depth) || 1,
      steps: (chain.steps || []).map((step) => {
        const mapped = {
          hop: Number(step.hop) || 1,
          from: `${sanitizeInlineContext(step.source_entity_type, 20)}:${sanitizeInlineContext(step.source_name, 80)}`,
          relation: sanitizeInlineContext(step.dependency_type, 24),
          to: `${sanitizeInlineContext(step.target_entity_type, 20)}:${sanitizeInlineContext(step.target_name, 80)}`,
        };
        if (step.description) {
          mapped.description = sanitizeHeadlineText(step.description, MAX_DESCRIPTION_CHARS);
        }
        return mapped;
      }),
    })),
  };
}

/**
 * Evaluate objective empirical readiness & potential divergences between price
 * observations, news headlines, and KB structural pathways.
 */
function assessEvidenceSignals({ prices = [], newsHeadlines = [], kbImpact = null, now = new Date() } = {}) {
  const validPrices = (Array.isArray(prices) ? prices : [])
    .filter((p) => {
      if (!p || typeof p !== 'object') return false;
      if (p.is_valid === 0 || p.is_valid === false) return false;
      if (p.price === null || p.price === undefined || p.price === '') return false;
      return Number.isFinite(Number(p.price));
    })
    .slice()
    .sort((a, b) => new Date(a.recorded_at || 0) - new Date(b.recorded_at || 0));

  const validPriceCount = validPrices.length;
  const hasMinimumPriceEvidence = validPriceCount >= MIN_PRICE_POINTS;

  const latestRow = validPrices[validPrices.length - 1] || null;
  const earliestRow = validPrices[0] || null;

  let latestRecordedAt = null;
  let daysSinceLatestPrice = null;
  let isPriceStale = false;

  if (latestRow && latestRow.recorded_at) {
    const parsedDate = new Date(latestRow.recorded_at);
    if (!Number.isNaN(parsedDate.getTime())) {
      latestRecordedAt = parsedDate.toISOString();
      const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
      daysSinceLatestPrice = Math.max(0, Math.floor((nowMs - parsedDate.getTime()) / (24 * 60 * 60 * 1000)));
      isPriceStale = daysSinceLatestPrice > STALE_PRICE_DAYS;
    }
  }

  let priceDirection = 'UNKNOWN';
  let percentChange = null;

  if (validPriceCount >= 2 && earliestRow && latestRow) {
    const firstVal = Number(earliestRow.price);
    const lastVal = Number(latestRow.price);
    if (firstVal !== 0) {
      percentChange = Number((((lastVal - firstVal) / firstVal) * 100).toFixed(2));
      if (percentChange >= 1.5) priceDirection = 'UP';
      else if (percentChange <= -1.5) priceDirection = 'DOWN';
      else priceDirection = 'FLAT';
    }
  }

  const newsCount = Array.isArray(newsHeadlines) ? newsHeadlines.length : 0;
  const signalWarnings = [];
  let hasContradictorySignals = false;

  if (!hasMinimumPriceEvidence) {
    signalWarnings.push(
      `Insufficient valid price history (${validPriceCount}/${MIN_PRICE_POINTS} required data points).`
    );
  }
  if (isPriceStale) {
    signalWarnings.push(
      `Latest price observation is ${daysSinceLatestPrice} days old (stale > ${STALE_PRICE_DAYS} days).`
    );
  }
  if (kbImpact && Array.isArray(kbImpact.chains) && kbImpact.chains.length > 0 && newsCount === 0) {
    signalWarnings.push(
      'Structural KB cost pathways exist, but no relevant empirical news headlines were found for this period.'
    );
  }

  // Check intra-period price reversal or price-vs-news directional tension
  if (validPriceCount >= 3) {
    const nums = validPrices.map((p) => Number(p.price));
    const minVal = Math.min(...nums);
    const maxVal = Math.max(...nums);
    const rangePct = minVal > 0 ? ((maxVal - minVal) / minVal) * 100 : 0;
    if (priceDirection === 'FLAT' && rangePct >= 8) {
      hasContradictorySignals = true;
      signalWarnings.push(
        'Observed prices showed wide intra-period swings despite a nearly flat net change.'
      );
    }
  }

  if (newsCount > 0 && (priceDirection === 'UP' || priceDirection === 'DOWN')) {
    const joinedTitles = newsHeadlines
      .map((n) => String(n?.title || '').toLowerCase())
      .join(' ');
    const upNews = /\b(surge|rally|spike|hike|soar|rising|jump)\b/.test(joinedTitles);
    const downNews = /\b(drop|fall|slump|decline|ease|plunge|soften)\b/.test(joinedTitles);

    if ((upNews && downNews) || (priceDirection === 'DOWN' && upNews && !downNews) || (priceDirection === 'UP' && downNews && !upNews)) {
      hasContradictorySignals = true;
      signalWarnings.push(
        'Observed price direction diverges from or conflicts with headline sentiment in available news.'
      );
    }
  }

  return {
    validPriceCount,
    hasMinimumPriceEvidence,
    latestRecordedAt,
    daysSinceLatestPrice,
    isPriceStale,
    priceDirection,
    percentChange,
    newsCount,
    hasContradictorySignals,
    signalWarnings,
  };
}

/**
 * Read-only service backing `GET /api/v1/materials/:materialId/impact-analysis`.
 * Never invokes Gemini synchronously.
 */
async function getMaterialImpactAnalysis(businessId, materialIdRaw, query = {}) {
  if (!isStrictPositiveInteger(businessId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid business context');
  }
  if (!isStrictPositiveInteger(materialIdRaw)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid material ID');
  }

  const trackedMaterialId = Number(materialIdRaw);
  const maxDepth = clampDepth(query.maxDepth, { strictInvalidThrow: true });

  const materialRepository = require('../repositories/material.repository');
  const businessRepository = require('../repositories/business.repository');
  const priceRepository = require('../repositories/price.repository');
  const newsRepository = require('../repositories/news.repository');
  const aiInsightRepository = require('../repositories/aiInsight.repository');
  const aiInsightQueryService = require('./aiInsightQuery.service');

  const material = await materialRepository.findByIdForBusiness(trackedMaterialId, Number(businessId));
  if (!material) {
    throw new AppError(404, 'NOT_FOUND', 'Tracked material not found');
  }

  const business = await businessRepository.findById(Number(businessId));
  const industryId = business?.industry_id || null;

  const kbImpact = await fetchMultiHopImpactForMaterial({
    rawMaterialId: material.raw_material_id,
    industryId,
    materialName: material.name || material.custom_name,
    maxDepth,
  });

  // Load 30-day prices (plus fallback check on latest stored insight) without throwing on non-fatal reads
  const evidenceFrom = new Date(Date.now() - PRICE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  let prices = [];
  if (typeof priceRepository.findHistoryForMaterial === 'function') {
    try {
      const priceRows = await priceRepository.findHistoryForMaterial(trackedMaterialId, {
        from: evidenceFrom,
        to: null,
        limit: PRICE_WINDOW_DAYS + 5,
        offset: 0,
      });
      prices = Array.isArray(priceRows) ? priceRows : [];
    } catch {
      prices = [];
    }
  }

  let candidateNews = [];
  if (isStrictPositiveInteger(industryId) && typeof newsRepository.listRecentByIndustry === 'function') {
    try {
      const newsRows = await newsRepository.listRecentByIndustry(Number(industryId), 15);
      candidateNews = Array.isArray(newsRows) ? newsRows : [];
    } catch {
      candidateNews = [];
    }
  }

  const relevantNews = filterRelevantNews(
    candidateNews,
    material.name || material.custom_name || '',
    kbImpact.relevanceTerms,
    5
  );

  let latestAiInsight = null;
  if (typeof aiInsightRepository.findLatestByMaterial === 'function') {
    try {
      const latestRow = await aiInsightRepository.findLatestByMaterial(
        trackedMaterialId,
        Number(businessId)
      );
      if (latestRow) {
        latestAiInsight = aiInsightQueryService.formatInsight(latestRow);
      }
    } catch {
      latestAiInsight = null;
    }
  }

  const signalAssessment = assessEvidenceSignals({
    prices,
    newsHeadlines: relevantNews,
    kbImpact,
  });

  return {
    material: {
      id: material.id,
      raw_material_id: material.raw_material_id,
      name: material.name,
      unit_abbreviation: material.unit_abbreviation || null,
      is_custom: !isStrictPositiveInteger(material.raw_material_id),
      is_tracked: Boolean(material.is_tracked),
    },
    industry_id: industryId,
    kb_impact: {
      evidence_classification: kbImpact.evidenceClassification,
      coverage: kbImpact.coverage,
      traversal_direction: kbImpact.traversalDirection,
      max_depth_applied: kbImpact.maxDepthApplied,
      summary: {
        total_chains: kbImpact.summary.totalChains,
        max_observed_depth: kbImpact.summary.maxObservedDepth,
        direct_count: kbImpact.summary.directCount,
        indirect_count: kbImpact.summary.indirectCount,
        cost_drivers_count: kbImpact.summary.costDriversCount,
        external_factors_count: kbImpact.summary.externalFactorsCount,
      },
      cost_drivers: kbImpact.costDrivers,
      external_factors: kbImpact.externalFactors,
      related_materials: kbImpact.relatedMaterials,
      chains: kbImpact.chains,
      ...(kbImpact.errorNote ? { warning: kbImpact.errorNote } : {}),
    },
    empirical_evidence: {
      evidence_classification: 'observed_data_only',
      signal_assessment: {
        valid_price_count: signalAssessment.validPriceCount,
        has_minimum_price_evidence: signalAssessment.hasMinimumPriceEvidence,
        latest_recorded_at: signalAssessment.latestRecordedAt,
        days_since_latest_price: signalAssessment.daysSinceLatestPrice,
        is_price_stale: signalAssessment.isPriceStale,
        price_direction: signalAssessment.priceDirection,
        percent_change: signalAssessment.percentChange,
        news_count: signalAssessment.newsCount,
        has_contradictory_signals: signalAssessment.hasContradictorySignals,
        warnings: signalAssessment.signalWarnings,
      },
      relevant_news: relevantNews.map((item) => ({
        id: item.id || null,
        title: sanitizeHeadlineText(item.title || '', 200),
        source_name: sanitizeInlineContext(item.source_name || item.source || '', 100),
        published_at: item.published_at || null,
      })),
    },
    latest_ai_insight: latestAiInsight,
  };
}

module.exports = {
  DEFAULT_MAX_DEPTH,
  HARD_MAX_DEPTH,
  DEFAULT_MAX_PATHS,
  MAX_PROMPT_CHAINS,
  MIN_PRICE_POINTS,
  STALE_PRICE_DAYS,
  clampDepth,
  buildImpactChainsFromEdges,
  fetchMultiHopImpactForMaterial,
  buildPromptKbContext,
  assessEvidenceSignals,
  getMaterialImpactAnalysis,
};
