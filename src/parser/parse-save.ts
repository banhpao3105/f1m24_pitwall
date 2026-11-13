/**
 * parseF1ManagerSave — entry point ported from the Gazette v2.2 oracle.
 *
 * Pipeline (docs/01-AUDIT-DATA.md §4.2, verified against a real F1M 24 save):
 *   .sav bytes
 *     → GVAS container (header + properties, terminated by "None")
 *     → 5 × int32 (unknownZero, totalSize, size1, size2, size3)
 *     → zlib inflate of the next `totalSize` bytes
 *     → databaseFile = first `size1` bytes, must start with "SQLite format 3"
 *
 * Version detection mirrors the oracle exactly:
 *   SaveGameVersion 2 → BuildId contains "22_"            → F1M 22
 *   SaveGameVersion 3 → BuildId contains "volta23"        → F1M 23
 *   SaveGameVersion 3 → BuildId contains "volta24"        → F1M 24
 *   anything else                                   → UNSUPPORTED_SAVE_FORMAT
 *
 * NOTE (oracle parity): the 23 vs 24 `gameVersion` substring offsets differ
 * in the oracle ("23+" + 3 vs "24+" + 8). Kept as-is — it only affects the
 * cosmetic `gameVersion` metadata string, never parsing.
 */

import { inflate } from 'pako';
import { Serializer } from './gvas/serializer';
import { readGvas } from './gvas/gvas';
import { SaveParseError, ParseErrorCode } from './errors';

export const SQLITE_HEADER = 'SQLite format 3';

export type GameVersion = 'F1M22' | 'F1M23' | 'F1M24';

export interface SaveBinaryMeta {
  version: number; // 2 | 3 | 4 — oracle numeric version (game era)
  gameVersion: GameVersion;
  gameVersionWithBuild: string;
  fullBuildId: string;
  saveGameClassName: string;
  saveGameVersion: number;
  engineVersion: string;
}

export interface SaveBinary {
  /** Raw SQLite database bytes (page-aligned, header verified). */
  databaseFile: Uint8Array;
  metadata: SaveBinaryMeta;
}

export function parseF1ManagerSave(buffer: ArrayBuffer | Uint8Array): SaveBinary {
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const serial = new Serializer(bytes);

  let gvas;
  try {
    gvas = readGvas(serial);
  } catch (err) {
    if (err instanceof SaveParseError) throw err;
    throw new SaveParseError(
      ParseErrorCode.MALFORMED_GVAS,
      `Failed to read GVAS container: ${(err as Error).message}`,
    );
  }

  const { saveGameVersion } = gvas.header;
  const buildId = gvas.header.engineVersion.buildId;

  let version = 0;
  let gameVersion: GameVersion | null = null;
  let gameVersionWithBuild: string | null = null;

  if (saveGameVersion === 2) {
    version = 2;
    gameVersion = 'F1M22';
    gameVersionWithBuild = `${buildId.substring(buildId.indexOf('22_') + 3)}.${gvas.header.engineVersion.build & 2147483647}`;
  } else if (saveGameVersion === 3) {
    if (buildId.includes('volta23')) {
      version = 3;
      gameVersion = 'F1M23';
      gameVersionWithBuild = `${buildId.substring(buildId.indexOf('23+') + 3)}.${gvas.header.engineVersion.build & 2147483647}`;
    }
    if (buildId.includes('volta24')) {
      version = 4;
      gameVersion = 'F1M24';
      gameVersionWithBuild = `${buildId.substring(buildId.indexOf('24+') + 8)}.${gvas.header.engineVersion.build & 2147483647}`;
    }
  }

  if (version === 0 || gameVersion === null || gameVersionWithBuild === null) {
    throw new SaveParseError(
      ParseErrorCode.UNSUPPORTED_SAVE_FORMAT,
      `Unsupported save format: SaveGameVersion=${saveGameVersion}, BuildId='${buildId}'`,
    );
  }

  serial.readInt32(); // unknownZero
  const totalSize = serial.readInt32();
  const size1 = serial.readInt32();
  const size2 = serial.readInt32();
  const size3 = serial.readInt32();

  if (totalSize <= 0 || size1 <= 0) {
    throw new SaveParseError(
      ParseErrorCode.NOT_A_SQLITE_DB,
      `Invalid embedded database sizes: total=${totalSize}, db=${size1}`,
    );
  }

  const compressed = serial.read(totalSize);

  let output: Uint8Array;
  try {
    output = inflate(compressed);
  } catch (err) {
    throw new SaveParseError(
      ParseErrorCode.DB_INFLATE_FAILED,
      `zlib inflate failed: ${(err as Error).message}`,
    );
  }

  const databaseFile = output.slice(0, size1);
  const headerText = latin1Of(databaseFile.subarray(0, 16));
  if (!headerText.startsWith(SQLITE_HEADER)) {
    throw new SaveParseError(
      ParseErrorCode.NOT_A_SQLITE_DB,
      `Embedded database header check failed: '${headerText}'`,
    );
  }

  return {
    databaseFile,
    metadata: {
      version,
      gameVersion,
      gameVersionWithBuild,
      fullBuildId: buildId,
      saveGameClassName: gvas.header.saveGameClassName,
      saveGameVersion,
      engineVersion: `${gvas.header.engineVersion.major}.${gvas.header.engineVersion.minor}.${gvas.header.engineVersion.patch}`,
    },
  };
}

function latin1Of(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}
