#
ERROR, Cannot find module.
API Reference


  ##
  triggerRestoreArchivedFile

    &lt;p&gt;Triggers restoration for an archived analysis file using the internal restore endpoint.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analysisId` | `string` |
      <p>The analysis ID of the archived file.</p>
      |
      | `file` | `Object` |
      <p>The file object from the API response (should include fileName).</p>
      |
      | `target` | `string` |
      <p>The target for the Varvis API.</p>
      |
      | `token` | `string` |
      <p>The CSRF token for authentication.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `restorationFile` | `string` |
      <p>Optional path/name for the awaiting restoration JSON file.</p>
      |
      | `options` | `Object` |
      <p>Options object for restoration context.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  appendToAwaitingRestoration

    &lt;p&gt;Appends or updates restoration information in an awaiting-restoration JSON file.
The entry is identified by matching analysisId, fileName, and options.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `restorationInfo` | `Object` |
      <p>An object containing restoration details (analysisId, fileName, restoreEstimation, options).</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `restorationFile` | `string` |
      <p>Optional path/name for the awaiting restoration JSON file.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  resumeArchivedDownloads

    &lt;p&gt;Resumes downloads for archived files as specified in the awaiting-restoration JSON file.
For each entry, if the current time is past the restoreEstimation, it attempts to download the file
using the restored context options. On success, the entry is removed; otherwise, it is kept for later resumption.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `restorationFile` | `string` |
      <p>The path/name of the awaiting-restoration JSON file.</p>
      |
      | `destination` | `string` |
      <p>The destination folder for downloads.</p>
      |
      | `target` | `string` |
      <p>The Varvis API target.</p>
      |
      | `token` | `string` |
      <p>The CSRF token for authentication.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `overwrite` | `boolean` |
      <p>Flag indicating whether to overwrite existing files.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  createApiClient

    &lt;p&gt;Creates and configures an API client instance.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |

    ### Returns **Type:** `ApiClient`

      <ul>
<li>The configured API client instance.</li>
</ul>


  ---

  ##
  triggerRestoreArchivedFile

    &lt;p&gt;Triggers restoration for an archived analysis file using the internal restore endpoint.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analysisId` | `string` |
      <p>The analysis ID of the archived file.</p>
      |
      | `file` | `Object` |
      <p>The file object from the API response (should include fileName).</p>
      |
      | `target` | `string` |
      <p>The target for the Varvis API.</p>
      |
      | `token` | `string` |
      <p>The CSRF token for authentication.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `restorationFile` | `string` |
      <p>Optional path/name for the awaiting restoration JSON file.</p>
      |
      | `options` | `Object` |
      <p>Options object for restoration context.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  appendToAwaitingRestoration

    &lt;p&gt;Appends or updates restoration information in an awaiting-restoration JSON file.
The entry is identified by matching analysisId, fileName, and options.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `restorationInfo` | `Object` |
      <p>An object containing restoration details (analysisId, fileName, restoreEstimation, options).</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `restorationFile` | `string` |
      <p>Optional path/name for the awaiting restoration JSON file.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  resumeArchivedDownloads

    &lt;p&gt;Resumes downloads for archived files as specified in the awaiting-restoration JSON file.
For each entry, if the current time is past the restoreEstimation, it attempts to download the file
using the restored context options. On success, the entry is removed; otherwise, it is kept for later resumption.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `restorationFile` | `string` |
      <p>The path/name of the awaiting-restoration JSON file.</p>
      |
      | `destination` | `string` |
      <p>The destination folder for downloads.</p>
      |
      | `target` | `string` |
      <p>The Varvis API target.</p>
      |
      | `token` | `string` |
      <p>The CSRF token for authentication.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `overwrite` | `boolean` |
      <p>Flag indicating whether to overwrite existing files.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  loadConfig

    &lt;p&gt;Loads configuration from a specified file.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `configFilePath` | `string` |
      <p>The path to the configuration file.</p>
      |

    ### Returns **Type:** `Object`

      <ul>
<li>The parsed configuration object.</li>
</ul>


  ---

  ##
  loadLogo

    &lt;p&gt;Reads the ASCII logo from the logo.txt file.&lt;/p&gt;


    ### Returns **Type:** `string`

      <ul>
<li>The ASCII logo.</li>
</ul>


  ---

  ##
  getLastModifiedDate

    &lt;p&gt;Gets the last modified date of a specified file.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `filePath` | `string` |
      <p>The path to the file.</p>
      |

    ### Returns **Type:** `string`

      <ul>
<li>The last modified date in YYYY-MM-DD format.</li>
</ul>


  ---

  ##
  confirmRestore

    &lt;p&gt;Prompts the user to confirm restoration of an archived file.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `file` | `Object` |
      <p>The archived file object.</p>
      |
      | `rl` | `Object` |
      <p>The readline interface instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |

    ### Returns **Type:** `Promise.&lt;boolean&gt;`

      <ul>
<li>Resolves to true if the user confirms, otherwise false.</li>
</ul>


  ---

  ##
  fetchAnalysisIds

    &lt;p&gt;Fetches analysis IDs based on sample IDs or LIMS IDs.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `target` | `string` |
      <p>The target for the Varvis API.</p>
      |
      | `token` | `string` |
      <p>The CSRF token for authentication.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `sampleIds` | `Array.&lt;string&gt;` |
      <p>The sample IDs to filter analyses.</p>
      |
      | `limsIds` | `Array.&lt;string&gt;` |
      <p>The LIMS IDs to filter analyses.</p>
      |
      | `filters` | `Array.&lt;string&gt;` |
      <p>An array of custom filters to apply.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |

    ### Returns **Type:** `Promise.&lt;Array.&lt;string&gt;&gt;`

      <ul>
<li>An array of analysis IDs.</li>
</ul>


  ---

  ##
  getDownloadLinks

    &lt;p&gt;Fetches the download links for specified file types from the Varvis API for a given analysis ID.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analysisId` | `string` |
      <p>The analysis ID to get download links for.</p>
      |
      | `filter` | `Array.&lt;string&gt;` |
      <p>An optional array of file types to filter by.</p>
      |
      | `target` | `string` |
      <p>The Varvis API target.</p>
      |
      | `token` | `string` |
      <p>The CSRF token for authentication.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `restoreArchived` | `string` |
      <p>Restoration mode for archived files.
Accepts:
- &quot;no&quot;: skip restoration,
- &quot;ask&quot;: prompt for each file,
- &quot;all&quot;: ask once for all files,
- &quot;force&quot;: restore automatically.</p>
      |
      | `rl` | `Object` |
      <p>The readline interface instance for prompting.</p>
      |
      | `restorationFile` | `string` |
      <p>Path to the restoration file.</p>
      |
      | `options` | `Object` |
      <p>Options object for restoration context.</p>
      |

    ### Returns **Type:** `Promise.&lt;Object&gt;`

      <ul>
<li>An object containing the download links for the specified file types.</li>
</ul>


  ---

  ##
  listAvailableFiles

    &lt;p&gt;Lists available files for the specified analysis IDs without triggering any restoration logic.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analysisId` | `string` |
      <p>The analysis ID to list files for.</p>
      |
      | `target` | `string` |
      <p>The target for the Varvis API.</p>
      |
      | `token` | `string` |
      <p>The CSRF token for authentication.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  generateReport

    &lt;p&gt;Generates a summary report of the download process.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `reportfile` | `string` |
      <p>The path to the report file.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |



  ---

  ##
  confirmOverwrite

    &lt;p&gt;Prompts the user to confirm file overwrite if the file already exists.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `file` | `string` |
      <p>The file path.</p>
      |
      | `rl` | `Object` |
      <p>The readline interface instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |

    ### Returns **Type:** `Promise.&lt;boolean&gt;`

      <ul>
<li>True if the user confirms overwrite, otherwise false.</li>
</ul>


  ---

  ##
  downloadFile

    &lt;p&gt;Downloads a file from the given URL to the specified output path with progress reporting.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `url` | `string` |
      <p>The URL of the file to download.</p>
      |
      | `outputPath` | `string` |
      <p>The path where the file should be saved.</p>
      |
      | `overwrite` | `boolean` |
      <p>Flag indicating whether to overwrite existing files.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `rl` | `Object` |
      <p>The readline interface instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `metrics` | `Object` |
      <p>The metrics object for tracking download stats.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  parseFilterExpression

    &lt;p&gt;Parses a filter expression like &#x27;analysisType&#x3D;SNV&#x27; or &#x27;sampleId&amp;gt;LB24-0001&#x27;&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `filterExpression` | `string` |
      <p>The filter expression (e.g., analysisType=SNV)</p>
      |

    ### Returns **Type:** `Object`

      <ul>
<li>An object containing field, operator, and value (e.g., { field: 'analysisType', operator: '=', value: 'SNV' })</li>
</ul>


  ---

  ##
  applyFilter

    &lt;p&gt;Applies a single filter to a list of analyses&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analyses` | `Array` |
      <p>List of analyses returned by the API</p>
      |
      | `filter` | `Object` |
      <p>Parsed filter object (e.g., { field: 'analysisType', operator: '=', value: 'SNV' })</p>
      |

    ### Returns **Type:** `Array`

      <ul>
<li>Filtered list of analyses</li>
</ul>


  ---

  ##
  applyFilters

    &lt;p&gt;Applies multiple filters to a list of analyses&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analyses` | `Array` |
      <p>List of analyses returned by the API</p>
      |
      | `filterExpressions` | `Array` |
      <p>Array of filter expressions (e.g., ['analysisType=SNV', 'sampleId&gt;LB24-0001'])</p>
      |

    ### Returns **Type:** `Array`

      <ul>
<li>Filtered list of analyses</li>
</ul>


  ---

  ##
  createLogger

    &lt;p&gt;Creates a logger with specified configuration.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `argv` | `Object` |
      <p>The command line arguments.</p>
      |

    ### Returns **Type:** `Object`

      <ul>
<li>The created logger instance.</li>
</ul>


  ---

  ##
  spawnPromise

    &lt;p&gt;Wraps spawn in a Promise to maintain async/await syntax.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `command` | `string` |
      <p>The command to execute.</p>
      |
      | `args` | `Array.&lt;string&gt;` |
      <p>The command arguments.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `captureOutput` | `boolean` |
      <p>Whether to capture stdout for return value.</p>
      |

    ### Returns **Type:** `Promise.&lt;Object&gt;`

      <ul>
<li>Resolves with result object when the process completes successfully.</li>
</ul>


  ---

  ##
  checkToolAvailability

    &lt;p&gt;Checks if a tool is available and meets the minimum version.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `tool` | `string` |
      <p>The name of the tool (samtools, tabix, or bgzip).</p>
      |
      | `versionCommand` | `string` |
      <p>Command to check the tool version.</p>
      |
      | `minVersion` | `string` |
      <p>The minimal required version.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |

    ### Returns **Type:** `Promise.&lt;boolean&gt;`

      <ul>
<li>Resolves to true if the tool is available and meets the version requirement.</li>
</ul>


  ---

  ##
  compareVersions

    &lt;p&gt;Compares two versions (e.g., &#x27;1.10&#x27; vs &#x27;1.9&#x27;).&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `version` | `string` |
      <p>The current version.</p>
      |
      | `minVersion` | `string` |
      <p>The minimum required version.</p>
      |

    ### Returns **Type:** `boolean`

      <ul>
<li>True if the current version is &gt;= the minimum version.</li>
</ul>


  ---

  ##
  rangedDownloadBAM

    &lt;p&gt;Performs a ranged download for a BAM file using samtools.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `url` | `string` |
      <p>The URL of the BAM file.</p>
      |
      | `range` | `string` |
      <p>The genomic range (e.g., 'chr1:1-100000').</p>
      |
      | `outputFile` | `string` |
      <p>The output file name.</p>
      |
      | `indexFile` | `string` |
      <p>The path to the downloaded .bai index file.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `overwrite` | `boolean` |
      <p>Flag indicating whether to overwrite existing files.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  rangedDownloadVCF

    &lt;p&gt;Performs a ranged download for a VCF file using tabix, and compresses it using bgzip.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `url` | `string` |
      <p>The URL of the VCF file.</p>
      |
      | `range` | `string` |
      <p>The genomic range (e.g., 'chr1:1-100000').</p>
      |
      | `outputFile` | `string` |
      <p>The output file name (compressed as .vcf.gz).</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `overwrite` | `boolean` |
      <p>Flag indicating whether to overwrite existing files.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  indexBAM

    &lt;p&gt;Indexes a BAM file using samtools.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `bamFile` | `string` |
      <p>The path to the BAM file.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `overwrite` | `boolean` |
      <p>Flag indicating whether to overwrite existing index files.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  indexVCF

    &lt;p&gt;Indexes a VCF.gz file using tabix.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `vcfGzFile` | `string` |
      <p>The path to the VCF.gz file.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `overwrite` | `boolean` |
      <p>Flag indicating whether to overwrite existing index files.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  ensureIndexFile

    &lt;p&gt;Ensures that the required index file is downloaded for a BAM or VCF file.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `fileUrl` | `string` |
      <p>The URL of the BAM or VCF file.</p>
      |
      | `indexUrl` | `string` |
      <p>The URL of the index file (.bai or .tbi).</p>
      |
      | `indexFilePath` | `string` |
      <p>The local path to the index file.</p>
      |
      | `agent` | `Object` |
      <p>The HTTP agent instance.</p>
      |
      | `rl` | `Object` |
      <p>The readline interface instance.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |
      | `metrics` | `Object` |
      <p>The metrics object for tracking download stats.</p>
      |
      | `overwrite` | `boolean` |
      <p>Flag indicating whether to overwrite existing files.</p>
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  generateOutputFileName

    &lt;p&gt;Generates an output file name by appending the genomic range or &amp;quot;multiple-regions&amp;quot; if more than one range is provided.
If no regions are provided, the original filename is returned. This applies to all file types (BAM, VCF, etc.).&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `fileName` | `string` |
      <p>The original file name.</p>
      |
      | `regions` | `string` |
      <p>A string representing a single genomic range or an array of multiple regions.</p>
      |
      | `logger` | `Object` |
      <p>The logger instance.</p>
      |

    ### Returns **Type:** `string`

      <ul>
<li>The new file name with the range appended, or the original file name.</li>
</ul>


  ---

  ##
  fetchWithRetry

    &lt;p&gt;Retries a fetch operation with a specified number of attempts.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `url` | `string` |
      <p>The URL to fetch.</p>
      |
      | `options` | `Object` |
      <p>The fetch options.</p>
      |
      | `retries` | `number` |
      <p>The number of retry attempts.</p>
      |

    ### Returns **Type:** `Promise.&lt;Response&gt;`

      <ul>
<li>The fetch response.</li>
</ul>


  ---

  ##
  getCsrfToken

    &lt;p&gt;Fetches the CSRF token required for login.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `target` | `string` |
      <p>The target for the Varvis API.</p>
      |

    ### Returns **Type:** `Promise.&lt;string&gt;`

      <ul>
<li>The CSRF token.</li>
</ul>


  ---

  ##
  login

    &lt;p&gt;Logs in to the Varvis API and retrieves the CSRF token.&lt;/p&gt;

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `user` | `Object` |
      <p>The user credentials.</p>
      |
      | `user.username` | `string` |
      <p>The username.</p>
      |
      | `user.password` | `string` |
      <p>The password.</p>
      |
      | `target` | `string` |
      <p>The target for the Varvis API.</p>
      |

    ### Returns **Type:** `Promise.&lt;Object&gt;`

      <ul>
<li>The login response containing the CSRF token.</li>
</ul>


  ---


  ## Class:
  ApiClient

    &lt;p&gt;API Client class for handling HTTP requests with retry logic and agent management.&lt;/p&gt;


  ## Class:
  AuthService

    &lt;p&gt;AuthService class handles authentication with the Varvis API.&lt;/p&gt;


