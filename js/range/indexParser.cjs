const fs = require('node:fs');
const zlib = require('node:zlib');

/**
 * @typedef {object} IndexRef
 * @property {Map<number, Array<[bigint, bigint]>>} bins   - Bin number to [begin, end) virtual-offset chunks.
 * @property {bigint[]}                              linear - Linear index (16 kbp windows).
 */

/**
 * @typedef {object} ParsedIndex
 * @property {'bai'|'tbi'}   format - Index flavour.
 * @property {string[]|null} names  - Sequence names (TBI only).
 * @property {IndexRef[]}    refs   - Per-reference bins and linear index.
 */

/** Bounds-checked little-endian cursor. */
class Cursor {
  /**
   * Wraps a buffer.
   * @param {Buffer} buf - Bytes to read.
   */
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }

  /**
   * Asserts that `n` more bytes are available.
   * @param {number} n - Bytes about to be read.
   */
  need(n) {
    if (this.pos + n > this.buf.length) throw new Error('Truncated index');
  }

  /**
   * Reads a signed 32-bit integer.
   * @returns {number} - Signed 32-bit value.
   */
  int32() {
    this.need(4);
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  /**
   * Reads an unsigned 32-bit integer.
   * @returns {number} - Unsigned 32-bit value.
   */
  uint32() {
    this.need(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  /**
   * Reads an unsigned 64-bit integer.
   * @returns {bigint} - Unsigned 64-bit value.
   */
  uint64() {
    this.need(8);
    const v = this.buf.readBigUInt64LE(this.pos);
    this.pos += 8;
    return v;
  }

  /**
   * Reads `n` raw bytes.
   * @param   {number} n - Byte count.
   * @returns {Buffer}   - Slice.
   */
  bytes(n) {
    if (n < 0) throw new Error('Truncated index');
    this.need(n);
    const v = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }

  /**
   * Rejects negative or impossible element counts.
   * @param   {number} n - Element count read from the file.
   * @returns {number}   - The same count after sanity checking.
   */
  count(n) {
    if (n < 0 || n > this.buf.length) throw new Error('Corrupt index count');
    return n;
  }
}

/**
 * Reads the per-reference bin/linear layout shared by BAI and TBI.
 * @param   {Cursor}     c    - Cursor positioned at the first reference.
 * @param   {number}     nRef - Reference count.
 * @returns {IndexRef[]}      - Parsed references.
 */
function readRefs(c, nRef) {
  /** @type {IndexRef[]} */
  const refs = [];
  for (let r = 0; r < nRef; r++) {
    /** @type {Map<number, Array<[bigint, bigint]>>} */
    const bins = new Map();
    const nBin = c.count(c.int32());
    for (let b = 0; b < nBin; b++) {
      const bin = c.uint32();
      const nChunk = c.count(c.int32());
      /** @type {Array<[bigint, bigint]>} */
      const chunks = [];
      for (let k = 0; k < nChunk; k++) chunks.push([c.uint64(), c.uint64()]);
      bins.set(bin, chunks);
    }
    const nIntv = c.count(c.int32());
    /** @type {bigint[]} */
    const linear = [];
    for (let i = 0; i < nIntv; i++) linear.push(c.uint64());
    refs.push({ bins, linear });
  }
  return refs;
}

/**
 * Parses an uncompressed BAI or TBI index.
 * @param   {Buffer}      bytes - Index bytes (a TBI must already be decompressed).
 * @returns {ParsedIndex}       - Parsed index.
 */
function parseIndex(bytes) {
  const c = new Cursor(bytes);
  const magic = c.bytes(4).toString('latin1');
  if (magic === 'BAI\x01') {
    const nRef = c.count(c.int32());
    return { format: 'bai', names: null, refs: readRefs(c, nRef) };
  }
  if (magic === 'TBI\x01') {
    const nRef = c.count(c.int32());
    for (let i = 0; i < 6; i++) c.int32();
    const names = c
      .bytes(c.count(c.int32()))
      .toString('utf8')
      .split('\0')
      .slice(0, nRef);
    if (names.length !== nRef) throw new Error('Corrupt TBI name block');
    return { format: 'tbi', names, refs: readRefs(c, nRef) };
  }
  throw new Error(`Unsupported index format (magic ${JSON.stringify(magic)})`);
}

/**
 * Reads and parses a local .bai or .tbi file.
 * @param   {string}      indexPath - Index file path.
 * @returns {ParsedIndex}           - Parsed index.
 */
function parseIndexFile(indexPath) {
  const raw = fs.readFileSync(indexPath);
  const gzipped = raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;
  return parseIndex(gzipped ? zlib.gunzipSync(raw) : raw);
}

module.exports = { parseIndex, parseIndexFile };
