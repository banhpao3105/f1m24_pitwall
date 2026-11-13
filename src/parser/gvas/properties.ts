/**
 * GVAS property deserialization — Phase 0.
 *
 * Faithful port of the Gazette v2.2 oracle (UESaveTool properties):
 *   workspace/user/files/F1_Manager_Circuit_Gazette.html
 *
 * Byte layouts AFTER the (name, type, size) header consumed by `readTuple`:
 *   BoolProperty        : skip(4) + u8 value + skip(1)
 *   Int/UInt32/Float    : i32 index + skip(1) + 4-byte value
 *   Int8/Int16          : i32 index + skip(1) + 1/2-byte value
 *   Int64/UInt64        : i32 index + skip(1) + 8-byte value
 *   StrProperty         : skip(5) + FString (unicode-aware)
 *   EnumProperty        : skip(4) + FString enumType + skip(1) + FString value
 *   ObjectProperty      : skip(5) + FString path
 *   SoftObjectProperty  : skip(5) + FString path + skip(4)
 *   StructProperty      : skip(4) + FString storedType + skip(17) + tuples
 *   ArrayProperty       : skip(4) + FString storedType + skip(1) + i16 count
 *                         + skip(2) + payload (see array handling below)
 *
 * Array payload handling (oracle parity — count is read as i16, i.e. the low
 * 16 bits of the on-disk int32; verified against real F1M 23/24 saves where
 * in-property array counts stay below 32768):
 *   StructProperty array: nested (name, type, size) header + struct header,
 *                         then `count` tuples.
 *   IntProperty array   : skip(count*4) + (count-1) tagged properties.
 *   SoftObjectProperty  : count × (FString + skip(4)).
 *   Anything else       : hard error (oracle TypeNotImplementedError).
 */

import { Serializer } from './serializer';
import { SaveParseError, ParseErrorCode } from '../errors';

export interface GvasProperty {
  name: string;
  type: string;
  /** Byte size claimed by the on-disk size field (informational). */
  size: number;
}

export interface GuidProperty extends GvasProperty {
  id: string;
  value: number;
}

export interface ValuedProperty<T> extends GvasProperty {
  value: T;
}

export interface EnumProperty extends GvasProperty {
  enumType: string;
  value: string;
}

export interface StructProperty extends GvasProperty {
  storedPropertyType: string;
  properties: GvasProperty[];
}

export interface ArrayProperty extends GvasProperty {
  storedPropertyType: string;
  count: number;
  payloadKind: 'int' | 'soft-object' | 'struct';
  /** Raw byte span of the payload inside the source buffer. */
  properties?: GvasProperty[];
}

function malformed(what: string, serial: Serializer): SaveParseError {
  return new SaveParseError(
    ParseErrorCode.MALFORMED_GVAS,
    `${what} at offset 0x${serial.tell.toString(16)}`,
  );
}

export function readGuid(serial: Serializer): GuidProperty {
  const p1 = swapEnd(serial.read(4));
  const p2 = swapEnd(serial.read(2));
  const p3 = swapEnd(serial.read(2));
  const p4 = serial.read(2);
  const p5 = serial.read(6);
  const id = [
    hex(p1),
    hex(p2),
    hex(p3),
    hex(p4),
    hex(p5),
  ].join('-');
  const value = serial.readInt32();
  return { name: 'Guid', type: 'Guid', size: 20, id, value };
}

function swapEnd(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[bytes.length - 1 - i] = bytes[i];
  return out;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads one tagged property of `type` starting at the current position.
 * The (name, type, size) header must already be consumed by the caller.
 */
export function readPropertyBody(
  serial: Serializer,
  name: string,
  type: string,
  size: number,
  depth = 0,
): GvasProperty {
  if (depth > 64) throw malformed(`property nesting too deep at ${name}`, serial);

  switch (type) {
    case 'BoolProperty': {
      serial.seek(4);
      const value = serial.readUInt8() === 1;
      serial.seek(1);
      const prop: ValuedProperty<boolean> = { name, type, size, value };
      return prop;
    }
    case 'IntProperty':
    case 'UInt32Property': {
      serial.readInt32(); // index
      serial.seek(1);
      const value = serial.readInt32();
      const prop: ValuedProperty<number> = { name, type, size, value };
      return prop;
    }
    case 'Int8Property': {
      serial.readInt32();
      serial.seek(1);
      const value = serial.readInt8();
      const prop: ValuedProperty<number> = { name, type, size, value };
      return prop;
    }
    case 'Int16Property': {
      serial.readInt32();
      serial.seek(1);
      const value = serial.readInt16();
      const prop: ValuedProperty<number> = { name, type, size, value };
      return prop;
    }
    case 'Int64Property':
    case 'UInt64Property': {
      serial.readInt32();
      serial.seek(1);
      const value = serial.readInt64();
      const prop: ValuedProperty<number | string> = { name, type, size, value };
      return prop;
    }
    case 'FloatProperty': {
      serial.readInt32();
      serial.seek(1);
      const value = serial.readFloat();
      const prop: ValuedProperty<number> = { name, type, size, value };
      return prop;
    }
    case 'StrProperty': {
      serial.seek(5);
      const value = serial.readUnicodeString();
      const prop: ValuedProperty<string> = { name, type, size, value };
      return prop;
    }
    case 'EnumProperty': {
      serial.seek(4);
      const enumType = serial.readString();
      serial.seek(1);
      const value = serial.readString();
      const prop: EnumProperty = { name, type, size, enumType, value };
      return prop;
    }
    case 'ObjectProperty': {
      serial.seek(5);
      const value = serial.readString();
      const prop: ValuedProperty<string> = { name, type, size, value };
      return prop;
    }
    case 'SoftObjectProperty': {
      serial.seek(5);
      const value = serial.readString();
      serial.seek(4);
      const prop: ValuedProperty<string> = { name, type, size, value };
      return prop;
    }
    case 'StructProperty': {
      serial.seek(4);
      const storedPropertyType = serial.readString();
      serial.seek(17);
      const end = serial.tell + size;
      const properties: GvasProperty[] = [];
      while (serial.tell < end) {
        properties.push(readTuple(serial, depth + 1));
      }
      const prop: StructProperty = {
        name, type, size, storedPropertyType, properties,
      };
      return prop;
    }
    case 'ArrayProperty': {
      serial.seek(4);
      const storedPropertyType = serial.readString();
      serial.seek(1);
      const count = serial.readInt16();
      serial.seek(2);
      if (count < 0) throw malformed(`negative array count ${count} in ${name}`, serial);

      if (storedPropertyType === 'StructProperty') {
        // StructArray oracle semantics: nested header then `count` tuples.
        serial.readString(); // nested name
        serial.readString(); // nested type
        serial.readInt32(); // nested size
        serial.seek(4);
        serial.readString(); // nested stored type
        serial.seek(17);
        const properties: GvasProperty[] = [];
        for (let i = 0; i < count; i++) {
          properties.push(readTuple(serial, depth + 1));
        }
        return {
          name, type, size, storedPropertyType, count,
          payloadKind: 'struct', properties,
        } as ArrayProperty;
      }
      if (storedPropertyType === 'IntProperty') {
        // IntArray oracle semantics: skip count*4 bytes, then count-1 tagged props.
        serial.seek(count * 4);
        const properties: GvasProperty[] = [];
        for (let i = 1; i < count; i++) {
          const pName = serial.readString();
          const pType = serial.readString();
          const pSize = serial.readInt32();
          properties.push(readPropertyBody(serial, pName, pType, pSize, depth + 1));
        }
        return {
          name, type, size, storedPropertyType, count,
          payloadKind: 'int', properties,
        } as ArrayProperty;
      }
      if (storedPropertyType === 'SoftObjectProperty') {
        // SoftObjectArray oracle semantics: count × (FString + skip 4).
        const properties: GvasProperty[] = [];
        for (let i = 0; i < count; i++) {
          const value = serial.readString();
          serial.seek(4);
          const entry: ValuedProperty<string> = {
            name, type: storedPropertyType, size, value,
          };
          properties.push(entry);
        }
        return {
          name, type, size, storedPropertyType, count,
          payloadKind: 'soft-object', properties,
        } as ArrayProperty;
      }
      throw new SaveParseError(
        ParseErrorCode.MALFORMED_GVAS,
        `TypeNotImplementedError: array of '${storedPropertyType}' in property '${name}'`,
      );
    }
    default:
      throw new SaveParseError(
        ParseErrorCode.MALFORMED_GVAS,
        `TypeNotImplementedError: property type '${type}' (property '${name}')`,
      );
  }
}

/**
 * Reads a tuple of tagged properties terminated by the "None" tag.
 * Mirrors oracle `Tuple.deserialize`.
 */
export function readTuple(serial: Serializer, depth = 0): GvasProperty {
  // The first "virtual" entry is the tuple itself; loop until None.
  for (;;) {
    const name = serial.readString();
    if (name === 'None') {
      return { name, type: 'Tuple', size: 0 };
    }
    const type = serial.readString();
    const size = serial.readInt32();
    return readPropertyBody(serial, name, type, size, depth);
  }
}

/**
 * Reads a full tuple list (every property until "None").
 * Mirrors oracle `Gvas.deserialize` usage.
 */
export function readPropertyList(serial: Serializer, depth = 0): GvasProperty[] {
  const out: GvasProperty[] = [];
  for (;;) {
    const name = serial.readString();
    if (name === 'None') break;
    const type = serial.readString();
    const size = serial.readInt32();
    out.push(readPropertyBody(serial, name, type, size, depth));
  }
  return out;
}
