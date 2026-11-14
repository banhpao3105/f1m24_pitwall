/**
 * Race gap formatting — v0.5.4 step 3.
 * Shared by the Timing Tower (RaceWeekendView) and the Gazette engine
 * (results rows) so both places treat lapped cars identically.
 *
 * Bug (reproduced on the real Bahrain 2027 save, Day 46507): the gap was
 * computed as totalTimeMs − winnerTimeMs with no correction for laps down.
 * Sainz P8 (56 laps) showed +7.498s while Ricciardo P4 (57 laps) showed
 * +63.449s — a P8 gap smaller than P4 is impossible. The raw time deficit
 * of a lapped car understates the true gap by roughly one lap-time per
 * missing lap (O'Ward 56, Ocon/Hulkenberg/Perez 55 laps on a 57-lap race).
 *
 * Broadcast convention wins: a car with fewer laps than the winner displays
 * "+N LAP" / "+N LAPS" instead of a second gap (both locales keep the LAP
 * spelling per F1 convention). DNF stays DNF; cars on the winner's lap keep
 * their second gap.
 */

/**
 * Laps down vs the race winner, or null when the laps-down rule does not
 * apply: unknown laps, winner laps unknown/non-positive, or the car
 * completed the same number of laps as the winner (second gap stays).
 */
export function computeLapsDown(
  laps: number | undefined,
  winnerLaps: number | undefined,
): number | null {
  if (laps == null || winnerLaps == null || winnerLaps <= 0) return null;
  const down = winnerLaps - laps;
  return down > 0 ? down : null;
}

/** Broadcast spelling: "+1 LAP", "+2 LAPS" (F1 convention, both locales). */
export function formatLapsDown(n: number): string {
  return `+${n} LAP${n > 1 ? 'S' : ''}`;
}
