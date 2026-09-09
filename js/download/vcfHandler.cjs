const path = require('node:path');

const { fullDownloadWithOptionalIndex } = require('./commonDownload.cjs');
const { getValidDownloadUrl } = require('./urlRefresh.cjs');
const { getErrorMessage } = require('../errorUtils.cjs');
const {
  ensureIndexFile,
  generateOutputFileName,
  indexVCF,
  rangedDownloadVCF,
} = require('../rangedUtils.cjs');
const { isUrlExpiringSoon } = require('../urlUtils.cjs');

/**
 * @typedef {object} VcfHandlerArgs
 * @property {import('../types').FileDict} fileDict - File dictionary.
 * @property {string} fileName - VCF file name.
 * @property {Pick<import('../types').FinalConfig, 'destination'|'overwrite'|'unmapped'> & Partial<Pick<import('../types').FinalConfig, 'boundedRangeProxy'|'boundedRangeChunkSize'>>} finalConfig - Final CLI config (only the fields this handler reads; callers may pass the full config).
 * @property {string[]} regions - Genomic regions.
 * @property {string} target - Varvis target.
 */

/**
 * Handles download of one VCF file.
 *
 * @param   {VcfHandlerArgs}                 args - Handler arguments.
 * @param   {import('../types').CommandDeps} deps - Shared command dependencies.
 * @returns {Promise<{ok: boolean}>}              Outcome; `ok` is false iff a download-body
 *                                                operation that this handler catches failed.
 */
async function handleVcfFile(args, deps) {
  const { fileDict, fileName, finalConfig, regions, target } = args;
  const { agent, authService, logger, metrics, rl } = deps;
  const {
    destination,
    overwrite,
    unmapped,
    boundedRangeProxy,
    boundedRangeChunkSize,
  } = finalConfig;

  let ok = true;

  if (unmapped) {
    logger.info(
      `Skipping VCF file ${fileName} - unmapped read extraction only applies to BAM files.`,
    );
    return { ok: true };
  }

  const downloadLink = await getValidDownloadUrl(
    fileDict,
    fileName,
    target,
    authService.token,
    agent,
    logger,
  );

  const indexFileName = `${fileName}.tbi`;
  let indexFileUrl = fileDict[indexFileName]?.downloadLink;
  if (indexFileUrl && isUrlExpiringSoon(indexFileUrl)) {
    indexFileUrl = await getValidDownloadUrl(
      fileDict,
      indexFileName,
      target,
      authService.token,
      agent,
      logger,
    );
  }
  const indexFilePath = path.join(destination, indexFileName);

  if (regions.length === 0) {
    const outputFile = path.join(
      destination,
      generateOutputFileName(fileName, regions, logger),
    );
    try {
      logger.info(`Performing full download for VCF file: ${fileName}`);
      await fullDownloadWithOptionalIndex(
        {
          index: indexFileUrl
            ? { label: indexFileName, path: indexFilePath, url: indexFileUrl }
            : null,
          overwrite,
          primary: { path: outputFile, url: downloadLink },
        },
        deps,
      );

      if (!indexFileUrl) {
        logger.info(
          `Index file for ${fileName} not available, skipping index download.`,
        );
      }

      await indexVCF(outputFile, logger, overwrite);
    } catch (error) {
      ok = false;
      logger.error(
        `Error during full download for ${fileName}: ${getErrorMessage(error)}`,
      );
    }
    return { ok };
  }

  if (!indexFileUrl) {
    logger.error(
      `Index file for VCF (${fileName}) not found. Ranged download requires .tbi index. Skipping ranged download.`,
    );
    return { ok: false };
  }

  await ensureIndexFile(
    downloadLink,
    indexFileUrl,
    indexFilePath,
    agent,
    rl,
    logger,
    metrics,
    overwrite,
  );

  for (const region of regions) {
    const regionSpecificOutputFile = path.join(
      destination,
      generateOutputFileName(fileName, [region], logger),
    );

    try {
      logger.info(
        `Performing ranged download for VCF file: ${fileName} with region: ${region}`,
      );
      await rangedDownloadVCF(
        downloadLink,
        region,
        regionSpecificOutputFile,
        indexFilePath,
        logger,
        metrics,
        overwrite,
        {
          enabled: boundedRangeProxy,
          chunkSize: boundedRangeChunkSize,
        },
      );
      await indexVCF(regionSpecificOutputFile, logger, overwrite);
    } catch (error) {
      ok = false;
      logger.error(
        `Error during ranged download for ${fileName} on region ${region}: ${getErrorMessage(error)}`,
      );
    }
  }
  return { ok };
}

module.exports = { handleVcfFile };
