# API Reference


  ##
  triggerRestoreArchivedFile

    Triggers restoration for an archived analysis file using the internal restore endpoint.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `analysisId` | `string` |
      The analysis ID of the archived file.
      |
      | `file` | `Object` |
      The file object from the API response (should include fileName).
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
      | `restorationFile` | `string` |
      Optional path/name for the awaiting restoration JSON file.
      |
      | `options` | `Object` |
      Options object for restoration context.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  appendToAwaitingRestoration

    Appends or updates restoration information in an awaiting-restoration JSON file.The entry is identified by matching analysisId, fileName, and options.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `restorationInfo` | `Object` |
      An object containing restoration details (analysisId, fileName, restoreEstimation, options).
      |
      | `logger` | `Object` |
      The logger instance.
      |
      | `restorationFile` | `string` |
      Optional path/name for the awaiting restoration JSON file.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---

  ##
  resumeArchivedDownloads

    Resumes downloads for archived files as specified in the awaiting-restoration JSON file.For each entry, if the current time is past the restoreEstimation, it attempts to download the fileusing the restored context options. On success, the entry is removed; otherwise, it is kept for later resumption.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `restorationFile` | `string` |
      The path/name of the awaiting-restoration JSON file.
      |
      | `destination` | `string` |
      The destination folder for downloads.
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
      | `overwrite` | `boolean` |
      Flag indicating whether to overwrite existing files.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`



  ---


