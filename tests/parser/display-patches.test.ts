/**
 * 0.4.1 bug-fix tests: staff-name display patches + track display names.
 */

import { describe, it, expect } from 'vitest';
import { cleanStaffName, STAFF_NAME_DISPLAY_PATCHES } from '@/parser/normalize/build-model';
import { cleanDriverCode } from '@/parser/repositories/drivers.repo';
import { trackDisplay, TRACK_DISPLAY } from '@/lib/track-display';

describe('cleanStaffName display patches (0.4.1)', () => {
  it("restores the apostrophe in O'Ward from the localization key", () => {
    // Real-save row (Staff_BasicData, verified 1.11.0): Pato O'Ward is stored
    // as "[StaffName_Forename_Male_Pato]" + "[StaffName_Surname_OWard]".
    expect(cleanStaffName('[StaffName_Forename_Male_Pato]')).toBe('Pato');
    expect(cleanStaffName('[StaffName_Surname_OWard]')).toBe("O'Ward");
  });

  it('patches particle and legend surnames', () => {
    expect(cleanStaffName('[StaffName_Surname_DeLaRosa]')).toBe('de la Rosa');
    expect(cleanStaffName('[StaffName_Surname_dosSantos]')).toBe('dos Santos');
    expect(cleanStaffName('[StaffName_Surname_Barichello]')).toBe('Barrichello');
  });

  it('still strips the trailing digit before patching (Mini1 parity)', () => {
    expect(cleanStaffName('[StaffName_Forename_Male_Mini1]')).toBe('Mini');
  });

  it('leaves plain names and unknown keys untouched', () => {
    expect(cleanStaffName('Verstappen')).toBe('Verstappen');
    expect(cleanStaffName('[StaffName_Surname_Conte]')).toBe('Conte');
  });

  it('0.5.3: decodes STRING_LITERAL names before the generic key fallback', () => {
    // Real-save rows (Staff_BasicData, Bahrain Day 46495): staffId 645/646.
    // Old code split the key on the STRING_LITERAL underscore and emitted
    // "LITERAL:Value=|Colton|".
    expect(cleanStaffName('[STRING_LITERAL:Value=|Colton|]')).toBe('Colton');
    expect(cleanStaffName('[STRING_LITERAL:Value=|Herta|]')).toBe('Herta');
    // value may contain spaces
    expect(cleanStaffName('[STRING_LITERAL:Value=|Fittipaldi Jr.|]')).toBe('Fittipaldi Jr.');
  });

  it('0.5.3: existing key shapes still decode exactly as before', () => {
    expect(cleanStaffName('[StaffName_Forename_Male_Lewis]')).toBe('Lewis');
    expect(cleanStaffName('[StaffName_Surname_OWard]')).toBe("O'Ward");
    expect(cleanStaffName('[StaffName_Surname_Perez1]')).toBe('Perez');
  });

  it('0.5.3: multi-word forename keys split at camelCase boundaries', () => {
    // Real-save rows: staffId 376 "AndreaKimi" Antonelli.
    expect(cleanStaffName('[StaffName_Forename_Male_AndreaKimi]')).toBe('Andrea Kimi');
    expect(cleanStaffName('[StaffName_Forename_Male_JuanManuel]')).toBe('Juan Manuel');
    expect(cleanStaffName('[StaffName_Forename_Male_FrancoisXavier1]')).toBe('Francois Xavier');
  });

  it('0.5.3: surname keys split only before particles', () => {
    // Real-save rows: staffId 76 "Nyck" deVries.
    expect(cleanStaffName('[StaffName_Surname_deVries]')).toBe('de Vries');
    expect(cleanStaffName('[StaffName_Surname_deBeer]')).toBe('de Beer');
    expect(cleanStaffName('[StaffName_Surname_vanLeeuwen]')).toBe('van Leeuwen');
    expect(cleanStaffName('[StaffName_Surname_AlQubaisi]')).toBe('Al Qubaisi');
    // no particle → no split (full surname splitting would corrupt these)
    expect(cleanStaffName('[StaffName_Surname_MacPherson]')).toBe('MacPherson');
    expect(cleanStaffName('[StaffName_Surname_DallAra]')).toBe('DallAra');
    expect(cleanStaffName('[StaffName_Surname_VanderVen]')).toBe('VanderVen');
    // lowercase continuation blocks the split
    expect(cleanStaffName('[StaffName_Surname_Vandoorne]')).toBe('Vandoorne');
  });

  it('0.5.3: verified-correct names are untouched by the spacing fix', () => {
    expect(cleanStaffName('[StaffName_Surname_Verstappen]')).toBe('Verstappen');
    expect(cleanStaffName('[StaffName_Surname_Ricciardo]')).toBe('Ricciardo');
    expect(cleanStaffName('[StaffName_Surname_Leclerc]')).toBe('Leclerc');
    expect(cleanStaffName('[StaffName_Surname_Antonelli]')).toBe('Antonelli');
  });

  it('patch map stays small and documented', () => {
    // Guard rail: patches are a curated display table, not a heuristic.
    expect(Object.keys(STAFF_NAME_DISPLAY_PATCHES).sort()).toEqual([
      'Barichello', 'DeLaRosa', 'OWard', 'dosSantos',
    ]);
  });
});

describe('trackDisplay (oracle TRACKS parity)', () => {
  it('maps raw Races_Tracks keys to display names', () => {
    expect(trackDisplay('AlbertPark', 'vi')).toBe('Albert Park');
    expect(trackDisplay('SpaFrancorchamps', 'vi')).toBe('Spa-Francorchamps');
    expect(trackDisplay('Shanghai', 'vi')).toBe('Thượng Hải');
    expect(trackDisplay('HermanosRodriguez', 'en')).toBe('Autódromo Hermanos Rodríguez');
  });

  it('is locale-aware where the oracle differs (Bahrain, Montreal, Miami…)', () => {
    expect(trackDisplay('Bahrain', 'en')).toBe('Bahrain International Circuit');
    expect(trackDisplay('Bahrain', 'vi')).toBe('Bahrain');
    expect(trackDisplay('Montreal', 'en')).toBe('Circuit Gilles Villeneuve');
    expect(trackDisplay('Vegas', 'en')).toBe('Las Vegas Strip Circuit');
    expect(trackDisplay('Vegas', 'vi')).toBe('Las Vegas');
  });

  it('passes unknown keys through — never invents a name', () => {
    expect(trackDisplay('SomeNewTrack', 'vi')).toBe('SomeNewTrack');
    expect(trackDisplay(undefined, 'vi')).toBe('—');
    expect(trackDisplay(null, 'en')).toBe('—');
  });

  it('covers all 26 oracle tracks', () => {
    expect(Object.keys(TRACK_DISPLAY)).toHaveLength(26);
  });
});

describe('cleanDriverCode (v0.5.0 timing tower)', () => {
  it('decodes localization-key codes from real saves', () => {
    // Real-save rows (Staff_DriverData.DriverCode, verified 1.11.0)
    expect(cleanDriverCode('[DriverCode_Ver]')).toBe('Ver');
    expect(cleanDriverCode('[DriverCode_Owa]')).toBe('Owa');
  });

  it('passes plain codes and edge cases through untouched', () => {
    expect(cleanDriverCode('VER')).toBe('VER');
    // trailing-digit strip applies to decoded keys only — plain text passes
    expect(cleanDriverCode('Mini1')).toBe('Mini1');
    expect(cleanDriverCode('')).toBeUndefined();
    expect(cleanDriverCode(null)).toBeUndefined();
    expect(cleanDriverCode(undefined)).toBeUndefined();
  });

  it('0.5.3: decodes string-literal codes from real saves', () => {
    // Real-save rows (Staff_DriverData, Bahrain Day 46495): staffId 600+.
    expect(cleanDriverCode('[STRING_LITERAL:Value=|LLO|]')).toBe('LLO');
    expect(cleanDriverCode('[STRING_LITERAL:Value=|Owa|]')).toBe('Owa');
    // existing shapes untouched
    expect(cleanDriverCode('[DriverCode_Ver]')).toBe('Ver');
  });
});
