# API Reference

##

confirmOverwrite

    Prompts the user to confirm file overwrite if the file already exists.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `file` | `string` |
      The file path.
      |
      | `rl` | `Object` |
      The readline interface instance.
      |
      | `logger` | `Object` |
      The logger instance.
      |

    ### Returns **Type:** `Promise.&lt;boolean&gt;`

      - True if the user confirms overwrite, otherwise false.

---

##

downloadFile

    Downloads a file from the given URL to the specified output path with progress reporting.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `url` | `string` |
      The URL of the file to download.
      |
      | `outputPath` | `string` |
      The path where the file should be saved.
      |
      | `overwrite` | `boolean` |
      Flag indicating whether to overwrite existing files.
      |
      | `agent` | `Object` |
      The HTTP agent instance.
      |
      | `rl` | `Object` |
      The readline interface instance.
      |
      | `logger` | `Object` |
      The logger instance.
      |
      | `metrics` | `Object` |
      The metrics object for tracking download stats.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`

---
