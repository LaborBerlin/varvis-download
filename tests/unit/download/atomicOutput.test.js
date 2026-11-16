const fs = require('node:fs');
const path = require('node:path');
const { TestDirectory } = require('../../helpers/testUtils');
const { withStagedOutput } = require('../../../js/download/atomicOutput.cjs');

describe('download/atomicOutput', () => {
  const dirs = new TestDirectory();
  let directory, output;
  beforeEach(async () => {
    directory = await dirs.create('staged-output');
    output = path.join(directory, 'sample.vcf.gz');
    fs.writeFileSync(output, 'original records');
    fs.writeFileSync(`${output}.tbi`, 'original index');
  });
  afterEach(() => dirs.cleanup());

  test.each(['extract', 'index'])(
    'preserves original data and index after %s failure',
    async (stage) => {
      await expect(
        withStagedOutput(output, true, '.tbi', async (temporary) => {
          fs.writeFileSync(temporary, 'new records');
          if (stage === 'index')
            fs.writeFileSync(`${temporary}.tbi`, 'partial index');
          throw new Error(`${stage} failed`);
        }),
      ).rejects.toThrow(`${stage} failed`);
      expect(fs.readFileSync(output, 'utf8')).toBe('original records');
      expect(fs.readFileSync(`${output}.tbi`, 'utf8')).toBe('original index');
      expect(fs.readdirSync(directory).sort()).toEqual([
        'sample.vcf.gz',
        'sample.vcf.gz.tbi',
      ]);
    },
  );

  test('publishes both completed files and removes staging directory', async () => {
    await withStagedOutput(output, true, '.tbi', async (temporary) => {
      fs.writeFileSync(temporary, 'new records');
      fs.writeFileSync(`${temporary}.tbi`, 'new index');
      expect(fs.readFileSync(output, 'utf8')).toBe('original records');
    });
    expect(fs.readFileSync(output, 'utf8')).toBe('new records');
    expect(fs.readFileSync(`${output}.tbi`, 'utf8')).toBe('new index');
    expect(fs.readdirSync(directory)).toHaveLength(2);
  });

  test('passes an existing file through when overwrite is disabled', async () => {
    const action = jest.fn();
    await withStagedOutput(output, false, '.tbi', action);
    expect(action).toHaveBeenCalledWith(output);
    expect(fs.readFileSync(output, 'utf8')).toBe('original records');
  });
  test('rolls back data publication when publishing its index fails', async () => {
    const rename = fs.renameSync.bind(fs);
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (from.endsWith('sample.vcf.gz.tbi') && to === `${output}.tbi`)
        throw new Error('index locked');
      rename(from, to);
    });
    await expect(
      withStagedOutput(output, true, '.tbi', async (temporary) => {
        fs.writeFileSync(temporary, 'new records');
        fs.writeFileSync(`${temporary}.tbi`, 'new index');
      }),
    ).rejects.toThrow('index locked');
    expect(fs.readFileSync(output, 'utf8')).toBe('original records');
    expect(fs.readFileSync(`${output}.tbi`, 'utf8')).toBe('original index');
    expect(fs.readdirSync(directory)).toHaveLength(2);
  });
});
