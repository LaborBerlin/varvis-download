const zlib = require('node:zlib');

const MAX_BLOCK_SIZE = 65536;
const HEADER_SIZE = 18;

const BGZF_EOF = Buffer.from(
  '1f8b08040000000000ff0600424302001b0003000000000000000000',
  'hex',
);

/**
 * Reads the total length of the BGZF block starting at `pos`.
 * @param   {Buffer}      buf - Compressed bytes.
 * @param   {number}      pos - Block start.
 * @returns {number|null}     - Block length, or null when the header is incomplete.
 */
function readBlockSize(buf, pos) {
  if (buf.length - pos < HEADER_SIZE) return null;
  if (
    buf[pos] !== 0x1f ||
    buf[pos + 1] !== 0x8b ||
    buf[pos + 2] !== 0x08 ||
    (buf[pos + 3] & 0x04) === 0
  ) {
    throw new Error(`Invalid BGZF block header at offset ${pos}`);
  }
  const xlen = buf.readUInt16LE(pos + 10);
  if (buf.length - pos < 12 + xlen) return null;
  for (let p = pos + 12; p + 4 <= pos + 12 + xlen;) {
    const length = buf.readUInt16LE(p + 2);
    if (buf[p] === 0x42 && buf[p + 1] === 0x43 && length === 2) {
      return buf.readUInt16LE(p + 4) + 1;
    }
    p += 4 + length;
  }
  throw new Error(`Invalid BGZF block header at offset ${pos}`);
}

/**
 * Decompresses every complete BGZF block at the start of `buf`.
 * @param   {Buffer}                           buf - Compressed bytes starting at a block boundary.
 * @returns {{data: Buffer, consumed: number}}     - Payload and compressed bytes used.
 */
function inflateBlocks(buf) {
  /** @type {Buffer[]} */
  const parts = [];
  let pos = 0;
  for (;;) {
    const size = readBlockSize(buf, pos);
    if (size === null || pos + size > buf.length) break;
    const xlen = buf.readUInt16LE(pos + 10);
    parts.push(
      zlib.inflateRawSync(buf.subarray(pos + 12 + xlen, pos + size - 8)),
    );
    pos += size;
  }
  return { data: Buffer.concat(parts), consumed: pos };
}

module.exports = { BGZF_EOF, MAX_BLOCK_SIZE, inflateBlocks, readBlockSize };
