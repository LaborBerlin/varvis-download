const { fetch } = require('undici');
const ProgressBar = require('progress');
const fs = require('fs');

const metrics = {
  startTime: Date.now(),
  totalFilesDownloaded: 0,
  totalBytesDownloaded: 0,
  downloadSpeeds: []
};

/**
 * Retries a fetch operation with a specified number of attempts.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - The fetch options.
 * @param {number} retries - The number of retry attempts.
 * @param {Object} logger - The logger instance.
 * @returns {Promise<Response>} - The fetch response.
 */
async function fetchWithRetry(url, options, retries = 3, logger) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Fetch failed with status: ${response.status}`);
      return response;
    } catch (error) {
      if (attempt < retries) {
        logger.warn(`Fetch attempt ${attempt} failed. Retrying...`);
        await new Promise(res => setTimeout(res, attempt * 1000)); // Exponential backoff
      } else {
        logger.error(`Fetch failed after ${retries} attempts: ${error.message}`);
        throw error;
      }
    }
  }
}

/**
 * Fetches analysis IDs based on sampleIds or limsIds.
 * @param {string} target - The target for the Varvis API.
 * @param {string} token - The CSRF token for authentication.
 * @param {Object} agent - The HTTP agent instance.
 * @param {Array<string>} sampleIds - The sample IDs to filter analyses.
 * @param {Array<string>} limsIds - The LIMS IDs to filter analyses.
 * @param {Object} logger - The logger instance.
 * @returns {Promise<string[]>} - An array of analysis IDs.
 */
async function fetchAnalysisIds(target, token, agent, sampleIds, limsIds, logger) {
  try {
    logger.debug('Fetching all analysis IDs');
    const response = await fetchWithRetry(`https://${target}.varvis.com/api/analyses`, {
      method: 'GET',
      headers: { 'x-csrf-token': token },
      dispatcher: agent
    }, 3, logger);
    const data = await response.json();
    const analyses = data.response;

    // Filter out analyses of type "CNV"
    let filteredAnalyses = analyses.filter(analysis => analysis.analysisType !== 'CNV');

    if (sampleIds.length > 0) {
      logger.debug(`Filtering analyses by sampleIds: ${sampleIds.join(', ')}`);
      filteredAnalyses = filteredAnalyses.filter(analysis => sampleIds.includes(analysis.sampleId));
    }

    if (limsIds.length > 0) {
      logger.debug(`Filtering analyses by limsIds: ${limsIds.join(', ')}`);
      filteredAnalyses = filteredAnalyses.filter(analysis => limsIds.includes(analysis.personLimsId));
    }

    const ids = filteredAnalyses.map(analysis => analysis.id.toString());
    logger.debug(`Filtered analysis IDs: ${ids.join(', ')}`);
    return ids;
  } catch (error) {
    logger.error('Error fetching analysis IDs:', error);
    throw error;
  }
}

/**
 * Fetches the download links for specified file types from the Varvis API.
 * @param {string} analysisId - The analysis ID to fetch download links for.
 * @param {Array<string>} filter - An optional array of file types to filter by.
 * @param {string} target - The target for the Varvis API.
 * @param {string} token - The CSRF token for authentication.
 * @param {Object} agent - The HTTP agent instance.
 * @param {Object} logger - The logger instance.
 * @returns {Promise<Object>} - An object containing the download links for the specified file types.
 */
async function getDownloadLinks(analysisId, filter, target, token, agent, logger) {
  try {
    logger.debug(`Fetching download links for analysis ID: ${analysisId}`);
    const response = await fetchWithRetry(`https://${target}.varvis.com/api/analysis/${analysisId}/get-file-download-links`, {
      method: 'GET',
      headers: { 'x-csrf-token': token },
      dispatcher: agent
    }, 3, logger);
    const data = await response.json();
    const apiFileLinks = data.response.apiFileLinks;

    const fileDict = {};
    for (const file of apiFileLinks) {
      const fileNameParts = file.fileName.split('.');
      const fileType = fileNameParts.length > 2 ? fileNameParts.slice(-2).join('.') : fileNameParts.pop();
      logger.debug(`Checking file type: ${fileType}`);
      if (!filter || filter.includes(fileType)) {
        fileDict[file.fileName] = file;
      }
    }

    // Warn if requested file types are not available
    if (filter) {
      const availableFileTypes = Object.keys(fileDict).map(fileName => {
        const parts = fileName.split('.');
        return parts.length > 2 ? parts.slice(-2).join('.') : parts.pop();
      });
      logger.debug(`Available file types: ${availableFileTypes.join(', ')}`);
      const missingFileTypes = filter.filter(ft => !availableFileTypes.includes(ft));
      if (missingFileTypes.length > 0) {
        logger.warn(`Warning: The following requested file types are not available for the analysis ${analysisId}: ${missingFileTypes.join(', ')}`);
      }
    }
    return fileDict;
  } catch (error) {
    logger.error(`Failed to get download links for analysis ID ${analysisId}:`, error.message);
    throw error;
  }
}

/**
 * Lists available files for the specified analysis IDs.
 * @param {string} analysisId - The analysis ID to list files for.
 * @param {string} target - The target for the Varvis API.
 * @param {string} token - The CSRF token for authentication.
 * @param {Object} agent - The HTTP agent instance.
 * @param {Object} logger - The logger instance.
 * @returns {Promise<void>}
 */
async function listAvailableFiles(analysisId, target, token, agent, logger) {
  try {
    logger.info(`Listing available files for analysis ID: ${analysisId}`);
    const fileDict = await getDownloadLinks(analysisId, null, target, token, agent, logger);

    if (Object.keys(fileDict).length === 0) {
      logger.info('No files available for the specified analysis ID.');
    } else {
      logger.info('Available files:');
      for (const fileName of Object.keys(fileDict)) {
        logger.info(`- ${fileName}`);
      }
    }
  } catch (error) {
    logger.error(`Failed to list available files for analysis ID ${analysisId}:`, error.message);
  }
}

/**
 * Generates a summary report of the download process.
 * @param {string} reportfile - The path to the report file.
 * @param {Object} logger - The logger instance.
 */
function generateReport(reportfile, logger) {
  const totalTime = (Date.now() - metrics.startTime) / 1000; // in seconds
  const averageSpeed = metrics.downloadSpeeds.reduce((a, b) => a + b, 0) / metrics.downloadSpeeds.length;

  const report = `
    Download Summary Report:
    ------------------------
    Total Files Downloaded: ${metrics.totalFilesDownloaded}
    Total Bytes Downloaded: ${metrics.totalBytesDownloaded}
    Average Download Speed: ${averageSpeed.toFixed(2)} bytes/sec
    Total Time Taken: ${totalTime.toFixed(2)} seconds
  `;

  logger.info(report);

  if (reportfile) {
    fs.writeFileSync(reportfile, report);
    logger.info(`Report written to ${reportfile}`);
  }
}

module.exports = {
  fetchWithRetry,
  fetchAnalysisIds,
  getDownloadLinks,
  listAvailableFiles,
  generateReport,
  metrics
};
