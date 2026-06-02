/**
 * Ambient declaration for `mute-stream`. The package ships without types.
 * Only the surface used by this project is declared here.
 */

declare module 'mute-stream' {
  import { Writable } from 'node:stream';

  class MuteStream extends Writable {
    constructor(opts?: { replace?: string; prompt?: string });
    mute(): void;
    unmute(): void;
  }

  export = MuteStream;
}
