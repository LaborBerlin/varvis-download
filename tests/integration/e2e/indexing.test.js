const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TestDirectory } = require('../../helpers/testUtils');
const { createMockLogger } = require('../../helpers/mockFactories');
const { indexVCF } = require('../../../js/rangedUtils.cjs');

describe('real tabix index overwrite', () => {
  const dirs = new TestDirectory();
  let file;
  beforeEach(async () => {
    const directory = await dirs.create('index-overwrite');
    file = path.join(directory, 'sample.vcf.gz');
    const text =
      '##fileformat=VCFv4.2\n##contig=<ID=1,length=1000>\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n1\t10\t.\tA\tG\t50\tPASS\t.\n';
    const compressed = spawnSync('bgzip', ['-c'], { input: text });
    expect(compressed.status).toBe(0);
    fs.writeFileSync(file, compressed.stdout);
    fs.writeFileSync(`${file}.tbi`, 'old index');
  });
  afterEach(() => dirs.cleanup());

  test('replaces an existing index when overwrite is requested', async () => {
    await indexVCF(file, createMockLogger(), true);
    expect(fs.readFileSync(`${file}.tbi`, 'utf8')).not.toBe('old index');
    const result = spawnSync('tabix', [file, '1:1-20'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('1\t10\t.\tA\tG\t50\tPASS\t.\n');
  });
});
