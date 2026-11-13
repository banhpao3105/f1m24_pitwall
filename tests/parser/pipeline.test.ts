/**
 * Normalize + pipeline tests — Phase 0.
 * Verifies SaveModel v0 construction, graceful degradation and error codes.
 */

import { describe, it, expect } from 'vitest';
import { runParsePipeline } from '@/parser/pipeline';
import { ParseErrorCode, SaveParseError } from '@/parser/errors';
import { buildGvasSave, FIXTURE_SCHEMA_SQL, locateSqlWasm } from '../helpers/build-gvas';

describe('runParsePipeline', () => {
  it('builds SaveModel v0 with team/season/day metadata', async () => {
    const { bytes } = await buildGvasSave({ sql: FIXTURE_SCHEMA_SQL });

    const { model } = await runParsePipeline(bytes, {
      fileName: 'fixture.sav',
      fileSizeBytes: bytes.length,
      saveId: 'test-hash',
      locateFile: locateSqlWasm,
    });

    expect(model.meta.gameVersion).toBe('F1M24');
    expect(model.meta.playerTeamId).toBe(1);
    expect(model.meta.seasonId).toBe(2023);
    expect(model.meta.day).toBe(1234);
    expect(model.player.teamName).toBe('Test Racing');
    expect(model.player.customTeamEnabled).toBe(false);
    expect(model.races).toHaveLength(2);

    const completed = model.races.find((r) => r.raceId === 1);
    expect(completed?.state).toBe(2);
    expect(completed?.trackName).toBe('Bahrain');
    expect(completed?.results).toHaveLength(2);
    expect(completed?.results[0]?.points).toBe(25);
    expect(completed?.results[0]?.teamName).toBe('Test Racing');

    const upcoming = model.races.find((r) => r.raceId === 2);
    expect(upcoming?.state).toBe(0);
    expect(upcoming?.results).toHaveLength(0);

    expect(model.meta.warnings).not.toContain('NO_COMPLETED_RACES');
    expect(model.teams).toHaveLength(2);
  });

  it('warns instead of crashing when no race is completed', async () => {
    const sql = FIXTURE_SCHEMA_SQL.map((s) =>
      s.replace("INSERT INTO Races VALUES (1, 1, 10, 5, 2,", "INSERT INTO Races VALUES (1, 1, 10, 5, 0,"),
    );
    const { bytes } = await buildGvasSave({ sql });
    const { model } = await runParsePipeline(bytes, {
      fileName: 'fixture.sav',
      fileSizeBytes: bytes.length,
      saveId: 'test-hash',
      locateFile: locateSqlWasm,
    });
    expect(model.meta.warnings).toContain('NO_COMPLETED_RACES');
  });

  it('fails with MISSING_CORE_TABLES when a core table is absent', async () => {
    const sql = FIXTURE_SCHEMA_SQL.filter((s) => !s.startsWith('CREATE TABLE "Teams"'))
      .filter((s) => !s.startsWith("INSERT INTO Teams"));
    const { bytes } = await buildGvasSave({ sql });
    try {
      await runParsePipeline(bytes, {
        fileName: 'fixture.sav',
        fileSizeBytes: bytes.length,
        saveId: 'test-hash',
        locateFile: locateSqlWasm,
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SaveParseError);
      expect((err as SaveParseError).code).toBe(ParseErrorCode.MISSING_CORE_TABLES);
      expect((err as SaveParseError).message).toContain('Teams');
    }
  });

  it('reports progress 0..100 through the stages', async () => {
    const { bytes } = await buildGvasSave({ sql: FIXTURE_SCHEMA_SQL });
    const stages: string[] = [];
    await runParsePipeline(bytes, {
      fileName: 'fixture.sav',
      fileSizeBytes: bytes.length,
      saveId: 'test-hash',
      locateFile: locateSqlWasm,
      onProgress: (_p, stage) => stages.push(stage),
    });
    expect(stages).toEqual(['gvas', 'inflate', 'sqlite', 'normalize', 'done']);
  });
});
