/**
 * GVAS + parseF1ManagerSave unit tests — Phase 0.
 * Oracle: Gazette v2.2 parser semantics, verified against a real F1M 24 save.
 */

import { describe, it, expect } from 'vitest';
import { parseF1ManagerSave, SQLITE_HEADER } from '@/parser/parse-save';
import { ParseErrorCode, SaveParseError } from '@/parser/errors';
import { buildGvasSave, FIXTURE_SCHEMA_SQL } from '../helpers/build-gvas';

describe('parseF1ManagerSave', () => {
  it('extracts the SQLite database and metadata from a synthetic F1M24 save', async () => {
    const { bytes, databaseBytes } = await buildGvasSave({ sql: FIXTURE_SCHEMA_SQL });

    const result = parseF1ManagerSave(bytes);

    expect(result.metadata.version).toBe(4);
    expect(result.metadata.gameVersion).toBe('F1M24');
    expect(result.metadata.gameVersionWithBuild).toBe('1.11.0.498643');
    expect(result.metadata.fullBuildId).toBe('++volta24+game+1.11.0');
    expect(result.metadata.saveGameClassName).toBe('/Script/RaceGame.CareerSaveGame');
    expect(result.metadata.engineVersion).toBe('5.1.1');
    expect(result.databaseFile.length).toBe(databaseBytes.length);
    const header = Array.from(result.databaseFile.subarray(0, 15), (b) =>
      String.fromCharCode(b),
    ).join('');
    expect(header).toBe(SQLITE_HEADER);
    // Round-trip: extracted bytes must be identical to what we embedded.
    expect(Buffer.from(result.databaseFile).equals(Buffer.from(databaseBytes))).toBe(true);
  });

  it('detects F1M23 saves (volta23 build id)', async () => {
    const { bytes } = await buildGvasSave({
      sql: ['CREATE TABLE "Player" ("TeamID" INTEGER)'],
      buildId: '++volta23+game+1.10.4',
    });
    const result = parseF1ManagerSave(bytes);
    expect(result.metadata.gameVersion).toBe('F1M23');
    expect(result.metadata.version).toBe(3);
  });

  it('rejects non-GVAS input with NOT_A_GVAS_SAVE', () => {
    const bytes = new Uint8Array(64).fill(0);
    try {
      parseF1ManagerSave(bytes);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SaveParseError);
      expect((err as SaveParseError).code).toBe(ParseErrorCode.NOT_A_GVAS_SAVE);
    }
  });

  it('rejects unknown BuildId with UNSUPPORTED_SAVE_FORMAT', async () => {
    const { bytes } = await buildGvasSave({
      sql: ['CREATE TABLE "Player" ("TeamID" INTEGER)'],
      buildId: '++volta25+game+2.0.0',
    });
    try {
      parseF1ManagerSave(bytes);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SaveParseError);
      expect((err as SaveParseError).code).toBe(ParseErrorCode.UNSUPPORTED_SAVE_FORMAT);
    }
  });

  it('rejects when the decompressed payload is not SQLite (NOT_A_SQLITE_DB)', async () => {
    const { bytes } = await buildGvasSave({
      sql: ['CREATE TABLE "Player" ("TeamID" INTEGER)'],
    });
    // The embedded DB is zlib-compressed, so the SQLite marker never appears
    // in plain bytes — locate the properties "None" terminator
    // (i32 len=5, "None", NUL) and zero the blob header that follows it to
    // simulate a lying/corrupt blob header.
    const nonePattern = [5, 0, 0, 0, 0x4e, 0x6f, 0x6e, 0x65, 0];
    let nonePos = -1;
    for (let i = bytes.length - nonePattern.length; i >= 0; i--) {
      let ok = true;
      for (let j = 0; j < nonePattern.length; j++) {
        if (bytes[i + j] !== nonePattern[j]) { ok = false; break; }
      }
      if (ok) { nonePos = i; break; }
    }
    expect(nonePos).toBeGreaterThan(0);
    const lying = new Uint8Array(bytes);
    for (let k = nonePos + nonePattern.length; k < nonePos + nonePattern.length + 20; k++) {
      lying[k] = 0;
    }
    try {
      parseF1ManagerSave(lying);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SaveParseError);
      const code = (err as SaveParseError).code;
      expect([ParseErrorCode.NOT_A_SQLITE_DB, ParseErrorCode.DB_INFLATE_FAILED]).toContain(
        code,
      );
    }
  });
});
