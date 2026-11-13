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
});
