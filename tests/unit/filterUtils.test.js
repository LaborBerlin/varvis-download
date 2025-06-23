const {
  applyFilters,
  parseFilterExpression,
  applyFilter,
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

    test('should throw error for unsupported operator', () => {
      const filter = { field: 'score', operator: '>=', value: '15' };
      expect(() => applyFilter(analyses, filter)).toThrow(
        'Unsupported operator: >=',
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
  });
});
