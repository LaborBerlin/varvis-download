const path = require('node:path');

const { fullDownloadWithOptionalIndex } = require('./commonDownload.cjs');
const { getValidDownloadUrl } = require('./urlRefresh.cjs');
const { getErrorMessage } = require('../errorUtils.cjs');
const {
  ensureIndexFile,
  generateOutputFileName,
  indexBAM,
  rangedDownloadBAM,
  unmappedDownloadBAM,
} = require('../rangedUtils.cjs');
const { isUrlExpiringSoon } = require('../urlUtils.cjs');

/**
 * @typedef {object} BamHandlerArgs
 * @property {import('../types').FileDict}    fileDict    - File dictionary.
 * @property {string}                         fileName    - BAM file name.
 * @property {import('../types').FinalConfig} finalConfig - Final CLI config.
 * @property {string[]}                       regions     - Genomic regions.
 * @property {string}                         target      - Varvis target.
 * @property {string}                         [tempBedPath] - Temporary BED path.
 */

/**
 * Handles download of one BAM file.
 *
 * @param   {BamHandlerArgs}                 args - Handler arguments.
 * @param   {import('../types').CommandDeps} deps - Shared command dependencies.
 * @returns {Promise<{ok: boolean}>}              Outcome; `ok` is false iff a download-body
 *                                                operation that this handler catches failed.
 */
async function handleBamFile(args, deps) {
  const { fileDict, fileName, finalConfig, regions, target, tempBedPath } =
    args;
  const { agent, authService, logger, metrics, rl } = deps;
  const { destination, overwrite, unmapped } = finalConfig;

  let ok = true;

  const downloadLink = await getValidDownloadUrl(
    fileDict,
    fileName,
    target,
    authService.token,
    agent,
    logger,
  );
  const outputFile = path.join(
    destination,
    generateOutputFileName(fileName, regions, logger),
  );

  const indexFileName = `${fileName}.bai`;
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

  if (regions.length === 0 && !unmapped) {
    try {
      logger.info(`Performing full download for BAM file: ${fileName}`);
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

      await indexBAM(outputFile, logger, overwrite);
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
      `Index file for BAM (${fileName}) not found. Ranged/unmapped downloads require .bai index. Skipping.`,
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

  if (regions.length > 0) {
    if (!tempBedPath) {
      throw new Error(
        'Temporary BED file path missing for ranged BAM download.',
      );
    }

    try {
      const modeLabel = unmapped ? 'ranged + unmapped' : 'ranged';
      logger.info(`Performing ${modeLabel} download for BAM file: ${fileName}`);
      await rangedDownloadBAM(
        downloadLink,
        tempBedPath,
        outputFile,
        indexFilePath,
        logger,
        metrics,
        overwrite,
        unmapped,
        regions,
      );
      await indexBAM(outputFile, logger, overwrite);
    } catch (error) {
      ok = false;
      logger.error(
        `Error during ranged download for ${fileName}: ${getErrorMessage(error)}`,
      );
    }
    return { ok };
  }

  const unmappedOutputFile = path.join(
    destination,
    generateOutputFileName(fileName, ['unmapped'], logger),
  );
  try {
    logger.info(`Extracting unmapped reads from BAM file: ${fileName}`);
    await unmappedDownloadBAM(
      downloadLink,
      unmappedOutputFile,
      indexFilePath,
      logger,
      metrics,
      overwrite,
    );
    await indexBAM(unmappedOutputFile, logger, overwrite);
  } catch (error) {
    ok = false;
    logger.error(
      `Error extracting unmapped reads from ${fileName}: ${getErrorMessage(error)}`,
    );
  }
  return { ok };
}

module.exports = { handleBamFile };
