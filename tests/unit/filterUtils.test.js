const {
  applyFilters,
  parseFilterExpression,
  applyFilter,
  deduplicateByLatest,
} = require('../../js/filterUtils');

describe('filterUtils', () => {
  const analyses = [
    { id: 1, analysisType: 'SNV', sampleId: 'sample1', score: 10 },
    { id: 2, analysisType: 'CNV', sampleId: 'sample2', score: 20 },
    { id: 3, analysisType: 'SNV', sampleId: 'sample3', score: 15 },
    { id: 4, analysisType: 'SV', sampleId: 'sample1', score: 25 },
  ];

  describe('parseFilterExpression', () => {
    test('should parse equality filter expression correctly', () => {
      const filter = parseFilterExpression('analysisType=SNV');
      expect(filter).toEqual({
        field: 'analysisType',
        operator: '=',
        value: 'SNV',
      });
    });

    test('should parse inequality filter expression correctly', () => {
      const filter = parseFilterExpression('analysisType!=CNV');
      expect(filter).toEqual({
        field: 'analysisType',
        operator: '!=',
        value: 'CNV',
      });
    });

    test('should parse greater than filter expression correctly', () => {
      const filter = parseFilterExpression('score>15');
      expect(filter).toEqual({ field: 'score', operator: '>', value: '15' });
    });

    test('should parse less than filter expression correctly', () => {
      const filter = parseFilterExpression('score<20');
      expect(filter).toEqual({ field: 'score', operator: '<', value: '20' });
    });

    test('should parse greater-than-or-equal operator correctly', () => {
      const filter = parseFilterExpression('quality>=95');
      expect(filter).toEqual({
        field: 'quality',
        operator: '>=',
        value: '95',
      });
    });

    test('should parse less-than-or-equal operator correctly', () => {
      const filter = parseFilterExpression('quality<=98');
      expect(filter).toEqual({
        field: 'quality',
        operator: '<=',
        value: '98',
      });
    });

    test('should parse contains operator correctly', () => {
      const filter = parseFilterExpression('enrichmentKitName~=TwistExome');
      expect(filter).toEqual({
        field: 'enrichmentKitName',
        operator: '~=',
        value: 'TwistExome',
      });
    });

    test('should parse starts-with operator correctly', () => {
      const filter = parseFilterExpression('enrichmentKitName^=TwistExome');
      expect(filter).toEqual({
        field: 'enrichmentKitName',
        operator: '^=',
        value: 'TwistExome',
      });
    });

    test('should trim whitespace from value', () => {
      const filter = parseFilterExpression('sampleId= sample1 ');
      expect(filter).toEqual({
        field: 'sampleId',
        operator: '=',
        value: 'sample1',
      });
    });

    test('should throw error for invalid filter expression', () => {
      expect(() => parseFilterExpression('invalid')).toThrow(
        'Invalid filter expression: invalid',
      );
      expect(() => parseFilterExpression('field=')).toThrow(
        'Invalid filter expression: field=',
      );
    });
  });

  describe('applyFilter', () => {
    test('should apply equality filter correctly', () => {
      const filter = { field: 'analysisType', operator: '=', value: 'SNV' };
      const filtered = applyFilter(analyses, filter);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual([1, 3]);
    });

    test('should apply inequality filter correctly', () => {
      const filter = { field: 'analysisType', operator: '!=', value: 'SNV' };
      const filtered = applyFilter(analyses, filter);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual([2, 4]);
    });

    test('should apply greater than filter correctly', () => {
      const filter = { field: 'score', operator: '>', value: '15' };
      const filtered = applyFilter(analyses, filter);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual([2, 4]);
    });

    test('should apply less than filter correctly', () => {
      const filter = { field: 'score', operator: '<', value: '20' };
      const filtered = applyFilter(analyses, filter);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual([1, 3]);
    });

    test('should apply greater-than-or-equal filter correctly', () => {
      const filter = { field: 'score', operator: '>=', value: '15' };
      const filtered = applyFilter(analyses, filter);
      expect(filtered).toHaveLength(3);
      expect(filtered.map((a) => a.id)).toEqual([2, 3, 4]);
    });

    test('should apply less-than-or-equal filter correctly', () => {
      const filter = { field: 'score', operator: '<=', value: '20' };
      const filtered = applyFilter(analyses, filter);
      expect(filtered).toHaveLength(3);
      expect(filtered.map((a) => a.id)).toEqual([1, 2, 3]);
    });

    test('should use lexicographic comparison for > with strings', () => {
      const data = [
        { id: 1, sampleId: 'LB24-0001' },
        { id: 2, sampleId: 'LB25-0001' },
        { id: 3, sampleId: 'LB25-1234' },
      ];
      const filter = { field: 'sampleId', operator: '>', value: 'LB25-0000' };
      const filtered = applyFilter(data, filter);
      // Lexicographic: 'LB25-0001' > 'LB25-0000' and 'LB25-1234' > 'LB25-0000'
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual([2, 3]);
    });

    test('should compare strings lexicographically not numerically', () => {
      const data = [
        { id: 1, sampleId: 'LB25-9' },
        { id: 2, sampleId: 'LB25-10' },
      ];
      const filter = { field: 'sampleId', operator: '>', value: 'LB25-9' };
      // Lexicographic: 'LB25-10' < 'LB25-9' (char '1' < '9')
      // This is a known limitation: > < are NOT numeric-aware
      const filtered = applyFilter(data, filter);
      expect(filtered).toHaveLength(0);
    });

    test('should apply contains filter correctly', () => {
      const kitAnalyses = [
        { enrichmentKitName: 'TwistExomev0.2 (size 37484908bp)' },
        { enrichmentKitName: 'TwistExomev2' },
        { enrichmentKitName: 'NimagenHEST_hg38_v2' },
        { enrichmentKitName: 'TwistCancerv0.2' },
      ];
      const filter = {
        field: 'enrichmentKitName',
        operator: '~=',
        value: 'TwistExome',
      };
      const filtered = applyFilter(kitAnalyses, filter);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.enrichmentKitName)).toEqual([
        'TwistExomev0.2 (size 37484908bp)',
        'TwistExomev2',
      ]);
    });

    test('should apply starts-with filter correctly', () => {
      const kitAnalyses = [
        { enrichmentKitName: 'TwistExomev0.2 (size 37484908bp)' },
        { enrichmentKitName: 'TwistExomev2' },
        { enrichmentKitName: 'NimagenHEST_hg38_v2' },
        { enrichmentKitName: 'TwistCancerv0.2' },
      ];
      const filter = {
        field: 'enrichmentKitName',
        operator: '^=',
        value: 'TwistExome',
      };
      const filtered = applyFilter(kitAnalyses, filter);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.enrichmentKitName)).toEqual([
        'TwistExomev0.2 (size 37484908bp)',
        'TwistExomev2',
      ]);
    });

    test('should handle null/undefined fields with contains operator', () => {
      const data = [
        { enrichmentKitName: 'TwistExomev2' },
        { enrichmentKitName: null },
        { enrichmentKitName: undefined },
        {},
      ];
      const filter = {
        field: 'enrichmentKitName',
        operator: '~=',
        value: 'Twist',
      };
      const filtered = applyFilter(data, filter);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].enrichmentKitName).toBe('TwistExomev2');
    });

    test('should handle null/undefined fields with starts-with operator', () => {
      const data = [
        { enrichmentKitName: 'TwistExomev2' },
        { enrichmentKitName: null },
        {},
      ];
      const filter = {
        field: 'enrichmentKitName',
        operator: '^=',
        value: 'Twist',
      };
      const filtered = applyFilter(data, filter);
      expect(filtered).toHaveLength(1);
    });

    test('should throw error for unsupported operator', () => {
      const filter = { field: 'score', operator: '%%', value: '15' };
      expect(() => applyFilter(analyses, filter)).toThrow(
        'Unsupported operator: %%',
      );
    });
  });

  describe('applyFilters', () => {
    test('should apply a single equality filter', () => {
      const filtered = applyFilters(analyses, ['analysisType=SNV']);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual([1, 3]);
    });

    test('should apply multiple filters in sequence', () => {
      const filtered = applyFilters(analyses, ['sampleId=sample1', 'score>5']);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual([1, 4]);
    });

    test('should return empty array when no analyses match filters', () => {
      const filtered = applyFilters(analyses, ['analysisType=INVALID']);
      expect(filtered).toHaveLength(0);
    });

    test('should return all analyses when no filters provided', () => {
      const filtered = applyFilters(analyses, []);
      expect(filtered).toHaveLength(4);
      expect(filtered).toEqual(analyses);
    });

    test('should handle complex filtering scenarios', () => {
      const filtered = applyFilters(analyses, [
        'score<25',
        'analysisType!=CNV',
      ]);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((a) => a.id)).toEqual([1, 3]);
    });

    test('should apply multiple filters with AND logic', () => {
      const data = [
        { id: 1, analysisType: 'SNV', enrichmentKitName: 'TwistExomev2' },
        { id: 2, analysisType: 'SNV', enrichmentKitName: 'NimagenHEST' },
        { id: 3, analysisType: 'CNV', enrichmentKitName: 'TwistExomev2' },
      ];
      // Both filters must match (AND): only id=1 is SNV AND TwistExome
      const filtered = applyFilters(data, [
        'analysisType=SNV',
        'enrichmentKitName^=TwistExome',
      ]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(1);
    });

    test('should combine enrichment kit filter with analysis type', () => {
      const data = [
        {
          id: 1,
          analysisType: 'SNV',
          enrichmentKitName: 'TwistExomev2',
        },
        {
          id: 2,
          analysisType: 'SNV',
          enrichmentKitName: 'NimagenHEST_hg38_v2',
        },
        {
          id: 3,
          analysisType: 'CNV',
          enrichmentKitName: 'TwistExomev2',
        },
      ];
      const filtered = applyFilters(data, [
        'analysisType=SNV',
        'enrichmentKitName^=TwistExome',
      ]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(1);
    });
  });

  describe('deduplicateByLatest', () => {
    const mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should keep only the highest analysis ID per personLimsId', () => {
      const data = [
        { id: 100, personLimsId: 'LIMS-001', sampleId: 'S1' },
        { id: 200, personLimsId: 'LIMS-001', sampleId: 'S1wdh' },
        { id: 150, personLimsId: 'LIMS-002', sampleId: 'S2' },
      ];
      const result = deduplicateByLatest(data, mockLogger);
      expect(result).toHaveLength(2);
      expect(result.find((a) => a.personLimsId === 'LIMS-001').id).toBe(200);
      expect(result.find((a) => a.personLimsId === 'LIMS-002').id).toBe(150);
    });

    test('should handle string analysis IDs', () => {
      const data = [
        { id: '28265', personLimsId: 'LIMS-001', sampleId: 'S1wdh' },
        { id: '27621', personLimsId: 'LIMS-001', sampleId: 'S1' },
        { id: '27670', personLimsId: 'LIMS-001', sampleId: 'S1' },
      ];
      const result = deduplicateByLatest(data, mockLogger);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('28265');
      expect(result[0].sampleId).toBe('S1wdh');
    });

    test('should handle alphanumeric analysis IDs', () => {
      const data = [
        { id: 'AN001', personLimsId: 'LIMS-001', sampleId: 'S1' },
        { id: 'AN010', personLimsId: 'LIMS-001', sampleId: 'S1wdh' },
        { id: 'AN002', personLimsId: 'LIMS-001', sampleId: 'S1b' },
      ];
      const result = deduplicateByLatest(data, mockLogger);
      expect(result).toHaveLength(1);
      // localeCompare with numeric: AN010 > AN002 > AN001
      expect(result[0].id).toBe('AN010');
    });

    test('should return all if no duplicates', () => {
      const data = [
        { id: 1, personLimsId: 'LIMS-001' },
        { id: 2, personLimsId: 'LIMS-002' },
        { id: 3, personLimsId: 'LIMS-003' },
      ];
      const result = deduplicateByLatest(data, mockLogger);
      expect(result).toHaveLength(3);
    });

    test('should log deduplication count when duplicates exist', () => {
      const data = [
        { id: 100, personLimsId: 'LIMS-001' },
        { id: 200, personLimsId: 'LIMS-001' },
      ];
      deduplicateByLatest(data, mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Deduplicated analyses: kept 1 latest, removed 1 older duplicates.',
      );
    });

    test('should not log when no duplicates removed', () => {
      const data = [{ id: 1, personLimsId: 'LIMS-001' }];
      deduplicateByLatest(data, mockLogger);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    test('should return empty array for empty input', () => {
      const result = deduplicateByLatest([], mockLogger);
      expect(result).toHaveLength(0);
    });
  });
});
