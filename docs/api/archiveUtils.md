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

    Appends or updates restoration information in an awaiting-restoration JSON file.

The entry is identified by matching analysisId, fileName, and options.

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
