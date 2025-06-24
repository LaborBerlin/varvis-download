# API Reference


  ##
  confirmRestore

    Prompts the user to confirm restoration of an archived file.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `file` | `Object` |
      The archived file object.
      |
      | `rl` | `Object` |
      The readline interface instance.
      |
      | `logger` | `Object` |
      The logger instance.
      |

    ### Returns **Type:** `Promise.&lt;boolean&gt;`

      - Resolves to true if the user confirms, otherwise false.


  ---

  ##
  fetchAnalysisIds

    Fetches analysis IDs based on sample IDs or LIMS IDs.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `target` | `string` |
      The target for the Varvis API.
      |
      | `token` | `string` |
      The CSRF token for authentication.
      |
      | `agent` | `Object` |
      The HTTP agent instance.
      |
      | `sampleIds` | `Array.&lt;string&gt;` |
      The sample IDs to filter analyses.
      |
      | `limsIds` | `Array.&lt;string&gt;` |
      The LIMS IDs to filter analyses.
      |
      | `filters` | `Array.&lt;string&gt;` |
      An array of custom filters to apply.
      |
      | `logger` | `Object` |
      The logger instance.
      |

    ### Returns **Type:** `Promise.&lt;Array.&lt;string&gt;&gt;`

      - An array of analysis IDs.


  ---

  ##
  getDownloadLinks

    Fetches the download links for specified file types from the Varvis API for a given analysis ID.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analysisId` | `string` |
      The analysis ID to get download links for.
      |
      | `filter` | `Array.&lt;string&gt;` |
      An optional array of file types to filter by.
      |
      | `target` | `string` |
      The Varvis API target.
      |
      | `token` | `string` |
      The CSRF token for authentication.
      |
      | `agent` | `Object` |
      The HTTP agent instance.
      |
      | `logger` | `Object` |
      The logger instance.
      |
      | `restoreArchived` | `string` |
      Restoration mode for archived files.  Accepts:    - "no": skip restoration,    - "ask": prompt for each file,    - "all": ask once for all files,    - "force": restore automatically.
      |
      | `rl` | `Object` |
      The readline interface instance for prompting.
      |
      | `restorationFile` | `string` |
      Path to the restoration file.
      |
      | `options` | `Object` |
      Options object for restoration context.
      |

    ### Returns **Type:** `Promise.&lt;Object&gt;`

      - An object containing the download links for the specified file types.


  ---

  ##
  listAvailableFiles

    Lists available files for the specified analysis IDs without triggering any restoration logic.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analysisId` | `string` |
      The analysis ID to list files for.
      |
      | `target` | `string` |
      The target for the Varvis API.
      |
      | `token` | `string` |
      The CSRF token for authentication.
      |
      | `agent` | `Object` |
      The HTTP agent instance.
      |
      | `logger` | `Object` |
      The logger instance.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  generateReport

    Generates a summary report of the download process.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `reportfile` | `string` |
      The path to the report file.
      |
      | `logger` | `Object` |
      The logger instance.
      |



  ---


