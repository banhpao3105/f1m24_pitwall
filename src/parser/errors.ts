/**
 * Parser error codes — Phase 0
 *
 * Every parser failure carries a stable machine code so the UI can map it
 * to a specific, actionable message (docs/02-ARCHITECTURE.md §3.5).
 * Never throw bare strings from parser/*.
 */

export const ParseErrorCode = {
  /** File does not start with the GVAS magic — not an Unreal save file. */
  NOT_A_GVAS_SAVE: 'NOT_A_GVAS_SAVE',
  /** GVAS header parsed but BuildId does not map to a supported F1 Manager game. */
  UNSUPPORTED_SAVE_FORMAT: 'UNSUPPORTED_SAVE_FORMAT',
  /** Truncated/corrupt file while reading the GVAS structure. */
  MALFORMED_GVAS: 'MALFORMED_GVAS',
  /** The decompressed payload does not start with the SQLite header. */
  NOT_A_SQLITE_DB: 'NOT_A_SQLITE_DB',
  /** zlib inflate of the embedded database failed. */
  DB_INFLATE_FAILED: 'DB_INFLATE_FAILED',
  /** One or more mandatory tables are missing from the embedded database. */
  MISSING_CORE_TABLES: 'MISSING_CORE_TABLES',
  /** sql.js failed to initialise or to open the database bytes. */
  DB_OPEN_FAILED: 'DB_OPEN_FAILED',
  /** Unexpected internal failure while normalising rows. */
  NORMALIZE_FAILED: 'NORMALIZE_FAILED',
} as const;

export type ParseErrorCodeValue = (typeof ParseErrorCode)[keyof typeof ParseErrorCode];

export class SaveParseError extends Error {
  readonly code: ParseErrorCodeValue;
  readonly details?: string;

  constructor(code: ParseErrorCodeValue, message: string, details?: string) {
    super(message);
    this.name = 'SaveParseError';
    this.code = code;
    this.details = details;
  }
}
