/**
 * Ambient declaration for `progress`. The package ships without types.
 * Only the ProgressBar surface used by fileUtils.cjs is declared here.
 */

declare module 'progress' {
  class ProgressBar {
    constructor(
      format: string,
      options: {
        total: number;
        width?: number;
        complete?: string;
        incomplete?: string;
        renderThrottle?: number;
        clear?: boolean;
      },
    );

    tick(delta?: number, tokens?: Record<string, unknown>): void;
    update(ratio: number, tokens?: Record<string, unknown>): void;
    interrupt(message: string): void;
    terminate(): void;
    complete: boolean;
  }

  export = ProgressBar;
}
