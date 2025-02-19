const fs = require("fs");
const path = require("path");

/**
 * Loads configuration from a specified file.
 * @param {string} configFilePath - The path to the configuration file.
 * @returns {Object} - The parsed configuration object.
 */
function loadConfig(configFilePath) {
  if (fs.existsSync(configFilePath)) {
    return JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
  }
  return {};
}

/**
 * Reads the ASCII logo from the logo.txt file.
 * @returns {string} - The ASCII logo.
 */
function loadLogo() {
  const logoPath = path.resolve(__dirname, "../assets/logo.txt");
  if (fs.existsSync(logoPath)) {
    return fs.readFileSync(logoPath, "utf-8");
  }
  return "";
}

/**
 * Gets the last modified date of a specified file.
 * @param {string} filePath - The path to the file.
 * @returns {string} - The last modified date in YYYY-MM-DD format.
 */
function getLastModifiedDate(filePath) {
  const stats = fs.statSync(filePath);
  return stats.mtime.toISOString().split("T")[0];
}

module.exports = {
  loadConfig,
  loadLogo,
  getLastModifiedDate,
};
