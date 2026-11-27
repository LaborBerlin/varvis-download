const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Agent } = require('undici');

jest.mock('../../../js/download/urlRefresh.cjs', () => ({
  getValidDownloadUrl: jest.fn(
    async (fileDict, name) => fileDict[name].downloadLink,
  ),
}));

const { handleBamFile } = require('../../../js/download/bamHandler.cjs');
const { handleVcfFile } = require('../../../js/download/vcfHandler.cjs');
const { startRangeServer } = require('../../helpers/rangeServer');
const {
  run,
  toolsAvailable,
  writePanelBam,
  writeVcf,
} = require('../../helpers/genomicFixtures');

const describeWithTools = toolsAvailable(['samtools', 'tabix', 'bgzip'])
  ? describe
  : describe.skip;

describeWithTools('handlers with planned ranges and real tools', () => {
  let dir;
  let panel;
  let calls;
  let agent;
  const servers = [];
  const logger = {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-planned-e2e-'));
    panel = writePanelBam(dir);
    calls = writeVcf(dir);
    agent = new Agent();
  });

  afterAll(async () => {
    await Promise.all(servers.map((s) => s.close()));
    await agent.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Serves a file and its index, returning the file dict and byte counters.
   * @param {string} file  - Data file.
   * @param {string} index - Index file.
   */
  async function serve(file, index) {
    const data = await startRangeServer(fs.readFileSync(file));
    const idx = await startRangeServer(fs.readFileSync(index));
    servers.push(data, idx);
    const name = path.basename(file);
    return {
      data,
      fileDict: {
        [name]: { downloadLink: data.url },
        [path.basename(index)]: { downloadLink: idx.url },
      },
    };
  }

  const makeDeps = () => ({
    agent,
    authService: { token: 't' },
    logger,
    metrics: {
      startTime: 0,
      totalFilesDownloaded: 0,
      totalFilesSkipped: 0,
      totalFilesFailed: 0,
      totalBytesDownloaded: 0,
      downloadSpeeds: [],
    },
    rl: null,
  });

  test('BAM ranged download matches direct extraction with planned traffic', async () => {
    const out = fs.mkdtempSync(path.join(dir, 'bam-'));
    const selected = panel.targets.filter((_, i) => i % 10 === 3);
    const regions = selected.map(([c, s, e]) => `${c}:${s}-${e}`);
    const bed = path.join(out, 'regions.bed');
    fs.writeFileSync(
      bed,
      selected.map(([c, s, e]) => `${c}\t${s}\t${e}`).join('\n'),
    );
    const { data, fileDict } = await serve(panel.bam, panel.bai);
    const deps = makeDeps();

    const result = await handleBamFile(
      {
        fileDict,
        fileName: 'panel.bam',
        finalConfig: { destination: out, overwrite: false, unmapped: false },
        regions,
        target: 't',
        tempBedPath: bed,
      },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(logger.warn).not.toHaveBeenCalled();
    const output = path.join(out, 'panel.multiple-regions.bam');
    expect(fs.existsSync(`${output}.bai`)).toBe(true);
    const direct = run('samtools', [
      'view',
      '-X',
      panel.bam,
      panel.bai,
      '-L',
      bed,
      '-M',
    ]).toString();
    expect(run('samtools', ['view', output]).toString()).toBe(direct);
    expect(data.stats.bytesSent).toBeLessThan(fs.statSync(panel.bam).size / 2);
    expect(deps.metrics.totalBytesDownloaded).toBeGreaterThanOrEqual(
      data.stats.bytesSent,
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/Planned ranged read for panel\.bam: fetched/),
    );
  });

  test('stream strategy still works against the remote URL', async () => {
    const out = fs.mkdtempSync(path.join(dir, 'stream-'));
    const { fileDict } = await serve(panel.bam, panel.bai);
    const result = await handleBamFile(
      {
        fileDict,
        fileName: 'panel.bam',
        finalConfig: {
          destination: out,
          overwrite: false,
          unmapped: true,
          rangeStrategy: 'stream',
        },
        regions: [],
        target: 't',
      },
      makeDeps(),
    );
    expect(result).toEqual({ ok: true });
    const output = path.join(out, 'panel.unmapped.bam');
    expect(run('samtools', ['view', '-c', output]).toString().trim()).toBe(
      '2000',
    );
  });

  test('VCF ranged download writes identical per-region files', async () => {
    const out = fs.mkdtempSync(path.join(dir, 'vcf-'));
    const regions = ['1:100000-101000', '2:2000000-2000400'];
    const { data, fileDict } = await serve(calls.vcf, calls.tbi);
    const result = await handleVcfFile(
      {
        fileDict,
        fileName: 'calls.vcf.gz',
        finalConfig: { destination: out, overwrite: false },
        regions,
        target: 't',
      },
      makeDeps(),
    );
    expect(result).toEqual({ ok: true });
    for (const region of regions) {
      const file = path.join(
        out,
        `calls.${region.replaceAll(/[:-]/g, '_')}.vcf.gz`,
      );
      expect(run('bgzip', ['-dc', file]).toString()).toBe(
        run('tabix', ['-h', calls.vcf, region]).toString(),
      );
    }
    expect(data.stats.bytesSent).toBeLessThan(
      fs.statSync(calls.vcf).size * 0.2,
    );
  });
});
