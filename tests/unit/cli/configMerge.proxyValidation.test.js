const { mergeConfig } = require('../../../js/cli/configMerge.cjs');

describe('bounded range chunk configuration', () => {
  test.each([0, -1, 1, 65536.5, Infinity, NaN, 67108865, '', 'bad', null])(
    'rejects invalid chunk size %s before authentication',
    (boundedRangeChunkSize) => {
      expect(() =>
        mergeConfig({
          argv: { username: 'user', target: 'demo', analysisIds: ['A1'] },
          config: { boundedRangeChunkSize },
        }),
      ).toThrow(/65536.*67108864/);
    },
  );

  test.each([65536, 2097152, 67108864, '1048576'])(
    'accepts chunk size %s',
    (boundedRangeChunkSize) => {
      expect(
        mergeConfig({
          argv: { username: 'user', target: 'demo', analysisIds: ['A1'] },
          config: { boundedRangeChunkSize },
        }).boundedRangeChunkSize,
      ).toBe(Number(boundedRangeChunkSize));
    },
  );
});
