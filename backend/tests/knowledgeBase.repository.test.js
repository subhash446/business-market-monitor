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