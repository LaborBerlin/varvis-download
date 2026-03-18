// filterUtils.js

/**
 * Parses a filter expression into its components.
 * Supported operators:
 * =   equality
 * !=  inequality
 * >   greater than
 * <   less than
 * ~=  contains (substring match)
 * ^=  starts with (prefix match)
 * @param   {string} filterExpression - The filter expression (e.g., "analysisType=SNV", "enrichmentKitName^=TwistExome")
 * @returns {object}                  - An object containing field, operator, and value (e.g., { field: 'analysisType', operator: '=', value: 'SNV' })
 */
function parseFilterExpression(filterExpression) {
  const regex = /^(\w+)(~=|\^=|!=|[><=])(.+)$/;
  const match = filterExpression.match(regex);
  if (match) {
    return {
      field: match[1],
      operator: match[2],
      value: match[3].trim(),
    };
  }
  throw new Error(`Invalid filter expression: ${filterExpression}`);
}

/**
 * Applies a single filter to a list of analyses.
 * @param   {Array}  analyses - List of analyses returned by the API.
 * @param   {object} filter   - Parsed filter object (e.g., { field: 'analysisType', operator: '=', value: 'SNV' })
 * @returns {Array}           - Filtered list of analyses.
 */
function applyFilter(analyses, filter) {
  const { field, operator, value } = filter;

  return analyses.filter((analysis) => {
    const analysisValue = analysis[field];
    switch (operator) {
      case '=':
        return analysisValue == value;
      case '!=':
        return analysisValue != value;
      case '>':
        return analysisValue > value;
      case '<':
        return analysisValue < value;
      case '~=':
        return String(analysisValue || '').includes(value);
      case '^=':
        return String(analysisValue || '').startsWith(value);
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  });
}

/**
 * Applies multiple filters to a list of analyses sequentially (AND logic).
 * @param   {Array} analyses          - List of analyses returned by the API.
 * @param   {Array} filterExpressions - Array of filter expressions (e.g., ['analysisType=SNV', 'enrichmentKitName^=TwistExome'])
 * @returns {Array}                   - Filtered list of analyses.
 */
function applyFilters(analyses, filterExpressions) {
  let filteredAnalyses = analyses;

  filterExpressions.forEach((filterExpression) => {
    const filter = parseFilterExpression(filterExpression);
    filteredAnalyses = applyFilter(filteredAnalyses, filter);
  });

  return filteredAnalyses;
}

/**
 * Deduplicates analyses by keeping only the one with the highest analysis ID
 * per unique personLimsId. This ensures only the newest/latest analysis per
 * sample is retained (e.g., when a sample has both original and repeat sequencing).
 * @param   {Array}  analyses - List of analyses (must have id and personLimsId fields).
 * @param   {object} logger   - The logger instance.
 * @returns {Array}           - Deduplicated list with one analysis per personLimsId.
 */
function deduplicateByLatest(analyses, logger) {
  const byLims = new Map();

  for (const analysis of analyses) {
    const limsId = analysis.personLimsId;
    const id = Number(analysis.id);
    const existing = byLims.get(limsId);

    if (!existing || id > Number(existing.id)) {
      byLims.set(limsId, analysis);
    }
  }

  const deduplicated = [...byLims.values()];
  const removed = analyses.length - deduplicated.length;
  if (removed > 0) {
    logger.info(
      `Deduplicated analyses: kept ${deduplicated.length} latest, removed ${removed} older duplicates.`,
    );
  }

  return deduplicated;
}

module.exports = {
  parseFilterExpression,
  applyFilter,
  applyFilters,
  deduplicateByLatest,
};
