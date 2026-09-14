const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { runCli } = require('./cli-runner');

describe('Playground VCF downloads', () => {
  let directory;
  beforeAll(() => {
    for (const name of ['VARVIS_PLAYGROUND_USER', 'VARVIS_PLAYGROUND_PASS']) {
      if (!process.env[name]) throw new Error(`Missing ${name}`);
    }
    for (const tool of ['samtools', 'tabix', 'bgzip']) {
      expect(spawnSync(tool, ['--version']).status).toBe(0);
    }
  });
  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'varvis-playground-vcf-'),
    );
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  const download = (extra = []) =>
    runCli([
      '--analysisIds',
      '30',
      '--filetypes',
      'vcf.gz,vcf.gz.tbi',
      '--restoreArchived',
      'no',
      '--destination',
      directory,
      '--overwrite',
      ...extra,
    ]);
  const variants = (file) =>
    gunzipSync(fs.readFileSync(path.join(directory, file)))
      .toString()
      .split('\n')
      .filter((line) => line && !line.startsWith('#'));

  test('downloads a full VCF and its usable index', async () => {
    expect((await download()).code).toBe(0);
    const file = fs
      .readdirSync(directory)
      .find((name) => name.endsWith('.vcf.gz'));
    expect(file).toBeDefined();
    expect(
      fs.statSync(path.join(directory, file + '.tbi')).size,
    ).toBeGreaterThan(0);
    expect(spawnSync('tabix', ['-l', path.join(directory, file)]).status).toBe(
      0,
    );
  });

  test('lists matching URLs to stdout and a file without downloading data', async () => {
    const urlFile = path.join(directory, 'urls.txt');
    const result = await download(['--list-urls', '--url-file', urlFile]);
    expect(result.code).toBe(0);
    const consoleUrls = result.stdout
      .split('\n')
      .filter((line) => /^https?:\/\//.test(line));
    const fileUrls = fs.readFileSync(urlFile, 'utf8').trim().split('\n');
    expect(consoleUrls.length).toBeGreaterThan(0);
    expect(fileUrls.length).toBe(consoleUrls.length);
    expect(fileUrls.every((url, index) => url === consoleUrls[index])).toBe(
      true,
    );
    expect(fs.readdirSync(directory)).toEqual(['urls.txt']);
  });

  test('decodes nonempty full VCF records and header', async () => {
    expect((await download()).code).toBe(0);
    const file = fs
      .readdirSync(directory)
      .find((name) => name.endsWith('.vcf.gz'));
    expect(variants(file).length).toBeGreaterThan(0);
    const text = gunzipSync(
      fs.readFileSync(path.join(directory, file)),
    ).toString();
    expect(text.startsWith('##fileformat=VCF')).toBe(true);
  });

  test('extracts a populated region with the expected filename and valid index', async () => {
    expect((await download(['--range', '1:10384971-10385971'])).code).toBe(0);
    const file = fs
      .readdirSync(directory)
      .find((name) => name.endsWith('.1_10384971_10385971.vcf.gz'));
    expect(file).toBeDefined();
    const records = variants(file);
    expect(records.length).toBeGreaterThan(0);
    expect(
      records.every((line) => {
        const [contig, pos] = line.split('\t');
        return (
          contig === '1' && Number(pos) >= 10384971 && Number(pos) <= 10385971
        );
      }),
    ).toBe(true);
    expect(spawnSync('tabix', ['-l', path.join(directory, file)]).status).toBe(
      0,
    );
  });

  test('extracts every requested VCF region', async () => {
    expect(
      (await download(['--range', '1:10384971-10385971 1:1-250000000'])).code,
    ).toBe(0);
    const files = fs
      .readdirSync(directory)
      .filter((name) => name.endsWith('.vcf.gz'));
    expect(files).toHaveLength(2);
    expect(files.every((file) => variants(file).length > 0)).toBe(true);
  });
});
