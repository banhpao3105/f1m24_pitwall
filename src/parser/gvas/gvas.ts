/**
 * GVAS container parsing — Phase 0.
 *
 * Port of oracle `GvasHeader` + `Gvas` (UESaveTool/Gvas.js):
 *   magic "GVAS"
 *   int32 SaveGameVersion        (3 = F1M 23/24 era)
 *   int32 PackageVersion
 *   int32 PackageFileVersionUE5  (only when SaveGameVersion >= 3)
 *   u16 EngineVersion.Major / Minor / Patch, u32 Build
 *   FString BuildId              (contains "volta23" / "volta24")
 *   int32 CustomFormatVersion, int32 Count, Count × (Guid + int32)
 *   FString SaveGameClassName
 *   then the tagged property list, terminated by "None".
 */

import { Serializer } from './serializer';
import { readGuid, readPropertyList, type GuidProperty, type GvasProperty } from './properties';
import { SaveParseError, ParseErrorCode } from '../errors';

export const GVAS_MAGIC = 'GVAS';

export interface GvasEngineVersion {
  major: number;
  minor: number;
  patch: number;
  build: number;
  buildId: string;
}

export interface GvasHeader {
  saveGameVersion: number;
  packageVersion: number;
  packageFileVersionUE5: number;
  engineVersion: GvasEngineVersion;
  customFormatVersion: number;
  customFormatCount: number;
  customFormatEntries: GuidProperty[];
  saveGameClassName: string;
}

export interface GvasFile {
  header: GvasHeader;
  properties: GvasProperty[];
}

export function readGvasHeader(serial: Serializer): GvasHeader {
  const magic = serial.read(4);
  if (latin1(magic) !== GVAS_MAGIC) {
    throw new SaveParseError(
      ParseErrorCode.NOT_A_GVAS_SAVE,
      `Unexpected header, expected 'GVAS' but got '${latin1(magic)}'`,
    );
  }

  const saveGameVersion = serial.readInt32();
  const packageVersion = serial.readInt32();
  const packageFileVersionUE5 = saveGameVersion >= 3 ? serial.readInt32() : 0;
  const engineVersion: GvasEngineVersion = {
    major: serial.readUInt16(),
    minor: serial.readUInt16(),
    patch: serial.readUInt16(),
    build: serial.readUInt32(),
    buildId: serial.readString(),
  };
  const customFormatVersion = serial.readInt32();
  const customFormatCount = serial.readInt32();
  const customFormatEntries: GuidProperty[] = [];
  for (let i = 0; i < customFormatCount; i++) {
    customFormatEntries.push(readGuid(serial));
  }
  const saveGameClassName = serial.readString();

  return {
    saveGameVersion,
    packageVersion,
    packageFileVersionUE5,
    engineVersion,
    customFormatVersion,
    customFormatCount,
    customFormatEntries,
    saveGameClassName,
  };
}

export function readGvas(serial: Serializer): GvasFile {
  const header = readGvasHeader(serial);
  const properties = readPropertyList(serial);
  return { header, properties };
}

function latin1(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}
