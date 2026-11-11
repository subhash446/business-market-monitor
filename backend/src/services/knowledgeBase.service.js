/**
 * Industry Knowledge Base business logic (Document 2 §5.3 FR-IKB-01–05,
 * Document 3 §5 KnowledgeBaseService, Phase 5 Category Mapping).
 * Framework-agnostic — no req/res, no SQL (Document 3 §3). Read-only (OI-1).
 */
const knowledgeBaseRepository = require('../repositories/knowledgeBase.repository');
const { getMaterialsForIndustry } = require('../config/industryMaterialMapping');
const AppError = require('../utils/AppError');

function parseIndustryId(industryId) {
  const id = Number(industryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'industryId must be a valid positive integer');
  }
  return id;
}

async function listIndustries() {
  const industries = await knowledgeBaseRepository.listIndustries();
  return industries.map(toPublicIndustry);
}

async function getIndustry(industryIdRaw) {
  const industryId = parseIndustryId(industryIdRaw);
  const industry = await knowledgeBaseRepository.findIndustryById(industryId);
  if (!industry) {
    throw new AppError(404, 'NOT_FOUND', 'Industry not found');
  }
  return toPublicIndustry(industry);
}

async function getIndustryMaterials(industryIdRaw) {
  const industryId = parseIndustryId(industryIdRaw);
  const industry = await knowledgeBaseRepository.findIndustryById(industryId);
  if (!industry) {
    throw new AppError(404, 'NOT_FOUND', 'Industry not found');
  }

  const mappedMaterials = getMaterialsForIndustry(industry.slug || industry.name);
  return {
    industryId: industry.id,
    industryName: industry.name,
    industrySlug: industry.slug,
    isLightweightTemplate: !!industry.is_lightweight_template,
    materials: mappedMaterials,
  };
}

async function getIndustryKnowledgeBase(industryIdRaw) {
  const industryId = parseIndustryId(industryIdRaw);
  const industry = await knowledgeBaseRepository.findIndustryById(industryId);
  if (!industry) {
    throw new AppError(404, 'NOT_FOUND', 'Industry not found');
  }

  const [rawMaterials, costDrivers, externalFactors, newsKeywords, dependencies] = await Promise.all([
    knowledgeBaseRepository.getRawMaterialsByIndustry(industryId),
    knowledgeBaseRepository.getCostDriversByIndustry(industryId),
    knowledgeBaseRepository.getExternalFactorsByIndustry(industryId),
    knowledgeBaseRepository.getNewsKeywordsByIndustry(industryId),
    knowledgeBaseRepository.getDependenciesByIndustry(industryId),
  ]);

  const mappedConfig = getMaterialsForIndustry(industry.slug || industry.name);
  const configMap = new Map(mappedConfig.map((m) => [m.name.toLowerCase(), m]));

  return {
    industryId,
    rawMaterials: rawMaterials.map((m) => {
      const config = configMap.get(m.name.toLowerCase()) || {};
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        defaultUnit: m.unit_abbreviation,
        externalSymbol: m.default_external_symbol || config.defaultExternalSymbol || null,
        sourceType: config.sourceType || 'SUPPLIER_QUOTE',
        sourceName: config.sourceName || 'Direct Supplier Quote',
        isProxy: !!config.isProxy,
        hasAutomatedFeed: !!(m.default_external_symbol || config.defaultExternalSymbol),
        disclaimer: config.disclaimer || null,
      };
    }),
    costDrivers: costDrivers.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    externalFactors: externalFactors.map((f) => ({ id: f.id, name: f.name, description: f.description })),
    newsKeywords: newsKeywords.map((k) => ({ id: k.id, keyword: k.keyword })),
    dependencies: dependencies.map((d) => ({
      sourceType: d.source_entity_type,
      sourceId: d.source_entity_id,
      targetType: d.target_entity_type,
      targetId: d.target_entity_id,
      dependencyType: d.dependency_type,
      description: d.description,
    })),
  };
}

async function listUnitsOfMeasurement() {
  const units = await knowledgeBaseRepository.listUnitsOfMeasurement();
  return units.map((u) => ({ id: u.id, name: u.name, abbreviation: u.abbreviation }));
}

function toPublicIndustry(industry) {
  return {
    id: industry.id,
    name: industry.name,
    slug: industry.slug,
    isAnchor: !!industry.is_anchor,
    isLightweightTemplate: !!industry.is_lightweight_template,
    description: industry.description,
  };
}

module.exports = {
  listIndustries,
  getIndustry,
  getIndustryMaterials,
  getIndustryKnowledgeBase,
  listUnitsOfMeasurement,
};
