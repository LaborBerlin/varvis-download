/**
 * @typedef {object} BamHeader
 * @property {string[]}            names     - Reference names in tid order.
 * @property {Map<string, number>} nameToTid - Names and `@SQ AN:` aliases to tid.
 */

/**
 * Parses a binary BAM header, resolving names the way `sam_hdr_name2tid` does.
 * @param   {Buffer}         data - Decompressed bytes from the start of the BAM.
 * @returns {BamHeader|null}      - Header, or null while `data` is still incomplete.
 */
function parseBamHeader(data) {
  if (data.length < 8) return null;
  if (data.toString('latin1', 0, 4) !== 'BAM\x01') {
    throw new Error('Not a BAM file');
  }
  const lText = data.readInt32LE(4);
  if (lText < 0) throw new Error('Corrupt BAM header');
  let pos = 8 + lText;
  if (data.length < pos + 4) return null;
  const text = data.toString('utf8', 8, pos);
  const nRef = data.readInt32LE(pos);
  if (nRef < 0) throw new Error('Corrupt BAM header');
  pos += 4;
  /** @type {string[]} */
  const names = [];
  for (let i = 0; i < nRef; i++) {
    if (data.length < pos + 4) return null;
    const lName = data.readInt32LE(pos);
    if (lName < 1) throw new Error('Corrupt BAM header');
    if (data.length < pos + 4 + lName + 4) return null;
    names.push(data.toString('utf8', pos + 4, pos + 4 + lName - 1));
    pos += 4 + lName + 4;
  }

  const nameToTid = new Map(names.map((name, tid) => [name, tid]));
  for (const line of text.split('\n')) {
    if (!line.startsWith('@SQ\t')) continue;
    const fields = line.split('\t');
    const sn = fields.find((f) => f.startsWith('SN:'))?.slice(3);
    const an = fields.find((f) => f.startsWith('AN:'))?.slice(3);
    const tid = sn === undefined ? undefined : nameToTid.get(sn);
    if (tid === undefined || !an) continue;
    for (const alias of an.split(',')) {
      if (alias && !nameToTid.has(alias)) nameToTid.set(alias, tid);
    }
  }
  return { names, nameToTid };
}

module.exports = { parseBamHeader };
