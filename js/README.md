# JS Folder

This folder contains modularized JavaScript files used by the Varvis Download CLI. Each file encapsulates specific functionality to ensure the main script remains clean and maintainable.

## Files

### authService.js

Handles authentication with the Varvis API.

#### Functions:

- **getCsrfToken()**

  - Fetches the CSRF token required for login.
  - Returns: `Promise<string>`

- **login(user, target)**
  - Logs in to the Varvis API and retrieves the CSRF token.
  - Parameters:
    - `user`: Object containing the username and password.
      - `username`: The Varvis API username.
      - `password`: The Varvis API password.
    - `target`: The Varvis API target.
  - Returns: `Promise<Object>`

### configUtils.js

Provides utility functions for loading configurations and assets.

#### Functions:

- **loadConfig(configFilePath)**

  - Loads configuration from a file.
  - Parameters:
    - `configFilePath`: Path to the configuration file.
  - Returns: `Object`

- **loadLogo()**

  - Reads the ASCII logo from the logo.txt file.
  - Returns: `string`

- **getLastModifiedDate(filePath)**
  - Gets the last modified date of a file.
  - Parameters:
    - `filePath`: Path to the file.
  - Returns: `string`

### fetchUtils.js

Contains functions for making HTTP requests and fetching data from the Varvis API.

#### Functions:

- **fetchWithRetry(url, options, retries = 3, logger)**

  - Retries a fetch operation with a specified number of attempts.
  - Parameters:
    - `url`: The URL to fetch.
    - `options`: The fetch options.
    - `retries`: The number of retry attempts.
    - `logger`: Logger instance for logging.
  - Returns: `Promise<Response>`

- **fetchAnalysisIds(target, token, agent, sampleIds, limsIds, logger)**

  - Fetches analysis IDs based on sample IDs or LIMS IDs.
  - Parameters:
    - `target`: The Varvis API target.
    - `token`: The CSRF token.
    - `agent`: The HTTP agent.
    - `sampleIds`: Array of sample IDs to filter analyses.
    - `limsIds`: Array of LIMS IDs to filter analyses.
    - `logger`: Logger instance for logging.
  - Returns: `Promise<string[]>`

- **getDownloadLinks(analysisId, filter, target, token, agent, logger)**

  - Fetches the download links for specified file types from the Varvis API for a given analysis ID.
  - Parameters:
    - `analysisId`: The analysis ID to get download links for.
    - `filter`: An optional array of file types to filter by.
    - `target`: The Varvis API target.
    - `token`: The CSRF token.
    - `agent`: The HTTP agent.
    - `logger`: Logger instance for logging.
  - Returns: `Promise<Object>`

- **listAvailableFiles(analysisId, target, token, agent, logger)**

  - Lists available files for the specified analysis IDs.
  - Parameters:
    - `analysisId`: The analysis ID to list files for.
    - `target`: The Varvis API target.
    - `token`: The CSRF token.
    - `agent`: The HTTP agent.
    - `logger`: Logger instance for logging.
  - Returns: `Promise<void>`

- **generateReport(reportfile, logger)**
  - Generates a summary report of the download process.
  - Parameters:
    - `reportfile`: Path to the report file.
    - `logger`: Logger instance for logging.
  - Returns: `void`

### fileUtils.js

Contains functions for file operations, including downloading files and confirming file overwrites.

#### Functions:

- **confirmOverwrite(file, rl, logger)**

  - Prompts the user to confirm file overwrite if the file already exists.
  - Parameters:
    - `file`: The file path.
    - `rl`: Readline interface for user input.
    - `logger`: Logger instance for logging.
  - Returns: `Promise<boolean>`

- **downloadFile(url, outputPath, overwrite, agent, rl, logger, metrics)**
  - Downloads a file from the given URL to the specified output path.
  - Parameters:
    - `url`: The URL of the file to download.
    - `outputPath`: The path where the file should be saved.
    - `overwrite`: Boolean flag indicating whether to overwrite existing files.
    - `agent`: The HTTP agent.
    - `rl`: Readline interface for user input.
    - `logger`: Logger instance for logging.
    - `metrics`: Metrics object for tracking download statistics.
  - Returns: `Promise<void>`

### logger.js

Provides a configured logger instance using Winston.

#### Functions:

- **createLogger(argv)**
  - Creates and configures a Winston logger instance.
  - Parameters:
    - `argv`: Command-line arguments for configuring the logger.
  - Returns: `Object` (Winston logger instance)

## Usage

Each of these modules is used in the main script (`varvis-download.js`) to provide specific functionalities such as authentication, configuration management, HTTP requests, file operations, and logging. This modular approach helps in keeping the code clean, organized, and maintainable.

```javascript
// Example of importing and using a function from configUtils.js
const { loadConfig } = require("./js/configUtils");
const config = loadConfig("./config.json");

// Example of using the logger
const logger = require("./js/logger")(argv);
logger.info("This is an info message");

// Example of using AuthService for authentication
const authService = new AuthService(logger, agent);
authService
  .login({ username, password }, target)
  .then(() => {
    logger.info("Login successful");
  })
  .catch((err) => {
    logger.error("Login failed", err);
  });
```
