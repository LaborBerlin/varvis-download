# ERROR, Cannot find module. API Reference

## confirmRestore

&lt;p&gt;Prompts the user to confirm restoration of an archived file.&lt;/p&gt;

### Parameters

| Name     | Type     | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| `file`   | `Object` | &lt;p&gt;The archived file object.&lt;/p&gt;        |
| `rl`     | `Object` | &lt;p&gt;The readline interface instance.&lt;/p&gt; |
| `logger` | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;             |

### Returns

**Type:** `Promise.&lt;boolean&gt;`

&lt;ul&gt;
&lt;li&gt;Resolves to true if the user confirms, otherwise false.&lt;/li&gt;
&lt;/ul&gt;

---

## fetchAnalysisIds

&lt;p&gt;Fetches analysis IDs based on sample IDs or LIMS IDs.&lt;/p&gt;

### Parameters

| Name        | Type                   | Description                                             |
| ----------- | ---------------------- | ------------------------------------------------------- |
| `target`    | `string`               | &lt;p&gt;The target for the Varvis API.&lt;/p&gt;       |
| `token`     | `string`               | &lt;p&gt;The CSRF token for authentication.&lt;/p&gt;   |
| `agent`     | `Object`               | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;             |
| `sampleIds` | `Array.&lt;string&gt;` | &lt;p&gt;The sample IDs to filter analyses.&lt;/p&gt;   |
| `limsIds`   | `Array.&lt;string&gt;` | &lt;p&gt;The LIMS IDs to filter analyses.&lt;/p&gt;     |
| `filters`   | `Array.&lt;string&gt;` | &lt;p&gt;An array of custom filters to apply.&lt;/p&gt; |
| `logger`    | `Object`               | &lt;p&gt;The logger instance.&lt;/p&gt;                 |

### Returns

**Type:** `Promise.&lt;Array.&lt;string&gt;&gt;`

&lt;ul&gt;
&lt;li&gt;An array of analysis IDs.&lt;/li&gt;
&lt;/ul&gt;

---

## getDownloadLinks

&lt;p&gt;Fetches the download links for specified file types from the Varvis API for a given analysis ID.&lt;/p&gt;

### Parameters

| Name              | Type                   | Description                                                      |
| ----------------- | ---------------------- | ---------------------------------------------------------------- |
| `analysisId`      | `string`               | &lt;p&gt;The analysis ID to get download links for.&lt;/p&gt;    |
| `filter`          | `Array.&lt;string&gt;` | &lt;p&gt;An optional array of file types to filter by.&lt;/p&gt; |
| `target`          | `string`               | &lt;p&gt;The Varvis API target.&lt;/p&gt;                        |
| `token`           | `string`               | &lt;p&gt;The CSRF token for authentication.&lt;/p&gt;            |
| `agent`           | `Object`               | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;                      |
| `logger`          | `Object`               | &lt;p&gt;The logger instance.&lt;/p&gt;                          |
| `restoreArchived` | `string`               | &lt;p&gt;Restoration mode for archived files.                    |

Accepts:

- &amp;quot;no&amp;quot;: skip restoration,
- &amp;quot;ask&amp;quot;: prompt for each file,
- &amp;quot;all&amp;quot;: ask once for all files,
- &amp;quot;force&amp;quot;: restore automatically.&lt;/p&gt; |
  | `rl` | `Object` | &lt;p&gt;The readline interface instance for prompting.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;Object&gt;`

&lt;ul&gt;
&lt;li&gt;An object containing the download links for the specified file types.&lt;/li&gt;
&lt;/ul&gt;

---

## listAvailableFiles

&lt;p&gt;Lists available files for the specified analysis IDs without triggering any restoration logic.&lt;/p&gt;

### Parameters

| Name         | Type     | Description                                           |
| ------------ | -------- | ----------------------------------------------------- |
| `analysisId` | `string` | &lt;p&gt;The analysis ID to list files for.&lt;/p&gt; |
| `target`     | `string` | &lt;p&gt;The target for the Varvis API.&lt;/p&gt;     |
| `token`      | `string` | &lt;p&gt;The CSRF token for authentication.&lt;/p&gt; |
| `agent`      | `Object` | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;           |
| `logger`     | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;               |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## generateReport

&lt;p&gt;Generates a summary report of the download process.&lt;/p&gt;

### Parameters

| Name         | Type     | Description                                     |
| ------------ | -------- | ----------------------------------------------- |
| `reportfile` | `string` | &lt;p&gt;The path to the report file.&lt;/p&gt; |
| `logger`     | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;         |

---

## createApiClient

&lt;p&gt;Creates and configures an API client instance.&lt;/p&gt;

### Parameters

| Name     | Type     | Description                                 |
| -------- | -------- | ------------------------------------------- |
| `agent`  | `Object` | &lt;p&gt;The HTTP agent instance.&lt;/p&gt; |
| `logger` | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;     |

### Returns

**Type:** `ApiClient`

&lt;ul&gt;
&lt;li&gt;The configured API client instance.&lt;/li&gt;
&lt;/ul&gt;

---

## triggerRestoreArchivedFile

&lt;p&gt;Triggers restoration for an archived analysis file using the internal restore endpoint.&lt;/p&gt;

### Parameters

| Name              | Type     | Description                                                                         |
| ----------------- | -------- | ----------------------------------------------------------------------------------- |
| `analysisId`      | `string` | &lt;p&gt;The analysis ID of the archived file.&lt;/p&gt;                            |
| `file`            | `Object` | &lt;p&gt;The file object from the API response (should include fileName).&lt;/p&gt; |
| `target`          | `string` | &lt;p&gt;The target for the Varvis API.&lt;/p&gt;                                   |
| `token`           | `string` | &lt;p&gt;The CSRF token for authentication.&lt;/p&gt;                               |
| `agent`           | `Object` | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;                                         |
| `logger`          | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;                                             |
| `restorationFile` | `string` | &lt;p&gt;Optional path/name for the awaiting restoration JSON file.&lt;/p&gt;       |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## appendToAwaitingRestoration

&lt;p&gt;Appends or updates restoration information in an awaiting-restoration JSON file.
The entry is identified by matching analysisId, fileName, and options.&lt;/p&gt;

### Parameters

| Name              | Type     | Description                                                                                                     |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `restorationInfo` | `Object` | &lt;p&gt;An object containing restoration details (analysisId, fileName, restoreEstimation, options).&lt;/p&gt; |
| `logger`          | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;                                                                         |
| `restorationFile` | `string` | &lt;p&gt;Optional path/name for the awaiting restoration JSON file.&lt;/p&gt;                                   |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## resumeArchivedDownloads

&lt;p&gt;Resumes downloads for archived files as specified in the awaiting-restoration JSON file.
For each entry, if the current time is past the restoreEstimation, it attempts to download the file.
On success, the entry is removed; otherwise, it is kept for later resumption.&lt;/p&gt;

### Parameters

| Name              | Type      | Description                                                             |
| ----------------- | --------- | ----------------------------------------------------------------------- |
| `restorationFile` | `string`  | &lt;p&gt;The path/name of the awaiting-restoration JSON file.&lt;/p&gt; |
| `destination`     | `string`  | &lt;p&gt;The destination folder for downloads.&lt;/p&gt;                |
| `target`          | `string`  | &lt;p&gt;The Varvis API target.&lt;/p&gt;                               |
| `token`           | `string`  | &lt;p&gt;The CSRF token for authentication.&lt;/p&gt;                   |
| `agent`           | `Object`  | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;                             |
| `logger`          | `Object`  | &lt;p&gt;The logger instance.&lt;/p&gt;                                 |
| `overwrite`       | `boolean` | &lt;p&gt;Flag indicating whether to overwrite existing files.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## loadConfig

&lt;p&gt;Loads configuration from a specified file.&lt;/p&gt;

### Parameters

| Name             | Type     | Description                                            |
| ---------------- | -------- | ------------------------------------------------------ |
| `configFilePath` | `string` | &lt;p&gt;The path to the configuration file.&lt;/p&gt; |

### Returns

**Type:** `Object`

&lt;ul&gt;
&lt;li&gt;The parsed configuration object.&lt;/li&gt;
&lt;/ul&gt;

---

## loadLogo

&lt;p&gt;Reads the ASCII logo from the logo.txt file.&lt;/p&gt;

### Returns

**Type:** `string`

&lt;ul&gt;
&lt;li&gt;The ASCII logo.&lt;/li&gt;
&lt;/ul&gt;

---

## getLastModifiedDate

&lt;p&gt;Gets the last modified date of a specified file.&lt;/p&gt;

### Parameters

| Name       | Type     | Description                              |
| ---------- | -------- | ---------------------------------------- |
| `filePath` | `string` | &lt;p&gt;The path to the file.&lt;/p&gt; |

### Returns

**Type:** `string`

&lt;ul&gt;
&lt;li&gt;The last modified date in YYYY-MM-DD format.&lt;/li&gt;
&lt;/ul&gt;

---

## confirmRestore

&lt;p&gt;Prompts the user to confirm restoration of an archived file.&lt;/p&gt;

### Parameters

| Name     | Type     | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| `file`   | `Object` | &lt;p&gt;The archived file object.&lt;/p&gt;        |
| `rl`     | `Object` | &lt;p&gt;The readline interface instance.&lt;/p&gt; |
| `logger` | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;             |

### Returns

**Type:** `Promise.&lt;boolean&gt;`

&lt;ul&gt;
&lt;li&gt;Resolves to true if the user confirms, otherwise false.&lt;/li&gt;
&lt;/ul&gt;

---

## fetchAnalysisIds

&lt;p&gt;Fetches analysis IDs based on sample IDs or LIMS IDs.&lt;/p&gt;

### Parameters

| Name        | Type                   | Description                                             |
| ----------- | ---------------------- | ------------------------------------------------------- |
| `target`    | `string`               | &lt;p&gt;The target for the Varvis API.&lt;/p&gt;       |
| `token`     | `string`               | &lt;p&gt;The CSRF token for authentication.&lt;/p&gt;   |
| `agent`     | `Object`               | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;             |
| `sampleIds` | `Array.&lt;string&gt;` | &lt;p&gt;The sample IDs to filter analyses.&lt;/p&gt;   |
| `limsIds`   | `Array.&lt;string&gt;` | &lt;p&gt;The LIMS IDs to filter analyses.&lt;/p&gt;     |
| `filters`   | `Array.&lt;string&gt;` | &lt;p&gt;An array of custom filters to apply.&lt;/p&gt; |
| `logger`    | `Object`               | &lt;p&gt;The logger instance.&lt;/p&gt;                 |

### Returns

**Type:** `Promise.&lt;Array.&lt;string&gt;&gt;`

&lt;ul&gt;
&lt;li&gt;An array of analysis IDs.&lt;/li&gt;
&lt;/ul&gt;

---

## getDownloadLinks

&lt;p&gt;Fetches the download links for specified file types from the Varvis API for a given analysis ID.&lt;/p&gt;

### Parameters

| Name              | Type                   | Description                                                      |
| ----------------- | ---------------------- | ---------------------------------------------------------------- |
| `analysisId`      | `string`               | &lt;p&gt;The analysis ID to get download links for.&lt;/p&gt;    |
| `filter`          | `Array.&lt;string&gt;` | &lt;p&gt;An optional array of file types to filter by.&lt;/p&gt; |
| `target`          | `string`               | &lt;p&gt;The Varvis API target.&lt;/p&gt;                        |
| `token`           | `string`               | &lt;p&gt;The CSRF token for authentication.&lt;/p&gt;            |
| `agent`           | `Object`               | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;                      |
| `logger`          | `Object`               | &lt;p&gt;The logger instance.&lt;/p&gt;                          |
| `restoreArchived` | `string`               | &lt;p&gt;Restoration mode for archived files.                    |

Accepts:

- &amp;quot;no&amp;quot;: skip restoration,
- &amp;quot;ask&amp;quot;: prompt for each file,
- &amp;quot;all&amp;quot;: ask once for all files,
- &amp;quot;force&amp;quot;: restore automatically.&lt;/p&gt; |
  | `rl` | `Object` | &lt;p&gt;The readline interface instance for prompting.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;Object&gt;`

&lt;ul&gt;
&lt;li&gt;An object containing the download links for the specified file types.&lt;/li&gt;
&lt;/ul&gt;

---

## listAvailableFiles

&lt;p&gt;Lists available files for the specified analysis IDs without triggering any restoration logic.&lt;/p&gt;

### Parameters

| Name         | Type     | Description                                           |
| ------------ | -------- | ----------------------------------------------------- |
| `analysisId` | `string` | &lt;p&gt;The analysis ID to list files for.&lt;/p&gt; |
| `target`     | `string` | &lt;p&gt;The target for the Varvis API.&lt;/p&gt;     |
| `token`      | `string` | &lt;p&gt;The CSRF token for authentication.&lt;/p&gt; |
| `agent`      | `Object` | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;           |
| `logger`     | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;               |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## generateReport

&lt;p&gt;Generates a summary report of the download process.&lt;/p&gt;

### Parameters

| Name         | Type     | Description                                     |
| ------------ | -------- | ----------------------------------------------- |
| `reportfile` | `string` | &lt;p&gt;The path to the report file.&lt;/p&gt; |
| `logger`     | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;         |

---

## confirmOverwrite

&lt;p&gt;Prompts the user to confirm file overwrite if the file already exists.&lt;/p&gt;

### Parameters

| Name     | Type     | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| `file`   | `string` | &lt;p&gt;The file path.&lt;/p&gt;                   |
| `rl`     | `Object` | &lt;p&gt;The readline interface instance.&lt;/p&gt; |
| `logger` | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;             |

### Returns

**Type:** `Promise.&lt;boolean&gt;`

&lt;ul&gt;
&lt;li&gt;True if the user confirms overwrite, otherwise false.&lt;/li&gt;
&lt;/ul&gt;

---

## downloadFile

&lt;p&gt;Downloads a file from the given URL to the specified output path with progress reporting.&lt;/p&gt;

### Parameters

| Name         | Type      | Description                                                             |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `url`        | `string`  | &lt;p&gt;The URL of the file to download.&lt;/p&gt;                     |
| `outputPath` | `string`  | &lt;p&gt;The path where the file should be saved.&lt;/p&gt;             |
| `overwrite`  | `boolean` | &lt;p&gt;Flag indicating whether to overwrite existing files.&lt;/p&gt; |
| `agent`      | `Object`  | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;                             |
| `rl`         | `Object`  | &lt;p&gt;The readline interface instance.&lt;/p&gt;                     |
| `logger`     | `Object`  | &lt;p&gt;The logger instance.&lt;/p&gt;                                 |
| `metrics`    | `Object`  | &lt;p&gt;The metrics object for tracking download stats.&lt;/p&gt;      |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## parseFilterExpression

&lt;p&gt;Parses a filter expression like &#x27;analysisType&#x3D;SNV&#x27; or &#x27;sampleId&amp;gt;LB24-0001&#x27;&lt;/p&gt;

### Parameters

| Name               | Type     | Description                                                            |
| ------------------ | -------- | ---------------------------------------------------------------------- |
| `filterExpression` | `string` | &lt;p&gt;The filter expression (e.g., analysisType&#x3D;SNV)&lt;/p&gt; |

### Returns

**Type:** `Object`

&lt;ul&gt;
&lt;li&gt;An object containing field, operator, and value (e.g., { field: &#x27;analysisType&#x27;, operator: &#x27;&#x3D;&#x27;, value: &#x27;SNV&#x27; })&lt;/li&gt;
&lt;/ul&gt;

---

## applyFilter

&lt;p&gt;Applies a single filter to a list of analyses&lt;/p&gt;

### Parameters

| Name       | Type     | Description                                                                                                                               |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `analyses` | `Array`  | &lt;p&gt;List of analyses returned by the API&lt;/p&gt;                                                                                   |
| `filter`   | `Object` | &lt;p&gt;Parsed filter object (e.g., { field: &#x27;analysisType&#x27;, operator: &#x27;&#x3D;&#x27;, value: &#x27;SNV&#x27; })&lt;/p&gt; |

### Returns

**Type:** `Array`

&lt;ul&gt;
&lt;li&gt;Filtered list of analyses&lt;/li&gt;
&lt;/ul&gt;

---

## applyFilters

&lt;p&gt;Applies multiple filters to a list of analyses&lt;/p&gt;

### Parameters

| Name                | Type    | Description                                                                                                                       |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `analyses`          | `Array` | &lt;p&gt;List of analyses returned by the API&lt;/p&gt;                                                                           |
| `filterExpressions` | `Array` | &lt;p&gt;Array of filter expressions (e.g., [&#x27;analysisType&#x3D;SNV&#x27;, &#x27;sampleId&amp;gt;LB24-0001&#x27;])&lt;/p&gt; |

### Returns

**Type:** `Array`

&lt;ul&gt;
&lt;li&gt;Filtered list of analyses&lt;/li&gt;
&lt;/ul&gt;

---

## createLogger

&lt;p&gt;Creates a logger with specified configuration.&lt;/p&gt;

### Parameters

| Name   | Type     | Description                                    |
| ------ | -------- | ---------------------------------------------- |
| `argv` | `Object` | &lt;p&gt;The command line arguments.&lt;/p&gt; |

### Returns

**Type:** `Object`

&lt;ul&gt;
&lt;li&gt;The created logger instance.&lt;/li&gt;
&lt;/ul&gt;

---

## spawnPromise

&lt;p&gt;Wraps spawn in a Promise to maintain async/await syntax.&lt;/p&gt;

### Parameters

| Name            | Type                   | Description                                                    |
| --------------- | ---------------------- | -------------------------------------------------------------- |
| `command`       | `string`               | &lt;p&gt;The command to execute.&lt;/p&gt;                     |
| `args`          | `Array.&lt;string&gt;` | &lt;p&gt;The command arguments.&lt;/p&gt;                      |
| `logger`        | `Object`               | &lt;p&gt;The logger instance.&lt;/p&gt;                        |
| `captureOutput` | `boolean`              | &lt;p&gt;Whether to capture stdout for return value.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;Object&gt;`

&lt;ul&gt;
&lt;li&gt;Resolves with result object when the process completes successfully.&lt;/li&gt;
&lt;/ul&gt;

---

## checkToolAvailability

&lt;p&gt;Checks if a tool is available and meets the minimum version.&lt;/p&gt;

### Parameters

| Name             | Type     | Description                                                          |
| ---------------- | -------- | -------------------------------------------------------------------- |
| `tool`           | `string` | &lt;p&gt;The name of the tool (samtools, tabix, or bgzip).&lt;/p&gt; |
| `versionCommand` | `string` | &lt;p&gt;Command to check the tool version.&lt;/p&gt;                |
| `minVersion`     | `string` | &lt;p&gt;The minimal required version.&lt;/p&gt;                     |
| `logger`         | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;                              |

### Returns

**Type:** `Promise.&lt;boolean&gt;`

&lt;ul&gt;
&lt;li&gt;Resolves to true if the tool is available and meets the version requirement.&lt;/li&gt;
&lt;/ul&gt;

---

## compareVersions

&lt;p&gt;Compares two versions (e.g., &#x27;1.10&#x27; vs &#x27;1.9&#x27;).&lt;/p&gt;

### Parameters

| Name         | Type     | Description                                      |
| ------------ | -------- | ------------------------------------------------ |
| `version`    | `string` | &lt;p&gt;The current version.&lt;/p&gt;          |
| `minVersion` | `string` | &lt;p&gt;The minimum required version.&lt;/p&gt; |

### Returns

**Type:** `boolean`

&lt;ul&gt;
&lt;li&gt;True if the current version is &amp;gt;&#x3D; the minimum version.&lt;/li&gt;
&lt;/ul&gt;

---

## rangedDownloadBAM

&lt;p&gt;Performs a ranged download for a BAM file using samtools.&lt;/p&gt;

### Parameters

| Name         | Type      | Description                                                             |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `url`        | `string`  | &lt;p&gt;The URL of the BAM file.&lt;/p&gt;                             |
| `range`      | `string`  | &lt;p&gt;The genomic range (e.g., &#x27;chr1:1-100000&#x27;).&lt;/p&gt; |
| `outputFile` | `string`  | &lt;p&gt;The output file name.&lt;/p&gt;                                |
| `indexFile`  | `string`  | &lt;p&gt;The path to the downloaded .bai index file.&lt;/p&gt;          |
| `logger`     | `Object`  | &lt;p&gt;The logger instance.&lt;/p&gt;                                 |
| `overwrite`  | `boolean` | &lt;p&gt;Flag indicating whether to overwrite existing files.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## rangedDownloadVCF

&lt;p&gt;Performs a ranged download for a VCF file using tabix, and compresses it using bgzip.&lt;/p&gt;

### Parameters

| Name         | Type      | Description                                                             |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `url`        | `string`  | &lt;p&gt;The URL of the VCF file.&lt;/p&gt;                             |
| `range`      | `string`  | &lt;p&gt;The genomic range (e.g., &#x27;chr1:1-100000&#x27;).&lt;/p&gt; |
| `outputFile` | `string`  | &lt;p&gt;The output file name (compressed as .vcf.gz).&lt;/p&gt;        |
| `logger`     | `Object`  | &lt;p&gt;The logger instance.&lt;/p&gt;                                 |
| `overwrite`  | `boolean` | &lt;p&gt;Flag indicating whether to overwrite existing files.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## indexBAM

&lt;p&gt;Indexes a BAM file using samtools.&lt;/p&gt;

### Parameters

| Name        | Type      | Description                                                                   |
| ----------- | --------- | ----------------------------------------------------------------------------- |
| `bamFile`   | `string`  | &lt;p&gt;The path to the BAM file.&lt;/p&gt;                                  |
| `logger`    | `Object`  | &lt;p&gt;The logger instance.&lt;/p&gt;                                       |
| `overwrite` | `boolean` | &lt;p&gt;Flag indicating whether to overwrite existing index files.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## indexVCF

&lt;p&gt;Indexes a VCF.gz file using tabix.&lt;/p&gt;

### Parameters

| Name        | Type      | Description                                                                   |
| ----------- | --------- | ----------------------------------------------------------------------------- |
| `vcfGzFile` | `string`  | &lt;p&gt;The path to the VCF.gz file.&lt;/p&gt;                               |
| `logger`    | `Object`  | &lt;p&gt;The logger instance.&lt;/p&gt;                                       |
| `overwrite` | `boolean` | &lt;p&gt;Flag indicating whether to overwrite existing index files.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## ensureIndexFile

&lt;p&gt;Ensures that the required index file is downloaded for a BAM or VCF file.&lt;/p&gt;

### Parameters

| Name            | Type      | Description                                                             |
| --------------- | --------- | ----------------------------------------------------------------------- |
| `fileUrl`       | `string`  | &lt;p&gt;The URL of the BAM or VCF file.&lt;/p&gt;                      |
| `indexUrl`      | `string`  | &lt;p&gt;The URL of the index file (.bai or .tbi).&lt;/p&gt;            |
| `indexFilePath` | `string`  | &lt;p&gt;The local path to the index file.&lt;/p&gt;                    |
| `agent`         | `Object`  | &lt;p&gt;The HTTP agent instance.&lt;/p&gt;                             |
| `rl`            | `Object`  | &lt;p&gt;The readline interface instance.&lt;/p&gt;                     |
| `logger`        | `Object`  | &lt;p&gt;The logger instance.&lt;/p&gt;                                 |
| `metrics`       | `Object`  | &lt;p&gt;The metrics object for tracking download stats.&lt;/p&gt;      |
| `overwrite`     | `boolean` | &lt;p&gt;Flag indicating whether to overwrite existing files.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;void&gt;`

---

## generateOutputFileName

&lt;p&gt;Generates an output file name by appending the genomic range or &amp;quot;multiple-regions&amp;quot; if more than one range is provided.
If no regions are provided, the original filename is returned. This applies to all file types (BAM, VCF, etc.).&lt;/p&gt;

### Parameters

| Name       | Type     | Description                                                                                      |
| ---------- | -------- | ------------------------------------------------------------------------------------------------ |
| `fileName` | `string` | &lt;p&gt;The original file name.&lt;/p&gt;                                                       |
| `regions`  | `string` | &lt;p&gt;A string representing a single genomic range or an array of multiple regions.&lt;/p&gt; |
| `logger`   | `Object` | &lt;p&gt;The logger instance.&lt;/p&gt;                                                          |

### Returns

**Type:** `string`

&lt;ul&gt;
&lt;li&gt;The new file name with the range appended, or the original file name.&lt;/li&gt;
&lt;/ul&gt;

---

## fetchWithRetry

&lt;p&gt;Retries a fetch operation with a specified number of attempts.&lt;/p&gt;

### Parameters

| Name      | Type     | Description                                      |
| --------- | -------- | ------------------------------------------------ |
| `url`     | `string` | &lt;p&gt;The URL to fetch.&lt;/p&gt;             |
| `options` | `Object` | &lt;p&gt;The fetch options.&lt;/p&gt;            |
| `retries` | `number` | &lt;p&gt;The number of retry attempts.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;Response&gt;`

&lt;ul&gt;
&lt;li&gt;The fetch response.&lt;/li&gt;
&lt;/ul&gt;

---

## getCsrfToken

&lt;p&gt;Fetches the CSRF token required for login.&lt;/p&gt;

### Parameters

| Name     | Type     | Description                                       |
| -------- | -------- | ------------------------------------------------- |
| `target` | `string` | &lt;p&gt;The target for the Varvis API.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;string&gt;`

&lt;ul&gt;
&lt;li&gt;The CSRF token.&lt;/li&gt;
&lt;/ul&gt;

---

## login

&lt;p&gt;Logs in to the Varvis API and retrieves the CSRF token.&lt;/p&gt;

### Parameters

| Name            | Type     | Description                                       |
| --------------- | -------- | ------------------------------------------------- |
| `user`          | `Object` | &lt;p&gt;The user credentials.&lt;/p&gt;          |
| `user.username` | `string` | &lt;p&gt;The username.&lt;/p&gt;                  |
| `user.password` | `string` | &lt;p&gt;The password.&lt;/p&gt;                  |
| `target`        | `string` | &lt;p&gt;The target for the Varvis API.&lt;/p&gt; |

### Returns

**Type:** `Promise.&lt;Object&gt;`

&lt;ul&gt;
&lt;li&gt;The login response containing the CSRF token.&lt;/li&gt;
&lt;/ul&gt;

---

## Class: ApiClient

&lt;p&gt;API Client class for handling HTTP requests with retry logic and agent management.&lt;/p&gt;

## Class: AuthService

&lt;p&gt;AuthService class handles authentication with the Varvis API.&lt;/p&gt;
