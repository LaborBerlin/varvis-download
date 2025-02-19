// filterUtils.js

/**
 * Parses a filter expression like 'analysisType=SNV' or 'sampleId>LB24-0001'
 * @param {string} filterExpression - The filter expression (e.g., analysisType=SNV)
 * @returns {Object} - An object containing field, operator, and value (e.g., { field: 'analysisType', operator: '=', value: 'SNV' })
 */
function parseFilterExpression(filterExpression) {
  const regex = /^(\w+)([><=]{1,2})(.+)$/;
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
 * Applies a single filter to a list of analyses
 * @param {Array} analyses - List of analyses returned by the API
 * @param {Object} filter - Parsed filter object (e.g., { field: 'analysisType', operator: '=', value: 'SNV' })
 * @returns {Array} - Filtered list of analyses
 */
function applyFilter(analyses, filter) {
  const { field, operator, value } = filter;

  return analyses.filter((analysis) => {
    const analysisValue = analysis[field];
    switch (operator) {
      case "=":
        return analysisValue == value;
      case "!=":
        return analysisValue != value;
      case ">":
        return analysisValue > value;
      case "<":
        return analysisValue < value;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  });
}

/**
 * Applies multiple filters to a list of analyses
 * @param {Array} analyses - List of analyses returned by the API
 * @param {Array} filterExpressions - Array of filter expressions (e.g., ['analysisType=SNV', 'sampleId>LB24-0001'])
 * @returns {Array} - Filtered list of analyses
 */
function applyFilters(analyses, filterExpressions) {
  let filteredAnalyses = analyses;

  filterExpressions.forEach((filterExpression) => {
    const filter = parseFilterExpression(filterExpression);
    filteredAnalyses = applyFilter(filteredAnalyses, filter);
  });

  return filteredAnalyses;
}

module.exports = {
  parseFilterExpression,
  applyFilter,
  applyFilters,
};
