const fs = require('node:fs');
const path = require('node:path');
const { TestDirectory } = require('../../helpers/testUtils');
const { createMockLogger } = require('../../helpers/mockFactories');
const { withStagedOutput } = require('../../../js/download/atomicOutput.cjs');
const { indexBAM, indexVCF } = require('../../../js/rangedUtils.cjs');
const { spawnPromise } = require('../../../js/toolChecks.cjs');

jest.mock('../../../js/toolChecks.cjs', () => ({ spawnPromise: jest.fn() }));

describe('missing indexes for existing ranged outputs', () => {
  const dirs = new TestDirectory();
  let directory;
  beforeEach(async () => {
    directory = await dirs.create('missing-index');
  });
  afterEach(() => dirs.cleanup());

  test.each([
    ['sample.bam', '.bai', indexBAM],
    ['sample.vcf.gz', '.tbi', indexVCF],
  ])(
    'retries %s indexing after a partial-index failure',
    async (name, suffix, indexer) => {
      const output = path.join(directory, name);
      fs.writeFileSync(output, 'original records');
      const logger = createMockLogger();
      const indexAttempts = [];
      spawnPromise.mockImplementation(async (_command, args) => {
        const dataPath = args.at(-1);
        indexAttempts.push(dataPath);
        fs.writeFileSync(
          `${dataPath}${suffix}`,
          indexAttempts.length === 1 ? 'partial index' : 'complete index',
        );
        if (indexAttempts.length === 1) throw new Error('index write failed');
      });
      const action = async (dataPath) => {
        expect(fs.readFileSync(dataPath, 'utf8')).toBe('original records');
        await indexer(dataPath, logger, false);
      };
      await expect(
        withStagedOutput(output, false, suffix, action),
      ).rejects.toThrow('index write failed');
      expect(fs.existsSync(`${output}${suffix}`)).toBe(false);
      expect(fs.readFileSync(output, 'utf8')).toBe('original records');
      expect(fs.readdirSync(directory)).toEqual([name]);
      await withStagedOutput(output, false, suffix, action);
      expect(indexAttempts).toHaveLength(2);
      expect(indexAttempts).not.toContain(output);
      expect(fs.readFileSync(`${output}${suffix}`, 'utf8')).toBe(
        'complete index',
      );
      expect(fs.readFileSync(output, 'utf8')).toBe('original records');
      expect(fs.readdirSync(directory).sort()).toEqual([
        name,
        `${name}${suffix}`,
      ]);
      await withStagedOutput(output, false, suffix, action);
      expect(indexAttempts).toHaveLength(2);
    },
  );
  test.each([
    ['sample.bam', '.bai', indexBAM],
    ['sample.vcf.gz', '.tbi', indexVCF],
  ])(
    'removes failed full-file %s index output so a retry actually indexes',
    async (name, suffix, indexer) => {
      const output = path.join(directory, name);
      fs.writeFileSync(output, 'new records');
      fs.writeFileSync(`${output}${suffix}`, 'stale index');
      let attempts = 0;
      spawnPromise.mockImplementation(async () => {
        attempts++;
        fs.writeFileSync(
          `${output}${suffix}`,
          attempts === 1 ? 'partial index' : 'complete index',
        );
        if (attempts === 1) throw new Error('index write failed');
      });
      const logger = createMockLogger();
      await expect(indexer(output, logger, true)).rejects.toThrow(
        'index write failed',
      );
      expect(fs.existsSync(`${output}${suffix}`)).toBe(false);
      await indexer(output, logger, false);
      expect(attempts).toBe(2);
      expect(fs.readFileSync(`${output}${suffix}`, 'utf8')).toBe(
        'complete index',
      );
      expect(fs.readFileSync(output, 'utf8')).toBe('new records');
    },
  );
});
