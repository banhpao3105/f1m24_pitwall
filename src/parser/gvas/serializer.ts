/**
 * Binary serializer for GVAS save files — Phase 0.
 *
 * Faithful port of the Gazette v2.2 oracle (UESaveTool Serializer):
 *   workspace/user/files/F1_Manager_Circuit_Gazette.html, class `Serializer`.
 * Semantics kept 1:1 so new-parser output stays byte-compatible with the
 * proven tool:
 *   - `seek` is RELATIVE to the current offset.
 *   - `readString` is latin-1 only and expects a positive length
 *     (UE "FString" with trailing NUL).
 *   - `readUnicodeString` handles negative lengths as UTF-16LE.
 *
 * Deviation from oracle (documented): `readString` throws on a non-positive
 * length instead of silently slicing empty bytes — corrupt input must fail
 * loudly with a parser error code, never produce garbage rows.
 */

import { SaveParseError, ParseErrorCode } from '../errors';

export class Serializer {
  private readonly data: Uint8Array;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  get tell(): number {
    return this.offset;
  }

  get length(): number {
    return this.data.length;
  }

  seek(count: number): number {
    if (this.offset >= this.data.length) {
      throw new SaveParseError(
        ParseErrorCode.MALFORMED_GVAS,
        `Reached end of buffer at offset 0x${this.offset.toString(16)}`,
      );
    }
    this.offset += count;
    return this.offset;
  }

  read(count: number): Uint8Array {
    const slice = this.data.subarray(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }

  peek(count: number): Uint8Array {
    return this.data.subarray(this.offset, this.offset + count);
  }

  readInt8(): number {
    const v = this.data[this.offset] | 0;
    const signed = v & 0x80 ? v - 0x100 : v;
    this.offset += 1;
    return signed;
  }

  readUInt8(): number {
    const v = this.data[this.offset];
    this.offset += 1;
    return v;
  }

  readInt16(): number {
    const v =
      (this.data[this.offset] | (this.data[this.offset + 1] << 8)) | 0;
    const signed = v & 0x8000 ? v - 0x10000 : v;
    this.offset += 2;
    return signed;
  }

  readUInt16(): number {
    const v = this.data[this.offset] | (this.data[this.offset + 1] << 8);
    this.offset += 2;
    return v;
  }

  readInt32(): number {
    const b = this.data;
    const o = this.offset;
    const v = (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) | 0;
    this.offset += 4;
    return v;
  }

  readUInt32(): number {
    return this.readInt32() >>> 0;
  }

  /**
   * Oracle parity: UE packs Int64 as (low u32, high i32); values above 2^52
   * come back as decimal strings, otherwise plain numbers.
   */
  readInt64(): number | string {
    const low = this.readUInt32();
    const high = this.readInt32();
    const val = (BigInt(high) << 32n) + BigInt(low);
    if (val > 1n << 52n) {
      return val.toString();
    }
    return Number(val);
  }

  readFloat(): number {
    const bytes = this.read(4);
    const buf = new ArrayBuffer(4);
    new Uint8Array(buf).set(bytes);
    return new Float32Array(buf)[0];
  }

  /** Latin-1 FString: int32 length (incl. NUL), then length-1 bytes + NUL. */
  readString(): string {
    const length = this.readInt32();
    if (length <= 0) {
      throw new SaveParseError(
        ParseErrorCode.MALFORMED_GVAS,
        `readString expected positive length, got ${length} at offset 0x${this.offset.toString(16)}`,
      );
    }
    const bytes = this.read(length - 1);
    this.read(1); // trailing NUL
    return latin1Decode(bytes);
  }

  /** FString with UTF-16 support (negative length = UTF-16LE). */
  readUnicodeString(): string {
    const length = this.readInt32();
    if (length < 0) {
      const bytes = this.read(-length * 2 - 2);
      this.read(2); // UTF-16 NUL
      return utf16leDecode(bytes);
    }
    if (length === 0) {
      throw new SaveParseError(
        ParseErrorCode.MALFORMED_GVAS,
        `readUnicodeString got zero length at offset 0x${this.offset.toString(16)}`,
      );
    }
    const bytes = this.read(length - 1);
    this.read(1);
    return latin1Decode(bytes);
  }
}

function latin1Decode(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

function utf16leDecode(bytes: Uint8Array): string {
  // Byte-swap-safe manual decode: pair low+high per code unit.
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  }
  return out;
}
