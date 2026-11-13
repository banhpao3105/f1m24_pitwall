/**
 * Full parse pipeline — Phase 0. Runs inside the Web Worker only.
 *
 * .sav bytes → GVAS → zlib → SQLite → schema detect → repositories → model
 * (docs/01-AUDIT-DATA.md §4.2). Emits progress callbacks for the UI.
 */

import { parseF1ManagerSave, type SaveBinaryMeta } from './parse-save';
import { openDatabase, type SqlJsDatabase } from './sqlite/sqljs-loader';
import { detectSchema, CORE_TABLES } from './schema';
import { buildSaveModel } from './normalize/build-model';
import { SaveParseError, ParseErrorCode } from './errors';
import type { SaveModel } from '../domain/types';

export interface ParsePipelineOptions {
  fileName: string;
  fileSizeBytes: number;
  /** SHA-256 hex of the raw file — computed by the caller (client/worker). */
  saveId: string;
  /** Progress: 0..100. */
  onProgress?: (percent: number, stage: string) => void;
  /** Node/WASM resolution override (vitest); browser uses default. */
  locateFile?: (file: string, prefix?: string) => string;
}

export interface ParsePipelineResult {
  model: SaveModel;
  binaryMeta: SaveBinaryMeta;
  tablesPresentCount: number;
}

export async function runParsePipeline(
  bytes: Uint8Array,
  options: ParsePipelineOptions,
): Promise<ParsePipelineResult> {
  const { onProgress } = options;
  onProgress?.(5, 'gvas');

  const binary = parseF1ManagerSave(bytes);
  onProgress?.(40, 'inflate');

  let db: SqlJsDatabase;
  try {
    db = await openDatabase(binary.databaseFile, {
      locateFile: options.locateFile,
    });
  } catch (err) {
    throw new SaveParseError(
      ParseErrorCode.DB_OPEN_FAILED,
      `sql.js failed to open database: ${(err as Error).message}`,
    );
  }
  onProgress?.(60, 'sqlite');

  const schema = detectSchema(db);
  if (schema.tablesMissingCore.length > 0) {
    throw new SaveParseError(
      ParseErrorCode.MISSING_CORE_TABLES,
      `Missing core tables: ${schema.tablesMissingCore.join(', ')}`,
      JSON.stringify({
        expected: CORE_TABLES,
        missing: schema.tablesMissingCore,
      }),
    );
  }
  onProgress?.(80, 'normalize');

  let model: SaveModel;
  try {
    model = buildSaveModel({
      db,
      binaryMeta: binary.metadata,
      schema,
      saveId: options.saveId,
      fileName: options.fileName,
      fileSizeBytes: options.fileSizeBytes,
    });
  } catch (err) {
    if (err instanceof SaveParseError) throw err;
    throw new SaveParseError(
      ParseErrorCode.NORMALIZE_FAILED,
      `Failed to build SaveModel: ${(err as Error).message}`,
    );
  }

  onProgress?.(100, 'done');
  return {
    model,
    binaryMeta: binary.metadata,
    tablesPresentCount: schema.tablesPresent.length,
  };
}
