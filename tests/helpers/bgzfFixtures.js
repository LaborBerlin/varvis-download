const zlib = require('node:zlib');

/**
 * Builds one BGZF block holding `data`.
 * @param   {Buffer} data - Uncompressed payload (< 64 KiB).
 * @returns {Buffer}      - Complete BGZF block.
 */
function bgzfBlock(data) {
  const cdata = zlib.deflateRawSync(data);
  const header = Buffer.from([
    0x1f, 0x8b, 0x08, 0x04, 0, 0, 0, 0, 0, 0xff, 6, 0, 0x42, 0x43, 2, 0, 0, 0,
  ]);
  header.writeUInt16LE(header.length + cdata.length + 8 - 1, 16);
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(zlib.crc32(data), 0);
  trailer.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, cdata, trailer]);
}

/**
 * Minimal little-endian binary writer for synthetic index/header fixtures.
 */
class BinaryWriter {
  constructor() {
    /** @type {Buffer[]} */
    this.parts = [];
  }

  int32(value) {
    const b = Buffer.alloc(4);
    b.writeInt32LE(value);
    this.parts.push(b);
    return this;
  }

  uint32(value) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(value);
    this.parts.push(b);
    return this;
  }

  uint64(value) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(BigInt(value));
    this.parts.push(b);
    return this;
  }

  bytes(value) {
    this.parts.push(Buffer.from(value));
    return this;
  }

  toBuffer() {
    return Buffer.concat(this.parts);
  }
}

/**
 * Serializes per-reference bins and linear index in the shared BAI/TBI layout.
 * @param   {BinaryWriter} w    - Writer.
 * @param   {Array<{bins: Array<[number, Array<[bigint|number, bigint|number]>]>, linear: Array<bigint|number>}>} refs - References.
 * @returns {BinaryWriter}      - Same writer.
 */
function writeRefs(w, refs) {
  for (const ref of refs) {
    w.int32(ref.bins.length);
    for (const [bin, chunks] of ref.bins) {
      w.uint32(bin).int32(chunks.length);
      for (const [u, v] of chunks) w.uint64(u).uint64(v);
    }
    w.int32(ref.linear.length);
    for (const offset of ref.linear) w.uint64(offset);
  }
  return w;
}

/**
 * Builds a BAI file buffer.
 * @param   {Parameters<typeof writeRefs>[1]} refs      - References.
 * @param   {number}                          [noCoor]  - Optional n_no_coor.
 * @returns {Buffer}                                    - BAI bytes.
 */
function buildBai(refs, noCoor) {
  const w = new BinaryWriter().bytes('BAI\x01').int32(refs.length);
  writeRefs(w, refs);
  if (noCoor !== undefined) w.uint64(noCoor);
  return w.toBuffer();
}

/**
 * Builds an uncompressed TBI body buffer (gzip it for a real .tbi).
 * @param   {string[]}                        names - Sequence names.
 * @param   {Parameters<typeof writeRefs>[1]} refs  - References.
 * @returns {Buffer}                                - TBI bytes before compression.
 */
function buildTbi(names, refs) {
  const nameBlock = Buffer.from(names.map((n) => `${n}\0`).join(''));
  const w = new BinaryWriter()
    .bytes('TBI\x01')
    .int32(refs.length)
    .int32(2)
    .int32(1)
    .int32(2)
    .int32(0)
    .int32(35)
    .int32(0)
    .int32(nameBlock.length)
    .bytes(nameBlock);
  writeRefs(w, refs);
  return w.toBuffer();
}

/**
 * Builds a binary BAM header.
 * @param   {string}                         text - SAM header text.
 * @param   {Array<[string, number]>}        refs - Reference name/length pairs.
 * @returns {Buffer}                              - Uncompressed header bytes.
 */
function buildBamHeader(text, refs) {
  const w = new BinaryWriter()
    .bytes('BAM\x01')
    .int32(Buffer.byteLength(text))
    .bytes(text)
    .int32(refs.length);
  for (const [name, length] of refs) {
    w.int32(Buffer.byteLength(name) + 1)
      .bytes(`${name}\0`)
      .int32(length);
  }
  return w.toBuffer();
}

module.exports = {
  BinaryWriter,
  bgzfBlock,
  buildBai,
  buildBamHeader,
  buildTbi,
};
