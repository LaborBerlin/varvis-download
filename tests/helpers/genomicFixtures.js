const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * Whether every named tool runs.
 * @param {string[]} tools - Executables.
 */
function toolsAvailable(tools) {
  return tools.every(
    (tool) =>
      spawnSync(tool, tool === 'bgzip' ? ['--version'] : ['--version'])
        .status === 0,
  );
}

/**
 * Runs a tool and returns stdout, throwing with stderr on failure.
 * @param {string}   tool - Executable.
 * @param {string[]} args - Arguments.
 * @param {object}   [options] - spawnSync options.
 */
function run(tool, args, options = {}) {
  const result = spawnSync(tool, args, {
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${tool} ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/** Deterministic PRNG so fixtures are identical across runs. */
function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * Writes a coordinate-sorted, indexed panel-like BAM: dense read piles every
 * 100 kb on two contigs, sparse background, and unplaced unmapped reads.
 * @param   {string} dir - Output directory.
 * @returns {{bam: string, bai: string, targets: Array<[string, number, number]>}} - Paths and target intervals.
 */
function writePanelBam(dir) {
  const random = prng(42);
  const bases = 'ACGT';
  const read = () =>
    Array.from({ length: 100 }, () => bases[Math.floor(random() * 4)]).join('');
  const quality = 'I'.repeat(100);
  const contigs = [
    ['chr1', 6_000_000],
    ['chr2', 4_000_000],
  ];
  const lines = ['@HD\tVN:1.6\tSO:coordinate'];
  for (const [name, length] of contigs) {
    lines.push(
      `@SQ\tSN:${name}\tLN:${length}${name === 'chr1' ? '\tAN:1' : ''}`,
    );
  }
  /** @type {Array<[string, number, number]>} */
  const targets = [];
  let n = 0;
  for (const [name, length] of contigs) {
    const positions = [];
    for (let start = 150_000; start < length - 150_000; start += 100_000) {
      targets.push([name, start, start + 300]);
      for (let i = 0; i < 300; i++) {
        positions.push(start - 50 + Math.floor(random() * 300));
      }
    }
    for (let i = 0; i < 6000; i++) {
      positions.push(1 + Math.floor(random() * (length - 200)));
    }
    positions.sort((a, b) => a - b);
    for (const pos of positions) {
      lines.push(
        `r${n++}\t0\t${name}\t${pos}\t60\t100M\t*\t0\t0\t${read()}\t${quality}`,
      );
    }
  }
  for (let i = 0; i < 2000; i++) {
    lines.push(`u${n++}\t4\t*\t0\t0\t*\t*\t0\t0\t${read()}\t${quality}`);
  }
  const sam = path.join(dir, 'panel.sam');
  fs.writeFileSync(sam, `${lines.join('\n')}\n`);
  const bam = path.join(dir, 'panel.bam');
  run('samtools', ['view', '-b', '-o', bam, sam]);
  run('samtools', ['index', bam]);
  return { bam, bai: `${bam}.bai`, targets };
}

/**
 * Writes a bgzipped, tabix-indexed VCF with variants on two contigs.
 * @param   {string} dir - Output directory.
 * @returns {{vcf: string, tbi: string}} - Paths.
 */
function writeVcf(dir) {
  const random = prng(7);
  const lines = [
    '##fileformat=VCFv4.2',
    '##contig=<ID=1,length=3000000>',
    '##contig=<ID=2,length=3000000>',
    '##INFO=<ID=X,Number=1,Type=String,Description="Synthetic">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
  ];
  for (const contig of ['1', '2']) {
    for (let pos = 1; pos < 3_000_000; pos += 40) {
      const tag = Math.floor(random() * 1e9).toString(36);
      lines.push(`${contig}\t${pos}\t.\tA\tG\t50\tPASS\tX=${tag}`);
    }
  }
  const vcf = path.join(dir, 'calls.vcf.gz');
  fs.writeFileSync(
    vcf,
    run('bgzip', ['-c'], { input: `${lines.join('\n')}\n` }),
  );
  run('tabix', ['-p', 'vcf', vcf]);
  return { vcf, tbi: `${vcf}.tbi` };
}

module.exports = { run, toolsAvailable, writePanelBam, writeVcf };
