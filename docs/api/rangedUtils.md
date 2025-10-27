# API Reference

##

spawnPromise

    Wraps spawn in a Promise to maintain async/await syntax.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `command` | `string` |
      The command to execute.
      |
      | `args` | `Array.&lt;string&gt;` |
      The command arguments.
      |
      | `logger` | `Object` |
      The logger instance.
      |
      | `captureOutput` | `boolean` |
      Whether to capture stdout for return value.
      |

    ### Returns **Type:** `Promise.&lt;Object&gt;`

      - Resolves with result object when the process completes successfully.

---

##

checkToolAvailability

    Checks if a tool is available and meets the minimum version.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `tool` | `string` |
      The name of the tool (samtools, tabix, or bgzip).
      |
      | `versionCommand` | `string` |
      Command to check the tool version.
      |
      | `minVersion` | `string` |
      The minimal required version.
      |
      | `logger` | `Object` |
      The logger instance.
      |

    ### Returns **Type:** `Promise.&lt;boolean&gt;`

      - Resolves to true if the tool is available and meets the version requirement.

---

##

compareVersions

    Compares two versions (e.g., &#x27;1.10&#x27; vs &#x27;1.9&#x27;).

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `version` | `string` |
      The current version.
      |
      | `minVersion` | `string` |
      The minimum required version.
      |

    ### Returns **Type:** `boolean`

      - True if the current version is >= the minimum version.

---

##

rangedDownloadBAM

    Performs a ranged download for a BAM file using samtools.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `url` | `string` |
      The URL of the BAM file.
      |
      | `range` | `string` |
      The genomic range (e.g., 'chr1:1-100000').
      |
      | `outputFile` | `string` |
      The output file name.
      |
      | `indexFile` | `string` |
      The path to the downloaded .bai index file.
      |
      | `logger` | `Object` |
      The logger instance.
      |
      | `overwrite` | `boolean` |
      Flag indicating whether to overwrite existing files.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`

---

##

rangedDownloadVCF

    Performs a ranged download for a VCF file using tabix, and compresses it using bgzip.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `url` | `string` |
      The URL of the VCF file.
      |
      | `range` | `string` |
      The genomic range (e.g., 'chr1:1-100000').
      |
      | `outputFile` | `string` |
      The output file name (compressed as .vcf.gz).
      |
      | `logger` | `Object` |
      The logger instance.
      |
      | `overwrite` | `boolean` |
      Flag indicating whether to overwrite existing files.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`

---

##

indexBAM

    Indexes a BAM file using samtools.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `bamFile` | `string` |
      The path to the BAM file.
      |
      | `logger` | `Object` |
      The logger instance.
      |
      | `overwrite` | `boolean` |
      Flag indicating whether to overwrite existing index files.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`

---

##

indexVCF

    Indexes a VCF.gz file using tabix.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `vcfGzFile` | `string` |
      The path to the VCF.gz file.
      |
      | `logger` | `Object` |
      The logger instance.
      |
      | `overwrite` | `boolean` |
      Flag indicating whether to overwrite existing index files.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`

---

##

ensureIndexFile

    Ensures that the required index file is downloaded for a BAM or VCF file.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `fileUrl` | `string` |
      The URL of the BAM or VCF file.
      |
      | `indexUrl` | `string` |
      The URL of the index file (.bai or .tbi).
      |
      | `indexFilePath` | `string` |
      The local path to the index file.
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
      | `overwrite` | `boolean` |
      Flag indicating whether to overwrite existing files.
      |

    ### Returns **Type:** `Promise.&lt;void&gt;`

---

##

generateOutputFileName

    Generates an output file name by appending the genomic range or &quot;multiple-regions&quot; if more than one range is provided.

If no regions are provided, the original filename is returned. This applies to all file types (BAM, VCF, etc.).

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `fileName` | `string` |
      The original file name.
      |
      | `regions` | `string` |
      A string representing a single genomic range or an array of multiple regions.
      |
      | `logger` | `Object` |
      The logger instance.
      |

    ### Returns **Type:** `string`

      - The new file name with the range appended, or the original file name.

---
