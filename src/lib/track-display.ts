/**
 * Track display names — oracle parity (Gazette v2.2 `tracks.js`, TRACKS map
 * bundled at source line ~9788). The save stores raw localization keys in
 * Races_Tracks.Name ("AlbertPark", "SpaFrancorchamps"); the game resolves
 * them at runtime. This map is the old tool's verified key → display table,
 * VI/EN from day 0 (docs rule 7). Unknown keys pass through untouched so
 * future tracks never break the UI.
 */

export interface TrackNameEntry {
  en: string;
  vi: string;
}

export const TRACK_DISPLAY: Record<string, TrackNameEntry> = {
  AlbertPark: { en: 'Albert Park', vi: 'Albert Park' },
  Bahrain: { en: 'Bahrain International Circuit', vi: 'Bahrain' },
  Shanghai: { en: 'Shanghai', vi: 'Thượng Hải' },
  Baku: { en: 'Baku City Circuit', vi: 'Baku' },
  Barcelona: { en: 'Barcelona-Catalunya', vi: 'Barcelona-Catalunya' },
  Monaco: { en: 'Monaco', vi: 'Monaco' },
  Montreal: { en: 'Circuit Gilles Villeneuve', vi: 'Montreal' },
  PaulRicard: { en: 'Paul Ricard', vi: 'Paul Ricard' },
  RedBullRing: { en: 'Red Bull Ring', vi: 'Red Bull Ring' },
  Silverstone: { en: 'Silverstone', vi: 'Silverstone' },
  Jeddah: { en: 'Jeddah Corniche Circuit', vi: 'Jeddah' },
  Hungaroring: { en: 'Hungaroring', vi: 'Hungaroring' },
  SpaFrancorchamps: { en: 'Spa-Francorchamps', vi: 'Spa-Francorchamps' },
  Monza: { en: 'Monza', vi: 'Monza' },
  MarinaBay: { en: 'Marina Bay', vi: 'Marina Bay' },
  Sochi: { en: 'Sochi', vi: 'Sochi' },
  Suzuka: { en: 'Suzuka', vi: 'Suzuka' },
  HermanosRodriguez: { en: 'Autódromo Hermanos Rodríguez', vi: 'Hermanos Rodríguez' },
  CircuitOfTheAmericas: { en: 'Circuit of the Americas', vi: 'Circuit of the Americas' },
  Interlagos: { en: 'Interlagos', vi: 'Interlagos' },
  YasMarina: { en: 'Yas Marina', vi: 'Yas Marina' },
  Miami: { en: 'Miami International Autodrome', vi: 'Miami' },
  Zandvoort: { en: 'Zandvoort', vi: 'Zandvoort' },
  Imola: { en: 'Imola', vi: 'Imola' },
  Vegas: { en: 'Las Vegas Strip Circuit', vi: 'Las Vegas' },
  Qatar: { en: 'Losail', vi: 'Losail' },
};

/**
 * Display name for a raw Races_Tracks.Name key in the given locale.
 * Unknown/undefined keys fall back to the raw value (never invented).
 */
export function trackDisplay(
  rawName: string | undefined | null,
  locale: 'vi' | 'en',
): string {
  if (!rawName) return '—';
  const entry = TRACK_DISPLAY[rawName];
  if (!entry) return rawName;
  return locale === 'vi' ? entry.vi : entry.en;
}
