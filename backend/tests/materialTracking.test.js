/**
 * Tests for Phase 6 — Material Tracking & Custom Materials (Phase 6A + Phase 6B)
 *
 * Covers:
 *   Phase 6A: Material Tracking (FR-MAT-01, FR-MAT-03, FR-MAT-04, FR-TPL-02)
 *     - GET /api/v1/materials (supporting optional query param ?trackedOnly=true)
 *     - PATCH /api/v1/materials/:materialId (toggle isTracked, edit customName/unitId on custom materials)
 *     - Reject editing customName/unitId on KB-linked materials (rawMaterialId !== null -> 400)
 *     - Strict tenant isolation (scoped by business_id, foreign access -> 404)
 *     - Verification of NO DELETE endpoint (FR-MAT-03 price history preservation)
 *
 *   Phase 6B: Custom Materials (FR-MAT-02, FR-MAT-04)
 *     - POST /api/v1/materials ({ customName, unitId }) -> 201 with isCustom: true
 *     - Validations: customName (1-150 chars), unitId (must reference existing unit)
 *     - Duplicate prevention: case-insensitive conflict check within same business -> 409
 *     - Tenant isolation: same customName allowed across different businesses
 */

'use strict';

const {
  validateUpdateMaterial,
  validateCreateMaterial,
} = require('../src/validators/material.validator');
const materialTrackingService = require('../src/services/materialTracking.service');
const materialController = require('../src/controllers/material.controller');
const materialRepository = require('../src/repositories/material.repository');
const materialsRouter = require('../src/routes/materials.routes');
const { pool } = require('../src/database/connection');
const AppError = require('../src/utils/AppError');

describe('Phase 6 — Material Tracking & Custom Materials', () => {

  // =========================================================================
  // 1. Request Body Validation — Phase 6A (validateUpdateMaterial)
  // =========================================================================
  describe('1. Request Body Validation — Phase 6A (validateUpdateMaterial)', () => {

    test('1.1 accepts { isTracked: false } and { isTracked: true }', () => {
      expect(validateUpdateMaterial({ isTracked: false })).toHaveLength(0);
      expect(validateUpdateMaterial({ isTracked: true })).toHaveLength(0);
    });

    test('1.2 accepts valid customName for custom material edit', () => {
      expect(validateUpdateMaterial({ customName: 'Recycled HDPE Flakes' })).toHaveLength(0);
    });

    test('1.3 accepts valid unitId for custom material edit', () => {
      expect(validateUpdateMaterial({ unitId: 2 })).toHaveLength(0);
    });

    test('1.4 accepts combined subset { isTracked, customName, unitId }', () => {
      const errors = validateUpdateMaterial({
        isTracked: false,
        customName: 'High Density Polyethylene',
        unitId: 3,
      });
      expect(errors).toHaveLength(0);
    });

    test('1.5 rejects empty object {} (at least one field required)', () => {
      const errors = validateUpdateMaterial({});
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('body');
      expect(errors[0].issue).toMatch(/at least one field/i);
    });

    test('1.6 rejects non-object or null bodies', () => {
      expect(validateUpdateMaterial(null)).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'body' })])
      );
      expect(validateUpdateMaterial('string')).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'body' })])
      );
      expect(validateUpdateMaterial([])).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'body' })])
      );
    });

    test('1.7 rejects unknown / disallowed fields', () => {
      const errors = validateUpdateMaterial({ isTracked: true, rawMaterialId: 5, category: 'Resins' });
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'rawMaterialId', issue: 'cannot be updated' }),
          expect.objectContaining({ field: 'category', issue: 'cannot be updated' }),
        ])
      );
    });

    test('1.8 rejects non-boolean isTracked', () => {
      expect(validateUpdateMaterial({ isTracked: 'true' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'isTracked', issue: 'must be a boolean' })])
      );
      expect(validateUpdateMaterial({ isTracked: 1 })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'isTracked', issue: 'must be a boolean' })])
      );
    });

    test('1.9 rejects empty or whitespace customName', () => {
      expect(validateUpdateMaterial({ customName: '' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'customName', issue: 'cannot be empty' })])
      );
      expect(validateUpdateMaterial({ customName: '   ' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'customName', issue: 'cannot be empty' })])
      );
    });

    test('1.10 rejects customName longer than 150 characters', () => {
      const longName = 'A'.repeat(151);
      expect(validateUpdateMaterial({ customName: longName })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'customName', issue: expect.stringContaining('150 characters') }),
        ])
      );
    });

    test('1.11 rejects invalid unitId (negative, float, string, zero)', () => {
      expect(validateUpdateMaterial({ unitId: -1 })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId', issue: 'must be a valid unit id' })])
      );
      expect(validateUpdateMaterial({ unitId: 0 })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId', issue: 'must be a valid unit id' })])
      );
      expect(validateUpdateMaterial({ unitId: 1.5 })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId', issue: 'must be a valid unit id' })])
      );
      expect(validateUpdateMaterial({ unitId: 'invalid' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId', issue: 'must be a valid unit id' })])
      );
    });

  });

  // =========================================================================
  // 2. Request Body Validation — Phase 6B (validateCreateMaterial)
  // =========================================================================
  describe('2. Request Body Validation — Phase 6B (validateCreateMaterial)', () => {

    test('2.1 accepts valid { customName, unitId }', () => {
      const errors = validateCreateMaterial({ customName: 'Recycled PET Pellets', unitId: 1 });
      expect(errors).toHaveLength(0);
    });

    test('2.2 rejects missing customName', () => {
      const errors = validateCreateMaterial({ unitId: 1 });
      expect(errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'customName', issue: 'is required' })])
      );
    });

    test('2.3 rejects empty or whitespace-only customName', () => {
      expect(validateCreateMaterial({ customName: '   ', unitId: 1 })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'customName', issue: 'is required' })])
      );
    });

    test('2.4 rejects customName longer than 150 characters', () => {
      const longName = 'B'.repeat(151);
      expect(validateCreateMaterial({ customName: longName, unitId: 1 })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'customName', issue: expect.stringContaining('150 characters') }),
        ])
      );
    });

    test('2.5 rejects missing, null, or invalid unitId', () => {
      expect(validateCreateMaterial({ customName: 'Valid Name' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId' })])
      );
      expect(validateCreateMaterial({ customName: 'Valid Name', unitId: null })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId' })])
      );
      expect(validateCreateMaterial({ customName: 'Valid Name', unitId: -3 })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId' })])
      );
      expect(validateCreateMaterial({ customName: 'Valid Name', unitId: 2.7 })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId' })])
      );
      expect(validateCreateMaterial({ customName: 'Valid Name', unitId: true })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId' })])
      );
      expect(validateCreateMaterial({ customName: 'Valid Name', unitId: [1] })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId' })])
      );
      expect(validateUpdateMaterial({ unitId: true })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId' })])
      );
      expect(validateUpdateMaterial({ unitId: '' })).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'unitId' })])
      );
    });

    test('2.6 rejects unexpected/disallowed fields in create body', () => {
      const errors = validateCreateMaterial({
        customName: 'Custom Resin',
        unitId: 1,
        isTracked: false,
        rawMaterialId: 10,
      });
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'isTracked', issue: 'is not an allowed field' }),
          expect.objectContaining({ field: 'rawMaterialId', issue: 'is not an allowed field' }),
        ])
      );
    });

  });

  // =========================================================================
  // 3. Material Tracking Service (Phase 6A: FR-MAT-01, FR-MAT-03, FR-TPL-02)
  // =========================================================================
  describe('3. Material Tracking Service — Phase 6A', () => {

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const mockTemplateRow = {
      id: 101,
      raw_material_id: 10,
      name: 'PET Resin',
      unit_abbreviation: 'kg',
      is_tracked: 1,
      external_symbol: 'WTI',
      created_at: '2026-09-01T00:00:00Z',
    };

    const mockCustomRow = {
      id: 202,
      raw_material_id: null,
      name: 'Recycled PET Flakes',
      unit_abbreviation: 'kg',
      is_tracked: 0,
      external_symbol: null,
      created_at: '2026-09-02T00:00:00Z',
    };

    test('3.1 listMaterials calls repository with trackedOnly=false by default', async () => {
      const listSpy = jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([
        mockTemplateRow,
        mockCustomRow,
      ]);

      const result = await materialTrackingService.listMaterials(42);

      expect(listSpy).toHaveBeenCalledWith(42, false);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 101,
        rawMaterialId: 10,
        name: 'PET Resin',
        unit: 'kg',
        isTracked: true,
        isCustom: false,
        externalSymbol: 'WTI',
        createdAt: '2026-09-01T00:00:00Z',
      });
      expect(result[1]).toEqual({
        id: 202,
        rawMaterialId: null,
        name: 'Recycled PET Flakes',
        unit: 'kg',
        isTracked: false,
        isCustom: true,
        externalSymbol: null,
        createdAt: '2026-09-02T00:00:00Z',
      });
    });

    test('3.2 listMaterials calls repository with trackedOnly=true when requested', async () => {
      const listSpy = jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([
        mockTemplateRow,
      ]);

      const result = await materialTrackingService.listMaterials(42, true);

      expect(listSpy).toHaveBeenCalledWith(42, true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(101);
      expect(result[0].isTracked).toBe(true);
    });

    test('3.3 updateMaterial toggles isTracked to false (FR-MAT-03: stops tracking without deleting price history)', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockTemplateRow);
      jest.spyOn(materialRepository, 'updateTrackingStatus').mockResolvedValue({
        ...mockTemplateRow,
        is_tracked: 0,
      });

      const updated = await materialTrackingService.updateMaterial(42, 101, { isTracked: false });

      expect(updated.id).toBe(101);
      expect(updated.isTracked).toBe(false);
      expect(updated.name).toBe('PET Resin');
      expect(updated.isCustom).toBe(false);
    });

    test('3.4 updateMaterial toggles isTracked to true', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockCustomRow);
      jest.spyOn(materialRepository, 'updateTrackingStatus').mockResolvedValue({
        ...mockCustomRow,
        is_tracked: 1,
      });

      const updated = await materialTrackingService.updateMaterial(42, 202, { isTracked: true });

      expect(updated.id).toBe(202);
      expect(updated.isTracked).toBe(true);
      expect(updated.isCustom).toBe(true);
    });

    test('3.5 updateMaterial enforces strict tenant isolation: throws 404 NOT_FOUND for material of another business', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(null);

      await expect(
        materialTrackingService.updateMaterial(999, 101, { isTracked: false })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Material not found',
      });
    });

    test('3.6 updateMaterial rejects attempt to change customName on KB-linked material with 400 VALIDATION_ERROR', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockTemplateRow);

      await expect(
        materialTrackingService.updateMaterial(42, 101, { customName: 'Renamed Template' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('Attempting to change customName/unitId on a KB-linked material'),
      });
    });

    test('3.7 updateMaterial rejects attempt to change unitId on KB-linked material with 400 VALIDATION_ERROR', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockTemplateRow);

      await expect(
        materialTrackingService.updateMaterial(42, 101, { unitId: 3 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('Attempting to change customName/unitId on a KB-linked material'),
      });
    });

    test('3.8 updateMaterial updates customName and unitId on custom material (rawMaterialId === null)', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockCustomRow);
      jest.spyOn(materialRepository, 'findCustomByNameForBusiness').mockResolvedValue(null);
      jest.spyOn(materialRepository, 'unitExists').mockResolvedValue(true);
      jest.spyOn(materialRepository, 'updateMaterial').mockResolvedValue({
        ...mockCustomRow,
        name: 'Premium Recycled Flakes',
        unit_abbreviation: 'tonnes',
      });

      const updated = await materialTrackingService.updateMaterial(42, 202, {
        customName: 'Premium Recycled Flakes',
        unitId: 4,
      });

      expect(updated.id).toBe(202);
      expect(updated.name).toBe('Premium Recycled Flakes');
      expect(updated.unit).toBe('tonnes');
      expect(updated.isCustom).toBe(true);
    });

    test('3.9 updateMaterial permits keeping same customName on same material without self-conflict', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockCustomRow);
      // findCustomByNameForBusiness returns self (id: 202)
      jest.spyOn(materialRepository, 'findCustomByNameForBusiness').mockResolvedValue({ id: 202 });
      jest.spyOn(materialRepository, 'unitExists').mockResolvedValue(true);
      jest.spyOn(materialRepository, 'updateMaterial').mockResolvedValue(mockCustomRow);

      const updated = await materialTrackingService.updateMaterial(42, 202, {
        customName: 'Recycled PET Flakes',
      });

      expect(updated.id).toBe(202);
    });

    test('3.10 updateMaterial rejects duplicate customName from another custom material with 409 CONFLICT', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockCustomRow);
      // findCustomByNameForBusiness returns a different material (id: 303)
      jest.spyOn(materialRepository, 'findCustomByNameForBusiness').mockResolvedValue({ id: 303 });

      await expect(
        materialTrackingService.updateMaterial(42, 202, {
          customName: 'Existing Custom Name',
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
      });
    });

    test('3.11 updateMaterial rejects unknown unitId with 400 VALIDATION_ERROR', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockCustomRow);
      jest.spyOn(materialRepository, 'unitExists').mockResolvedValue(false);

      await expect(
        materialTrackingService.updateMaterial(42, 202, { unitId: 99999 })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('unitId does not reference a known unit'),
      });
    });

  });

  // =========================================================================
  // 4. Custom Materials Service (Phase 6B: FR-MAT-02, FR-MAT-04)
  // =========================================================================
  describe('4. Custom Materials Service — Phase 6B', () => {

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('4.1 createCustomMaterial successfully creates custom material with isCustom: true', async () => {
      jest.spyOn(materialRepository, 'unitExists').mockResolvedValue(true);
      jest.spyOn(materialRepository, 'findCustomByNameForBusiness').mockResolvedValue(null);
      jest.spyOn(materialRepository, 'createCustom').mockResolvedValue({
        id: 301,
        raw_material_id: null,
        name: 'Recycled Glass Cullet',
        unit_abbreviation: 'tonnes',
        is_tracked: 1,
        external_symbol: null,
        created_at: '2026-09-03T00:00:00Z',
      });

      const material = await materialTrackingService.createCustomMaterial(42, {
        customName: '  Recycled Glass Cullet  ',
        unitId: 4,
      });

      expect(material).toEqual({
        id: 301,
        rawMaterialId: null,
        name: 'Recycled Glass Cullet',
        unit: 'tonnes',
        isTracked: true,
        isCustom: true,
        externalSymbol: null,
        createdAt: '2026-09-03T00:00:00Z',
      });
      // Verifies trim was passed to repository
      expect(materialRepository.createCustom).toHaveBeenCalledWith({
        businessId: 42,
        customName: 'Recycled Glass Cullet',
        unitId: 4,
      });
    });

    test('4.2 createCustomMaterial rejects duplicate name in same business with 409 CONFLICT', async () => {
      jest.spyOn(materialRepository, 'unitExists').mockResolvedValue(true);
      jest.spyOn(materialRepository, 'findCustomByNameForBusiness').mockResolvedValue({ id: 301 });

      await expect(
        materialTrackingService.createCustomMaterial(42, {
          customName: 'recycled glass cullet',
          unitId: 4,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
        message: expect.stringContaining('already exists for this business'),
      });
    });

    test('4.3 createCustomMaterial permits same custom material name across different businesses', async () => {
      jest.spyOn(materialRepository, 'unitExists').mockResolvedValue(true);
      // For business 88, name does NOT exist
      jest.spyOn(materialRepository, 'findCustomByNameForBusiness').mockResolvedValue(null);
      jest.spyOn(materialRepository, 'createCustom').mockResolvedValue({
        id: 302,
        raw_material_id: null,
        name: 'Recycled Glass Cullet',
        unit_abbreviation: 'tonnes',
        is_tracked: 1,
        external_symbol: null,
        created_at: '2026-09-03T00:00:00Z',
      });

      const material = await materialTrackingService.createCustomMaterial(88, {
        customName: 'Recycled Glass Cullet',
        unitId: 4,
      });

      expect(material.id).toBe(302);
      expect(materialRepository.findCustomByNameForBusiness).toHaveBeenCalledWith(88, 'Recycled Glass Cullet');
    });

    test('4.4 createCustomMaterial rejects non-existent unitId with 400 VALIDATION_ERROR', async () => {
      jest.spyOn(materialRepository, 'unitExists').mockResolvedValue(false);

      await expect(
        materialTrackingService.createCustomMaterial(42, {
          customName: 'New Material',
          unitId: 99999,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('unitId does not reference a known unit'),
      });
    });

  });

  // =========================================================================
  // 5. Controller & Route Architecture Verification
  // =========================================================================
  describe('5. Controller & Route Architecture Verification', () => {

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('5.1 listMaterials controller parses trackedOnly query flag', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        query: { trackedOnly: 'true' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      jest.spyOn(materialTrackingService, 'listMaterials').mockResolvedValue([
        { id: 1, name: 'Wheat', isTracked: true },
      ]);

      await materialController.listMaterials(req, res, next);

      expect(materialTrackingService.listMaterials).toHaveBeenCalledWith(42, true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [{ id: 1, name: 'Wheat', isTracked: true }],
        })
      );
    });

    test('5.2 updateMaterial controller passes all update fields { isTracked, customName, unitId }', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { materialId: '101' },
        body: { isTracked: false, customName: 'Updated Name', unitId: 2 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      jest.spyOn(materialTrackingService, 'updateMaterial').mockResolvedValue({
        id: 101,
        name: 'Updated Name',
        isTracked: false,
      });

      await materialController.updateMaterial(req, res, next);

      expect(materialTrackingService.updateMaterial).toHaveBeenCalledWith(
        42,
        '101',
        { isTracked: false, customName: 'Updated Name', unitId: 2 }
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 101, name: 'Updated Name' }),
        })
      );
    });

    test('5.3 addMaterial controller returns 201 Created', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        body: { customName: 'Custom Resin', unitId: 1 },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      jest.spyOn(materialTrackingService, 'createCustomMaterial').mockResolvedValue({
        id: 305,
        name: 'Custom Resin',
        isCustom: true,
      });

      await materialController.addMaterial(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 305, isCustom: true }),
        })
      );
    });

    test('5.4 materials router explicitly has NO DELETE route (satisfies FR-MAT-03)', () => {
      // Inspect router stack
      const deleteRoutes = materialsRouter.stack.filter(
        (layer) => layer.route && layer.route.methods && layer.route.methods.delete
      );
      expect(deleteRoutes).toHaveLength(0);
    });

    test('5.5 materials router mounts GET /, POST /, PATCH /:materialId, and PATCH /:materialId/external-symbol', () => {
      const routes = materialsRouter.stack
        .filter((layer) => layer.route)
        .map((layer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      expect(routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: '/', methods: expect.arrayContaining(['get']) }),
          expect.objectContaining({ path: '/', methods: expect.arrayContaining(['post']) }),
          expect.objectContaining({ path: '/:materialId', methods: expect.arrayContaining(['patch']) }),
          expect.objectContaining({
            path: '/:materialId/external-symbol',
            methods: expect.arrayContaining(['patch']),
          }),
        ])
      );
    });

  });

  // =========================================================================
  // 6. Repository Layer SQL Construction Verification
  // =========================================================================
  describe('6. Repository Layer SQL Construction Verification', () => {

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('6.1 listByBusinessId appends AND tm.is_tracked = TRUE when trackedOnly is true', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await materialRepository.listByBusinessId(15, true);

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('WHERE tm.business_id = ?');
      expect(sql).toContain('AND tm.is_tracked = TRUE');
      expect(sql).toContain('ORDER BY name ASC');
      expect(params).toEqual([15]);
    });

    test('6.2 listByBusinessId omits is_tracked filter when trackedOnly is false', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await materialRepository.listByBusinessId(15, false);

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('WHERE tm.business_id = ?');
      expect(sql).not.toContain('AND tm.is_tracked = TRUE');
      expect(params).toEqual([15]);
    });

    test('6.3 updateMaterial constructs UPDATE scoped by id AND business_id', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await materialRepository.updateMaterial(101, {
        isTracked: false,
        customName: 'Clean Name',
        unitId: 3,
      }, 42);

      // Two execute calls: one for scoped UPDATE, one for findByIdForBusiness
      expect(executeSpy).toHaveBeenCalledTimes(2);
      const [updateSql, updateParams] = executeSpy.mock.calls[0];
      const [selectSql, selectParams] = executeSpy.mock.calls[1];
      expect(updateSql).toContain('UPDATE tracked_materials SET');
      expect(updateSql).toContain('is_tracked = ?');
      expect(updateSql).toContain('custom_name = ?');
      expect(updateSql).toContain('unit_id = ?');
      expect(updateSql).toContain('WHERE id = ? AND business_id = ?');
      expect(updateParams).toEqual([false, 'Clean Name', 3, 101, 42]);
      expect(selectSql).toContain('WHERE tm.id = ? AND tm.business_id = ?');
      expect(selectParams).toEqual([101, 42]);
    });

    test('6.4 findCustomByNameForBusiness uses LOWER() and raw_material_id IS NULL', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      await materialRepository.findCustomByNameForBusiness(15, 'Recycled Resin');

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('raw_material_id IS NULL');
      expect(sql).toContain('LOWER(custom_name) = LOWER(?)');
      expect(params).toEqual([15, 'Recycled Resin']);
    });

    test('6.5 tenant-scoped mutations reject missing businessId and deny cross-tenant mutation', async () => {
      await expect(
        materialRepository.updateMaterial(101, { isTracked: false })
      ).rejects.toThrow(/businessId must be a positive integer/);
      await expect(
        materialRepository.updateTrackingStatus(101, false, null)
      ).rejects.toThrow(/businessId must be a positive integer/);
      await expect(
        materialRepository.updateExternalSymbol(101, 'WTI', undefined)
      ).rejects.toThrow(/businessId must be a positive integer/);

      // Cross-tenant attempt (wrong businessId -> affectedRows: 0) must return null and never read via findById
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([{ affectedRows: 0 }]);

      await expect(
        materialRepository.updateMaterial(101, { customName: 'Hijacked' }, 999)
      ).resolves.toBeNull();
      await expect(
        materialRepository.updateTrackingStatus(101, false, 999)
      ).resolves.toBeNull();
      await expect(
        materialRepository.updateExternalSymbol(101, 'WTI', 999)
      ).resolves.toBeNull();

      // Each rejected mutation ran only the single scoped UPDATE without falling back to unscoped SELECT
      expect(executeSpy).toHaveBeenCalledTimes(3);
      for (const [sql, params] of executeSpy.mock.calls) {
        expect(sql).toContain('AND business_id = ?');
        expect(params[params.length - 1]).toBe(999);
      }
    });

  });

});
