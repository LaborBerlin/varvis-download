const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { OperationalError } = require('../errors.cjs');
const { getErrorMessage } = require('../errorUtils.cjs');

/**
 * @typedef {object} RegionOptions
 * @property {string|null} range - CLI range string.
 * @property {string|null} bed   - BED file path.
 */

/**
 * @typedef {object} ParsedRegions
 * @property {string[]} regions      - Parsed region strings.
 * @property {string}   [tempBedPath] - Temporary BED path.
 */

/**
 * Converts a single genomic region string into a BED line.
 * A chromosome-only region (no `:start-end`) spans the whole chromosome.
 *
 * @param   {string} region - Region string such as `chr1:10-20` or `chr1`.
 * @returns {string}        - Tab-separated BED line (`chr\tstart\tend`).
 */
function regionToBedLine(region) {
  const [chr, pos] = region.split(':');

  if (!pos) {
    return `${chr}\t1\t300000000`;
  }

  const [start, end] = pos.split('-');
  return `${chr}\t${start}\t${end}`;
}

/**
 * Parses CLI range/BED options into regions and an optional temporary BED file.
 *
 * @param   {RegionOptions}            options - Region input options.
 * @param   {import('winston').Logger} logger  - Logger instance.
 * @returns {ParsedRegions}                    - Parsed regions and temporary BED path.
 */
function parseRegions({ range, bed }, logger) {
  if (range) {
    const regions = range.split(' ');
    logger.info(`Using regions from command line: ${regions}`);

    const tempBedPath = path.join(os.tmpdir(), 'regions.bed');
    const bedContent = regions.map(regionToBedLine).join('\n');

    fs.writeFileSync(tempBedPath, bedContent);
    logger.info(`Generated temporary BED file: ${tempBedPath}`);
    return { regions, tempBedPath };
  }

  if (bed) {
    try {
      const bedFileContent = fs.readFileSync(bed, 'utf8');
      const regions = bedFileContent
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const [chr, start, end] = line.split('\t');
          return `${chr}:${start}-${end}`;
        });
      logger.info(`Using regions from BED file: ${regions}`);

      const tempBedPath = path.join(os.tmpdir(), 'regions.bed');
      fs.writeFileSync(tempBedPath, bedFileContent);
      logger.info(`Generated temporary BED file: ${tempBedPath}`);
      return { regions, tempBedPath };
    } catch (error) {
      throw new OperationalError(
        `Error reading BED file: ${getErrorMessage(error)}`,
      );
    }
  }

  logger.info('No regions provided. Proceeding with full file download.');
  return { regions: [] };
}

module.exports = { parseRegions, regionToBedLine };
