const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createGunzip } = require('node:zlib');
const { runCli } = require('./cli-runner');

async function digest(file, type) {
  const child =
    type === 'bam' ? spawn('samtools', ['view', '--no-PG', file]) : null;
  const source = child
    ? child.stdout
    : fs.createReadStream(file).pipe(createGunzip());
  const completed = child
    ? new Promise((resolve, reject) => {
        child.stderr.resume();
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error('BAM decoding failed')),
        );
      })
    : Promise.resolve();
  const hash = createHash('sha256');
  let records = 0;
  let pending = '';
  const consume = async () => {
    for await (const bytes of source) {
      const lines = (pending + bytes.toString()).split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (line && !line.startsWith('#')) {
          hash.update(line + '\n');
          records++;
        }
      }
    }
  };
  await Promise.all([consume(), completed]);
  return { sha256: hash.digest('hex'), records };
}

describe('Playground bounded ranges match direct decoded records', () => {
  let directory;
  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'varvis-playground-ranges-'),
    );
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test.each([
    ['vcf', '1:10384971-10385971'],
    ['vcf', '1:1-250000000'],
    ['bam', '1:10384971-10385971'],
    ['bam', '2:15729320-15730320'],
    ['bam', '1:1-250000000'],
    ['bam', '*'],
  ])(
    '%s %s matches with 64 KiB and 2 MiB chunks',
    async (type, region) => {
      let reference;
      for (const chunkSize of [null, 65536, 2097152]) {
        const destination = path.join(directory, String(chunkSize));
        fs.mkdirSync(destination);
        const result = await runCli([
          '--analysisIds',
          '30',
          '--restoreArchived',
          'no',
          '--overwrite',
          '--filetypes',
          type === 'bam' ? 'bam,bai' : 'vcf.gz,vcf.gz.tbi',
          '--destination',
          destination,
          ...(region === '*' ? ['--unmapped'] : ['--range', region]),
          ...(chunkSize === null
            ? ['--no-bounded-range-proxy']
            : ['--bounded-range-chunk-size', String(chunkSize)]),
        ]);
        expect(result.code).toBe(0);
        const file = fs
          .readdirSync(destination)
          .find((name) => name.endsWith(type === 'bam' ? '.bam' : '.vcf.gz'));
        expect(file).toBeDefined();
        const output = await digest(path.join(destination, file), type);
        expect(output.records).toBeGreaterThan(0);
        if (reference) expect(output).toEqual(reference);
        else reference = output;
      }
    },
    360000,
  );
});
