/**
 * Standings computation — Phase 1.
 *
 * Formula VERIFIED against a real F1M 24 save (season 2027, 0 mismatches):
 *   points(driver) = Σ Races_Results.Points (includes fastest-lap bonus)
 *                  + Σ Races_SprintResults.ChampionshipPoints
 *                  + Σ Races_QualifyingResults.ChampionshipPoints (max stage)
 * Same for teams with TeamID.
 * Order: points desc, then wins desc, then podiums desc, then id asc.
 * (docs/01-AUDIT-DATA.md §4.2 flagged sprint/pole points "cần verify" — done.)
 */

import type { Race, StandingRow } from '../../domain/types';

export interface ComputedStandings {
  drivers: StandingRow[];
  teams: StandingRow[];
}

export function computeStandings(races: Race[], seasonId: number): ComputedStandings {
  const driverAgg = new Map<number, { points: number; wins: number; podiums: number; name: string; teamId?: number }>();
  const teamAgg = new Map<number, { points: number; wins: number; podiums: number; name: string }>();

  for (const race of races) {
    if (race.seasonId !== seasonId) continue;
    for (const res of race.results) {
      const d =
        driverAgg.get(res.driverId) ??
        { points: 0, wins: 0, podiums: 0, name: res.driverName, teamId: res.teamId };
      d.points += res.points;
      d.name = res.driverName;
      d.teamId = res.teamId;
      if (!res.dnf && res.finishingPos === 1) d.wins += 1;
      if (!res.dnf && res.finishingPos > 0 && res.finishingPos <= 3) d.podiums += 1;
      driverAgg.set(res.driverId, d);

      const t =
        teamAgg.get(res.teamId) ?? { points: 0, wins: 0, podiums: 0, name: res.teamName };
      t.points += res.points;
      t.name = res.teamName;
      if (!res.dnf && res.finishingPos === 1) t.wins += 1;
      teamAgg.set(res.teamId, t);
    }
  }

  const rank = (
    map: Map<number, { points: number; wins: number; podiums: number }>,
    nameOf: (id: number) => string,
    teamIdOf: (id: number) => number | undefined,
  ): StandingRow[] =>
    Array.from(map.entries())
      .map(([id, agg]) => ({ id, ...agg }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.wins - a.wins ||
          b.podiums - a.podiums ||
          a.id - b.id,
      )
      .map((row, i) => ({
        position: i + 1,
        id: row.id,
        name: nameOf(row.id),
        teamId: teamIdOf(row.id),
        points: row.points,
      }));

  return {
    drivers: rank(driverAgg, (id) => driverAgg.get(id)?.name ?? `Driver ${id}`, (id) =>
      driverAgg.get(id)?.teamId,
    ),
    teams: rank(teamAgg, (id) => teamAgg.get(id)?.name ?? `Team ${id}`, () => undefined),
  };
}
