/**
 * Ambient declaration for `mute-stream`. The package ships without types.
 * Only the surface used by this project is declared here.
 */

declare module 'mute-stream' {
  import { Duplex } from 'node:stream';

  // mute-stream@4 is a pass-through stream (readable + writable), so Duplex
  // reflects it more accurately than Writable: the project pipes it AND uses it
  // as a readline `output`.
  class MuteStream extends Duplex {
    constructor(opts?: { replace?: string; prompt?: string });
    mute(): void;
    unmute(): void;
  }

  export = MuteStream;
}
