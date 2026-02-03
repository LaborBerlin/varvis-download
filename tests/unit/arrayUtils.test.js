const {
  normalizeArrayInput,
  normalizeFiletypes,
} = require('../../js/arrayUtils.cjs');

describe('arrayUtils', () => {
  describe('normalizeArrayInput', () => {
    test('should split comma-separated strings into separate elements', () => {
      const result = normalizeArrayInput(['id1,id2,id3'], undefined, []);
      expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    test('should trim whitespace from split elements', () => {
      const result = normalizeArrayInput(['id1, id2 , id3'], undefined, []);
      expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    test('should handle mixed comma-separated and individual elements', () => {
      const result = normalizeArrayInput(
        ['id1,id2', 'id3', 'id4,id5'],
        undefined,
        [],
      );
      expect(result).toEqual(['id1', 'id2', 'id3', 'id4', 'id5']);
    });

    test('should use CLI value over config value', () => {
      const result = normalizeArrayInput(
        ['cli1', 'cli2'],
        ['config1', 'config2'],
        [],
      );
      expect(result).toEqual(['cli1', 'cli2']);
    });

    test('should fall back to config value when CLI is undefined', () => {
      const result = normalizeArrayInput(undefined, ['config1', 'config2'], []);
      expect(result).toEqual(['config1', 'config2']);
    });

    test('should use default value when both CLI and config are undefined', () => {
      const result = normalizeArrayInput(undefined, undefined, [
        'default1',
        'default2',
      ]);
      expect(result).toEqual(['default1', 'default2']);
    });

    test('should return empty array when all inputs are undefined', () => {
      const result = normalizeArrayInput(undefined, undefined, []);
      expect(result).toEqual([]);
    });

    test('should filter out falsy values', () => {
      const result = normalizeArrayInput(
        ['id1', '', 'id2', null, 'id3'],
        undefined,
        [],
      );
      expect(result).toEqual(['id1', 'id2', 'id3']);
    });

    test('should handle empty comma-separated strings', () => {
      const result = normalizeArrayInput(['id1,,id2'], undefined, []);
      expect(result).toEqual(['id1', 'id2']);
    });

    test('should handle numeric values in array', () => {
      const result = normalizeArrayInput([123, '456,789'], undefined, []);
      expect(result).toEqual([123, '456', '789']);
    });

    test('should handle string with leading/trailing commas', () => {
      const result = normalizeArrayInput([',id1,id2,'], undefined, []);
      expect(result).toEqual(['id1', 'id2']);
    });

    test('should handle single element array without commas', () => {
      const result = normalizeArrayInput(['single-id'], undefined, []);
      expect(result).toEqual(['single-id']);
    });

    test('should handle empty array input', () => {
      const result = normalizeArrayInput([], undefined, ['default']);
      expect(result).toEqual([]);
    });
  });

  describe('normalizeFiletypes', () => {
    test('should return default filetypes when both inputs are undefined', () => {
      const result = normalizeFiletypes();
      expect(result).toEqual(['bam', 'bam.bai']);
    });

    test('should split comma-separated filetypes', () => {
      const result = normalizeFiletypes(['vcf.gz,vcf.gz.tbi']);
      expect(result).toEqual(['vcf.gz', 'vcf.gz.tbi']);
    });

    test('should use CLI value over config value', () => {
      const result = normalizeFiletypes(['vcf.gz'], ['bam']);
      expect(result).toEqual(['vcf.gz']);
    });

    test('should use config value when CLI is undefined', () => {
      const result = normalizeFiletypes(undefined, ['bam', 'vcf.gz']);
      expect(result).toEqual(['bam', 'vcf.gz']);
    });

    test('should handle all supported file types', () => {
      const result = normalizeFiletypes(['bam,bam.bai,vcf.gz,vcf.gz.tbi']);
      expect(result).toEqual(['bam', 'bam.bai', 'vcf.gz', 'vcf.gz.tbi']);
    });

    test('should trim whitespace from filetypes', () => {
      const result = normalizeFiletypes(['bam , bam.bai']);
      expect(result).toEqual(['bam', 'bam.bai']);
    });
  });
});
