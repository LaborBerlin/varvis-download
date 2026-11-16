const fs = require('node:fs');
const path = require('node:path');

/**
 * Publishes a ranged data file and its index only after both tools succeed.
 * @param   {string}                                outputFile  - Final data file.
 * @param   {boolean}                               overwrite   - Whether existing data may be replaced.
 * @param   {string}                                indexSuffix - Index extension including the leading dot.
 * @param   {(stagedFile: string) => Promise<void>} action      - Extraction and indexing steps.
 * @returns {Promise<void>}                                     - Completes after successful publication or cleanup.
 */
async function withStagedOutput(outputFile, overwrite, indexSuffix, action) {
  const preserveData = !overwrite && fs.existsSync(outputFile);
  if (preserveData && fs.existsSync(`${outputFile}${indexSuffix}`)) {
    await action(outputFile);
    return;
  }
  const directory = fs.mkdtempSync(
    path.join(path.dirname(path.resolve(outputFile)), '.varvis-range-'),
  );
  const stagedFile = path.join(directory, path.basename(outputFile));
  const stagedIndex = `${stagedFile}${indexSuffix}`;
  const finalIndex = `${outputFile}${indexSuffix}`;
  const backupFile = `${stagedFile}.previous`;
  const backupIndex = `${stagedIndex}.previous`;
  /** @type {[string, string][]} */
  const moves = [];
  let rollbackFailed = false;

  /**
   * Records each completed move so publication can be reversed.
   * @param   {string} from - Existing path.
   * @param   {string} to   - New path.
   * @returns {void}        - No result.
   */
  function move(from, to) {
    fs.renameSync(from, to);
    moves.push([from, to]);
  }

  try {
    // Index existing data through a hard link without copying or replacing it.
    if (preserveData) fs.linkSync(outputFile, stagedFile);
    await action(stagedFile);
    if (!fs.existsSync(stagedFile) || !fs.existsSync(stagedIndex)) {
      throw new Error(
        'Ranged extraction did not produce both data and index files',
      );
    }
    if (!preserveData && fs.existsSync(outputFile))
      move(outputFile, backupFile);
    if (fs.existsSync(finalIndex)) move(finalIndex, backupIndex);
    if (!preserveData) move(stagedFile, outputFile);
    move(stagedIndex, finalIndex);
  } catch (error) {
    const failures = [error];
    for (let i = moves.length - 1; i >= 0; i--) {
      const [from, to] = moves[i];
      try {
        fs.renameSync(to, from);
      } catch (rollbackError) {
        rollbackFailed = true;
        failures.push(rollbackError);
      }
    }
    if (rollbackFailed) {
      throw new AggregateError(
        failures,
        `Output rollback failed; recovery files retained in ${directory}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (!rollbackFailed) {
      for (const file of [stagedFile, stagedIndex, backupFile, backupIndex]) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      fs.rmdirSync(directory);
    }
  }
}

module.exports = { withStagedOutput };
