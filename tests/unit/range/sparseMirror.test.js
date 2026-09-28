const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildSparseMirror,
  removeSparseMirror,
} = require('../../../js/range/sparseMirror.cjs');
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

describeWithTools('range/sparseMirror with real HTSlib tools', () => {
  const logger = { debug: jest.fn() };
  let dir;
  let panel;
  let calls;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varvis-mirror-test-'));
    panel = writePanelBam(dir);
    calls = writeVcf(dir);
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  /**
   * Builds a mirror over HTTP and returns samtools text output for `args`.
   * @param {object}   mirrorOptions - Mirror options besides url/logger.
   * @param {string[]} viewArgs      - Region arguments after the index.
   */
  async function viewThroughMirror(mirrorOptions, viewArgs) {
    const server = await startRangeServer(fs.readFileSync(panel.bam));
    try {
      const mirror = await buildSparseMirror({
        url: server.url,
        logger,
        fileName: 'panel.bam',
        format: 'bam',
        indexPath: panel.bai,
        ...mirrorOptions,
      });
      try {
        const out = run('samtools', [
          'view',
          '-X',
          mirror.dataPath,
          mirror.indexPath,
          ...viewArgs,
        ]).toString();
        return { out, mirror, served: server.stats.bytesSent };
      } finally {
        await removeSparseMirror(mirror);
        expect(fs.existsSync(mirror.dir)).toBe(false);
      }
    } finally {
      await server.close();
    }
  }

  test('BED regions: identical records, fraction of the bytes', async () => {
    const selected = panel.targets.filter((_, i) => i % 12 === 0);
    const bed = path.join(dir, 'targets.bed');
    fs.writeFileSync(
      bed,
      selected.map(([c, s, e]) => `${c}\t${s}\t${e}`).join('\n'),
    );
    const regions = selected.map(([c, s, e]) => `${c}:${s}-${e}`);
    const direct = run('samtools', [
      'view',
      '-X',
      panel.bam,
      panel.bai,
      '-L',
      bed,
      '-M',
    ]).toString();
    const { out, mirror, served } = await viewThroughMirror(
      { regions, includeUnmapped: false },
      ['-L', bed, '-M'],
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out).toBe(direct);
    const size = fs.statSync(panel.bam).size;
    expect(mirror.stats.fileSize).toBe(size);
    expect(mirror.stats.bytes).toBe(served);
    expect(served).toBeLessThan(size * 0.5);
  });

  test('regions plus unmapped reads, resolving a contig alias', async () => {
    const args = ['1:350001-350300', 'chr2:1250001-1250300', '*'];
    const direct = run('samtools', [
      'view',
      '-X',
      panel.bam,
      panel.bai,
      ...args,
    ]).toString();
    const { out } = await viewThroughMirror(
      { regions: args.slice(0, 2), includeUnmapped: true },
      args,
    );
    expect(out).toContain('\t4\t*\t');
    expect(out).toBe(direct);
  });

  test('unmapped-only extraction', async () => {
    const direct = run('samtools', [
      'view',
      '-X',
      panel.bam,
      panel.bai,
      '*',
    ]).toString();
    const { out, served } = await viewThroughMirror(
      { regions: [], includeUnmapped: true },
      ['*'],
    );
    expect(out).toBe(direct);
    expect(served).toBeLessThan(fs.statSync(panel.bam).size * 0.5);
  });

  test('unknown contigs produce no data rather than an error', async () => {
    const { out } = await viewThroughMirror(
      { regions: ['chrUn_missing:1-100'], includeUnmapped: false },
      ['chr1:1-2'],
    );
    expect(out).toBe('');
  });

  test('VCF regions: tabix -h output identical to direct access', async () => {
    const server = await startRangeServer(fs.readFileSync(calls.vcf));
    const regions = ['1:1000000-1002000', '2:2500000-2500100', '2'];
    try {
      const mirror = await buildSparseMirror({
        url: server.url,
        logger,
        fileName: 'calls.vcf.gz',
        format: 'vcf',
        indexPath: calls.tbi,
        regions: regions.slice(0, 2),
        includeUnmapped: false,
      });
      try {
        for (const region of regions.slice(0, 2)) {
          expect(run('tabix', ['-h', mirror.dataPath, region]).toString()).toBe(
            run('tabix', ['-h', calls.vcf, region]).toString(),
          );
        }
        expect(server.stats.bytesSent).toBeLessThan(
          fs.statSync(calls.vcf).size * 0.2,
        );
      } finally {
        await removeSparseMirror(mirror);
      }
    } finally {
      await server.close();
    }
  });

  test('rejects an index that does not match the format', async () => {
    await expect(
      buildSparseMirror({
        url: 'http://127.0.0.1:1/x',
        logger,
        fileName: 'x.vcf.gz',
        format: 'vcf',
        indexPath: panel.bai,
        regions: [],
        includeUnmapped: false,
      }),
    ).rejects.toThrow(/does not match/);
  });
});
