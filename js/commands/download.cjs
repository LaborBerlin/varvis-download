const fs = require('node:fs');
const {
  fetchAnalysisIds,
  generateReport,
  getDownloadLinks,
} = require('../fetchUtils.cjs');
const { handleBamFile } = require('../download/bamHandler.cjs');
const { handleVcfFile } = require('../download/vcfHandler.cjs');
const { OperationalError } = require('../errors.cjs');
const { getErrorMessage } = require('../errorUtils.cjs');
const { handleUrlListing } = require('../io/urlListing.cjs');
const {
  checkToolAvailability,
  getToolVersion,
  isToolAffectedByUnboundedRangeBug,
} = require('../toolChecks.cjs');

/**
 * @typedef {object} DownloadCommandArgs
 * @property {import('../types').FinalConfig} finalConfig - Final CLI config.
 * @property {string[]}                       regions     - Parsed regions.
 * @property {string}                         [tempBedPath] - Temporary BED path.
 */

/**
 * Runs the main download command.
 *
 * @param   {DownloadCommandArgs}            args - Command args.
 * @param   {import('../types').CommandDeps} deps - Shared command dependencies.
 * @returns {Promise<void>}
 */
async function runDownloadCommand({ finalConfig, regions, tempBedPath }, deps) {
  const { agent, authService, logger, rl } = deps;
  const {
    analysisIds,
    filetypes,
    filters,
    limsIds,
    listUrls,
    reportfile,
    restorationFile,
    restoreArchived,
    sampleIds,
    target,
    urlFile,
  } = finalConfig;

  try {
    // track tool-specific proxy enablement without mutating global finalConfig
    let samtoolsProxyEnabled = finalConfig.boundedRangeProxy;
    let tabixProxyEnabled = finalConfig.boundedRangeProxy;

    if (finalConfig.range || finalConfig.bed || finalConfig.unmapped) {
      const samtoolsOK = await checkToolAvailability(
        'samtools',
        'samtools --version',
        '1.17',
        logger,
      );
      if (!samtoolsOK) {
        throw new OperationalError(
          'samtools is missing or outdated. Please install/update it and try again.',
        );
      }

      // inspect samtools version for native bounded range support
      if (typeof getToolVersion === 'function') {
        const samtoolsVersion = await getToolVersion(
          'samtools',
          'samtools --version',
          logger,
        );
        if (
          samtoolsVersion &&
          typeof isToolAffectedByUnboundedRangeBug === 'function' &&
          !isToolAffectedByUnboundedRangeBug('samtools', samtoolsVersion) &&
          !finalConfig.boundedRangeProxyExplicit
        ) {
          logger.info(
            `Detected samtools version ${samtoolsVersion} with native bounded range support; proxy bypassed.`,
          );
          samtoolsProxyEnabled = false;
        }
      }

      if (finalConfig.range || finalConfig.bed) {
        const [tabixOK, bgzipOK] = await Promise.all([
          checkToolAvailability('tabix', 'tabix --version', '1.7', logger),
          checkToolAvailability('bgzip', 'bgzip --version', '1.7', logger),
        ]);
        if (!tabixOK || !bgzipOK) {
          throw new OperationalError(
            'One or more required external tools (tabix, bgzip) are missing or outdated. Please install/update them and try again.',
          );
        }

        // inspect tabix version for native bounded range support
        if (typeof getToolVersion === 'function') {
          const tabixVersion = await getToolVersion(
            'tabix',
            'tabix --version',
            logger,
          );
          if (
            tabixVersion &&
            typeof isToolAffectedByUnboundedRangeBug === 'function' &&
            !isToolAffectedByUnboundedRangeBug('tabix', tabixVersion) &&
            !finalConfig.boundedRangeProxyExplicit
          ) {
            logger.info(
              `Detected tabix version ${tabixVersion} with native bounded range support; proxy bypassed.`,
            );
            tabixProxyEnabled = false;
          }
        }
      }
    }

    logger.info('Processing files for download...');
    const ids =
      analysisIds.length > 0
        ? analysisIds
        : await fetchAnalysisIds(
            target,
            authService.token,
            agent,
            sampleIds,
            limsIds,
            filters,
            logger,
            finalConfig.latest,
          );
    logger.info(`Fetched analysis IDs: ${ids}`);

    const optionsForRestoration = {
      destination: finalConfig.destination,
      overwrite: finalConfig.overwrite,
      range: finalConfig.range,
      bed: finalConfig.bed,
      unmapped: finalConfig.unmapped,
      restorationFile,
      filetypes,
    };

    /** @type {string[]} */
    const allUrls = [];

    for (const analysisId of ids) {
      logger.info(`Processing analysis ID: ${analysisId}`);
      const fileDict = await getDownloadLinks(
        analysisId,
        filetypes,
        target,
        authService.token,
        agent,
        logger,
        restoreArchived,
        rl,
        restorationFile,
        optionsForRestoration,
      );
      logger.debug(`Fetched download links for analysis ID ${analysisId}`);

      if (listUrls) {
        for (const file of Object.values(fileDict)) {
          if (file.downloadLink) {
            allUrls.push(file.downloadLink);
          }
        }
        continue;
      }

      const primaryFiles = Object.entries(fileDict).filter(
        ([fileName]) =>
          fileName.endsWith('.bam') || fileName.endsWith('.vcf.gz'),
      );

      for (const [fileName] of primaryFiles) {
        if (fileName.endsWith('.bam')) {
          await handleBamFile(
            {
              fileDict,
              fileName,
              finalConfig: {
                ...finalConfig,
                boundedRangeProxy: samtoolsProxyEnabled,
              },
              regions,
              target,
              tempBedPath,
            },
            deps,
          );
        } else if (fileName.endsWith('.vcf.gz')) {
          await handleVcfFile(
            {
              fileDict,
              fileName,
              finalConfig: {
                ...finalConfig,
                boundedRangeProxy: tabixProxyEnabled,
              },
              regions,
              target,
            },
            deps,
          );
        }
      }
    }

    if (listUrls) {
      handleUrlListing(allUrls, urlFile, logger);
      return;
    }

    logger.info('Download complete.');
    generateReport(reportfile, logger);
  } finally {
    // The temp BED is created before this command runs; clean it up on every
    // exit path (success, early return, or throw) so a failed download does not
    // leak it. This command owns the file's lifecycle (mirrors resume.cjs).
    if (tempBedPath && fs.existsSync(tempBedPath)) {
      try {
        fs.unlinkSync(tempBedPath);
        logger.info(`Deleted temporary BED file: ${tempBedPath}`);
      } catch (error) {
        logger.debug(
          `Could not remove temp BED ${tempBedPath}: ${getErrorMessage(error)}`,
        );
      }
    }
  }
}

module.exports = { runDownloadCommand };
