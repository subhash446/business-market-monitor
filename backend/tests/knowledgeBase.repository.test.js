jest.mock('../src/database/connection', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

const { pool } = require('../src/database/connection');
const knowledgeBaseRepository = require('../src/repositories/knowledgeBase.repository');

describe('knowledgeBase.repository - getDependenciesForRawMaterial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns external-factor dependencies for a raw material', async () => {
    pool.execute.mockResolvedValueOnce([
      [
        {
          target_entity_type: 'EXTERNAL_FACTOR',
          target_entity_id: 1,
          dependency_type: 'DRIVES_COST',
          description: 'Crude oil affects PET resin cost',
          external_factor_name: 'Crude Oil Prices',
        },
      ],
    ]);

    const result =
      await knowledgeBaseRepository.getDependenciesForRawMaterial(1, 1);

    expect(result).toEqual([
      {
        target_entity_type: 'EXTERNAL_FACTOR',
        target_entity_id: 1,
        dependency_type: 'DRIVES_COST',
        description: 'Crude oil affects PET resin cost',
        external_factor_name: 'Crude Oil Prices',
      },
    ]);

    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.execute.mock.calls[0][1]).toEqual([1, 1]);
  });

  test('returns multiple external-factor dependencies', async () => {
    pool.execute.mockResolvedValueOnce([
      [
        {
          target_entity_type: 'EXTERNAL_FACTOR',
          target_entity_id: 1,
          dependency_type: 'DRIVES_COST',
          description: null,
          external_factor_name: 'Crude Oil Prices',
        },
        {
          target_entity_type: 'EXTERNAL_FACTOR',
          target_entity_id: 2,
          dependency_type: 'INFLUENCES',
          description: null,
          external_factor_name: 'Plastic Industry Trends',
        },
      ],
    ]);

    const result =
      await knowledgeBaseRepository.getDependenciesForRawMaterial(1, 1);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.external_factor_name)).toEqual([
      'Crude Oil Prices',
      'Plastic Industry Trends',
    ]);
  });

  test('returns empty array when raw material has no dependencies', async () => {
    pool.execute.mockResolvedValueOnce([[]]);

    const result =
      await knowledgeBaseRepository.getDependenciesForRawMaterial(2, 1);

    expect(result).toEqual([]);
  });

  test('uses both industryId and rawMaterialId as query parameters', async () => {
    pool.execute.mockResolvedValueOnce([[]]);

    await knowledgeBaseRepository.getDependenciesForRawMaterial(25, 7);

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE kbd.industry_id = ?'),
      [7, 25]
    );
  });

  test('propagates database errors', async () => {
    const dbError = new Error('Database unavailable');
    pool.execute.mockRejectedValueOnce(dbError);

    await expect(
      knowledgeBaseRepository.getDependenciesForRawMaterial(1, 1)
    ).rejects.toThrow('Database unavailable');
  });
});


describe('knowledgeBase.repository.getMultiHopImpactEdges()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('executes recursive CTE scoped strictly by industry_id and rawMaterialId with cycle guard', async () => {
    const sampleRows = [
      {
        dependency_id: 11,
        depth: 1,
        source_entity_type: 'RAW_MATERIAL',
        source_entity_id: 10,
        source_entity_name: 'PET Resin',
        target_entity_type: 'COST_DRIVER',
        target_entity_id: 20,
        target_entity_name: 'Transportation',
        dependency_type: 'INFLUENCES',
        description: null,
        visited_path: '|RAW_MATERIAL:10|COST_DRIVER:20|',
        edge_path: '11',
      },
      {
        dependency_id: 12,
        depth: 2,
        source_entity_type: 'COST_DRIVER',
        source_entity_id: 20,
        source_entity_name: 'Transportation',
        target_entity_type: 'EXTERNAL_FACTOR',
        target_entity_id: 30,
        target_entity_name: 'Fuel Price Changes',
        dependency_type: 'DRIVES_COST',
        description: null,
        visited_path: '|RAW_MATERIAL:10|COST_DRIVER:20|EXTERNAL_FACTOR:30|',
        edge_path: '11>12',
      },
    ];
    pool.execute.mockResolvedValueOnce([sampleRows]);

    const rows = await knowledgeBaseRepository.getMultiHopImpactEdges(10, 2);

    expect(rows).toEqual(sampleRows);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain('WITH RECURSIVE kb_walk');
    expect(sql).toContain('LOCATE(');
    expect(sql).toContain('kw.depth < 3');
    expect(sql).toContain('ORDER BY kw.depth ASC, kw.edge_path ASC');
    expect(sql).toContain('LIMIT 75');
    expect(params).toEqual([2, 10, 2]);
  });

  test('clamps maxDepth up to hard limit 4 and maxPaths up to 25', async () => {
    pool.execute.mockResolvedValueOnce([[]]);

    await knowledgeBaseRepository.getMultiHopImpactEdges(10, 2, {
      maxDepth: 99,
      maxPaths: 999,
    });

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain('kw.depth < 4');
    expect(sql).toContain('LIMIT 100');
    expect(params).toEqual([2, 10, 2]);
  });

  test('returns empty array without executing SQL for missing or invalid IDs', async () => {
    expect(await knowledgeBaseRepository.getMultiHopImpactEdges(null, 2)).toEqual([]);
    expect(await knowledgeBaseRepository.getMultiHopImpactEdges(10, null)).toEqual([]);
    expect(await knowledgeBaseRepository.getMultiHopImpactEdges('abc', 2)).toEqual([]);
    expect(await knowledgeBaseRepository.getMultiHopImpactEdges(10, 0)).toEqual([]);
    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('propagates database errors from getMultiHopImpactEdges', async () => {
    pool.execute.mockRejectedValueOnce(new Error('CTE error'));

    await expect(
      knowledgeBaseRepository.getMultiHopImpactEdges(10, 2)
    ).rejects.toThrow('CTE error');
  });
});
