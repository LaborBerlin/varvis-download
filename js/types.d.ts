/**
 * Shared domain type declarations for varvis-download.
 *
 * Runtime code stays in CommonJS. These declarations are referenced from JSDoc
 * via import('./types').TypeName and do not emit JavaScript.
 */

import type { Dispatcher, RequestInit } from 'undici';
import type { Logger } from 'winston';

export type HttpDispatcher = Dispatcher;

export interface UndiciRequestOptions extends RequestInit {
  headers?: Record<string, string>;
  dispatcher?: HttpDispatcher;
}

export interface Analysis {
  id: string | number;
  analysisType?: string;
  sampleId?: string;
  personLimsId?: string;
  [field: string]: string | number | boolean | null | undefined;
}

export interface ParsedFilter {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | '~=' | '^=';
  value: string;
}

export interface AnalysisFile {
  fileName: string;
  downloadLink?: string;
  analysisId?: string;
  currentlyArchived?: boolean;
  archived?: boolean;
  restoreEstimation?: string | null;
  size?: number;
  [field: string]: unknown;
}

export type FileDict = Record<string, AnalysisFile>;

// 'none' is intentional: list mode passes it to bypass restoration logic.
export type RestoreMode = 'no' | 'none' | 'ask' | 'all' | 'force';

export interface Metrics {
  startTime: number;
  totalFilesDownloaded: number;
  totalFilesSkipped: number;
  totalBytesDownloaded: number;
  downloadSpeeds: number[];
}

export interface RestorationOptions {
  destination: string;
  overwrite: boolean;
  range: string | null;
  bed: string | null;
  unmapped: boolean;
  restorationFile: string;
  filetypes: string[];
}

export interface RestorationEntry {
  analysisId: string;
  fileName: string;
  restoreEstimation?: string | null;
  options?: Partial<RestorationOptions>;
}

export interface ReadyEntries {
  ready: RestorationEntry[];
  pending: RestorationEntry[];
}

export interface UrlExpirationInfo {
  signedAt: Date;
  expiresInSeconds: number;
  expiresAt: Date;
}

export interface RawConfig extends Partial<FinalConfig> {
  filter?: string[];
  [field: string]: unknown;
}

export interface LoggerConfig {
  logfile?: string | null;
  loglevel?: string;
}

export interface FinalConfig {
  username: string;
  password?: string;
  passwordStdin: boolean;
  target: string;
  analysisIds: string[];
  sampleIds: string[];
  limsIds: string[];
  filetypes: string[];
  destination: string;
  filters: string[];
  filter?: string[];
  proxy?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  overwrite: boolean;
  overwriteFromConfig: boolean;
  reportfile?: string;
  restoreArchived: RestoreMode;
  restorationFile: string;
  resumeArchivedDownloads: boolean;
  listUrls: boolean;
  urlFile: string | null;
  range: string | null;
  bed: string | null;
  unmapped: boolean;
  latest: boolean;
  list?: boolean;
  config?: string;
  loglevel?: string;
  logfile?: string;
  version?: boolean;
  boundedRangeProxy: boolean;
  boundedRangeChunkSize: number;
  boundedRangeProxyExplicit?: boolean;
}

export interface Credentials {
  username: string;
  password: string;
}

export interface LoginResult {
  csrfToken: string;
}

export interface CommandDeps {
  logger: Logger;
  agent: HttpDispatcher;
  authService: {
    token: string;
    login?: (creds: Credentials, target: string) => Promise<LoginResult>;
  };
  rl: import('node:readline').Interface | null;
  metrics: Metrics;
}

export interface SpawnResult {
  stdout?: string;
}

export interface CapturedSpawnResult {
  stdout: string;
}

export class ConfigurationError extends Error {
  readonly exitCode: 1;
  constructor(message: string);
}

export class OperationalError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode?: number);
}
