(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/parser/errors.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Parser error codes — Phase 0
 *
 * Every parser failure carries a stable machine code so the UI can map it
 * to a specific, actionable message (docs/02-ARCHITECTURE.md §3.5).
 * Never throw bare strings from parser/*.
 */ __turbopack_context__.s([
    "ParseErrorCode",
    ()=>ParseErrorCode,
    "SaveParseError",
    ()=>SaveParseError
]);
const ParseErrorCode = {
    /** File does not start with the GVAS magic — not an Unreal save file. */ NOT_A_GVAS_SAVE: 'NOT_A_GVAS_SAVE',
    /** GVAS header parsed but BuildId does not map to a supported F1 Manager game. */ UNSUPPORTED_SAVE_FORMAT: 'UNSUPPORTED_SAVE_FORMAT',
    /** Truncated/corrupt file while reading the GVAS structure. */ MALFORMED_GVAS: 'MALFORMED_GVAS',
    /** The decompressed payload does not start with the SQLite header. */ NOT_A_SQLITE_DB: 'NOT_A_SQLITE_DB',
    /** zlib inflate of the embedded database failed. */ DB_INFLATE_FAILED: 'DB_INFLATE_FAILED',
    /** One or more mandatory tables are missing from the embedded database. */ MISSING_CORE_TABLES: 'MISSING_CORE_TABLES',
    /** sql.js failed to initialise or to open the database bytes. */ DB_OPEN_FAILED: 'DB_OPEN_FAILED',
    /** Unexpected internal failure while normalising rows. */ NORMALIZE_FAILED: 'NORMALIZE_FAILED'
};
class SaveParseError extends Error {
    code;
    details;
    constructor(code, message, details){
        super(message);
        this.name = 'SaveParseError';
        this.code = code;
        this.details = details;
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/gvas/serializer.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Serializer",
    ()=>Serializer
]);
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
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/errors.ts [app-client] (ecmascript)");
;
class Serializer {
    data;
    offset = 0;
    constructor(data){
        this.data = data;
    }
    get tell() {
        return this.offset;
    }
    get length() {
        return this.data.length;
    }
    seek(count) {
        if (this.offset >= this.data.length) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MALFORMED_GVAS, `Reached end of buffer at offset 0x${this.offset.toString(16)}`);
        }
        this.offset += count;
        return this.offset;
    }
    read(count) {
        const slice = this.data.subarray(this.offset, this.offset + count);
        this.offset += count;
        return slice;
    }
    peek(count) {
        return this.data.subarray(this.offset, this.offset + count);
    }
    readInt8() {
        const v = this.data[this.offset] | 0;
        const signed = v & 0x80 ? v - 0x100 : v;
        this.offset += 1;
        return signed;
    }
    readUInt8() {
        const v = this.data[this.offset];
        this.offset += 1;
        return v;
    }
    readInt16() {
        const v = this.data[this.offset] | this.data[this.offset + 1] << 8 | 0;
        const signed = v & 0x8000 ? v - 0x10000 : v;
        this.offset += 2;
        return signed;
    }
    readUInt16() {
        const v = this.data[this.offset] | this.data[this.offset + 1] << 8;
        this.offset += 2;
        return v;
    }
    readInt32() {
        const b = this.data;
        const o = this.offset;
        const v = b[o] | b[o + 1] << 8 | b[o + 2] << 16 | b[o + 3] << 24 | 0;
        this.offset += 4;
        return v;
    }
    readUInt32() {
        return this.readInt32() >>> 0;
    }
    /**
   * Oracle parity: UE packs Int64 as (low u32, high i32); values above 2^52
   * come back as decimal strings, otherwise plain numbers.
   */ readInt64() {
        const low = this.readUInt32();
        const high = this.readInt32();
        const val = (BigInt(high) << 32n) + BigInt(low);
        if (val > 1n << 52n) {
            return val.toString();
        }
        return Number(val);
    }
    readFloat() {
        const bytes = this.read(4);
        const buf = new ArrayBuffer(4);
        new Uint8Array(buf).set(bytes);
        return new Float32Array(buf)[0];
    }
    /** Latin-1 FString: int32 length (incl. NUL), then length-1 bytes + NUL. */ readString() {
        const length = this.readInt32();
        if (length <= 0) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MALFORMED_GVAS, `readString expected positive length, got ${length} at offset 0x${this.offset.toString(16)}`);
        }
        const bytes = this.read(length - 1);
        this.read(1); // trailing NUL
        return latin1Decode(bytes);
    }
    /** FString with UTF-16 support (negative length = UTF-16LE). */ readUnicodeString() {
        const length = this.readInt32();
        if (length < 0) {
            const bytes = this.read(-length * 2 - 2);
            this.read(2); // UTF-16 NUL
            return utf16leDecode(bytes);
        }
        if (length === 0) {
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MALFORMED_GVAS, `readUnicodeString got zero length at offset 0x${this.offset.toString(16)}`);
        }
        const bytes = this.read(length - 1);
        this.read(1);
        return latin1Decode(bytes);
    }
}
function latin1Decode(bytes) {
    let out = '';
    const CHUNK = 0x8000;
    for(let i = 0; i < bytes.length; i += CHUNK){
        out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return out;
}
function utf16leDecode(bytes) {
    // Byte-swap-safe manual decode: pair low+high per code unit.
    let out = '';
    for(let i = 0; i + 1 < bytes.length; i += 2){
        out += String.fromCharCode(bytes[i] | bytes[i + 1] << 8);
    }
    return out;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/gvas/properties.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
 */ __turbopack_context__.s([
    "readGuid",
    ()=>readGuid,
    "readPropertyBody",
    ()=>readPropertyBody,
    "readPropertyList",
    ()=>readPropertyList,
    "readTuple",
    ()=>readTuple
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/errors.ts [app-client] (ecmascript)");
;
function malformed(what, serial) {
    return new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MALFORMED_GVAS, `${what} at offset 0x${serial.tell.toString(16)}`);
}
function readGuid(serial) {
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
        hex(p5)
    ].join('-');
    const value = serial.readInt32();
    return {
        name: 'Guid',
        type: 'Guid',
        size: 20,
        id,
        value
    };
}
function swapEnd(bytes) {
    const out = new Uint8Array(bytes.length);
    for(let i = 0; i < bytes.length; i++)out[bytes.length - 1 - i] = bytes[i];
    return out;
}
function hex(bytes) {
    return Array.from(bytes, (b)=>b.toString(16).padStart(2, '0')).join('');
}
function readPropertyBody(serial, name, type, size, depth = 0) {
    if (depth > 64) throw malformed(`property nesting too deep at ${name}`, serial);
    switch(type){
        case 'BoolProperty':
            {
                serial.seek(4);
                const value = serial.readUInt8() === 1;
                serial.seek(1);
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'IntProperty':
        case 'UInt32Property':
            {
                serial.readInt32(); // index
                serial.seek(1);
                const value = serial.readInt32();
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'Int8Property':
            {
                serial.readInt32();
                serial.seek(1);
                const value = serial.readInt8();
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'Int16Property':
            {
                serial.readInt32();
                serial.seek(1);
                const value = serial.readInt16();
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'Int64Property':
        case 'UInt64Property':
            {
                serial.readInt32();
                serial.seek(1);
                const value = serial.readInt64();
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'FloatProperty':
            {
                serial.readInt32();
                serial.seek(1);
                const value = serial.readFloat();
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'StrProperty':
            {
                serial.seek(5);
                const value = serial.readUnicodeString();
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'EnumProperty':
            {
                serial.seek(4);
                const enumType = serial.readString();
                serial.seek(1);
                const value = serial.readString();
                const prop = {
                    name,
                    type,
                    size,
                    enumType,
                    value
                };
                return prop;
            }
        case 'ObjectProperty':
            {
                serial.seek(5);
                const value = serial.readString();
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'SoftObjectProperty':
            {
                serial.seek(5);
                const value = serial.readString();
                serial.seek(4);
                const prop = {
                    name,
                    type,
                    size,
                    value
                };
                return prop;
            }
        case 'StructProperty':
            {
                serial.seek(4);
                const storedPropertyType = serial.readString();
                serial.seek(17);
                const end = serial.tell + size;
                const properties = [];
                while(serial.tell < end){
                    properties.push(readTuple(serial, depth + 1));
                }
                const prop = {
                    name,
                    type,
                    size,
                    storedPropertyType,
                    properties
                };
                return prop;
            }
        case 'ArrayProperty':
            {
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
                    const properties = [];
                    for(let i = 0; i < count; i++){
                        properties.push(readTuple(serial, depth + 1));
                    }
                    return {
                        name,
                        type,
                        size,
                        storedPropertyType,
                        count,
                        payloadKind: 'struct',
                        properties
                    };
                }
                if (storedPropertyType === 'IntProperty') {
                    // IntArray oracle semantics: skip count*4 bytes, then count-1 tagged props.
                    serial.seek(count * 4);
                    const properties = [];
                    for(let i = 1; i < count; i++){
                        const pName = serial.readString();
                        const pType = serial.readString();
                        const pSize = serial.readInt32();
                        properties.push(readPropertyBody(serial, pName, pType, pSize, depth + 1));
                    }
                    return {
                        name,
                        type,
                        size,
                        storedPropertyType,
                        count,
                        payloadKind: 'int',
                        properties
                    };
                }
                if (storedPropertyType === 'SoftObjectProperty') {
                    // SoftObjectArray oracle semantics: count × (FString + skip 4).
                    const properties = [];
                    for(let i = 0; i < count; i++){
                        const value = serial.readString();
                        serial.seek(4);
                        const entry = {
                            name,
                            type: storedPropertyType,
                            size,
                            value
                        };
                        properties.push(entry);
                    }
                    return {
                        name,
                        type,
                        size,
                        storedPropertyType,
                        count,
                        payloadKind: 'soft-object',
                        properties
                    };
                }
                throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MALFORMED_GVAS, `TypeNotImplementedError: array of '${storedPropertyType}' in property '${name}'`);
            }
        default:
            throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MALFORMED_GVAS, `TypeNotImplementedError: property type '${type}' (property '${name}')`);
    }
}
function readTuple(serial, depth = 0) {
    // The first "virtual" entry is the tuple itself; loop until None.
    for(;;){
        const name = serial.readString();
        if (name === 'None') {
            return {
                name,
                type: 'Tuple',
                size: 0
            };
        }
        const type = serial.readString();
        const size = serial.readInt32();
        return readPropertyBody(serial, name, type, size, depth);
    }
}
function readPropertyList(serial, depth = 0) {
    const out = [];
    for(;;){
        const name = serial.readString();
        if (name === 'None') break;
        const type = serial.readString();
        const size = serial.readInt32();
        out.push(readPropertyBody(serial, name, type, size, depth));
    }
    return out;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/gvas/gvas.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
 */ __turbopack_context__.s([
    "GVAS_MAGIC",
    ()=>GVAS_MAGIC,
    "readGvas",
    ()=>readGvas,
    "readGvasHeader",
    ()=>readGvasHeader
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$gvas$2f$properties$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/gvas/properties.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/errors.ts [app-client] (ecmascript)");
;
;
const GVAS_MAGIC = 'GVAS';
function readGvasHeader(serial) {
    const magic = serial.read(4);
    if (latin1(magic) !== GVAS_MAGIC) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].NOT_A_GVAS_SAVE, `Unexpected header, expected 'GVAS' but got '${latin1(magic)}'`);
    }
    const saveGameVersion = serial.readInt32();
    const packageVersion = serial.readInt32();
    const packageFileVersionUE5 = saveGameVersion >= 3 ? serial.readInt32() : 0;
    const engineVersion = {
        major: serial.readUInt16(),
        minor: serial.readUInt16(),
        patch: serial.readUInt16(),
        build: serial.readUInt32(),
        buildId: serial.readString()
    };
    const customFormatVersion = serial.readInt32();
    const customFormatCount = serial.readInt32();
    const customFormatEntries = [];
    for(let i = 0; i < customFormatCount; i++){
        customFormatEntries.push((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$gvas$2f$properties$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readGuid"])(serial));
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
        saveGameClassName
    };
}
function readGvas(serial) {
    const header = readGvasHeader(serial);
    const properties = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$gvas$2f$properties$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readPropertyList"])(serial);
    return {
        header,
        properties
    };
}
function latin1(bytes) {
    return Array.from(bytes, (b)=>String.fromCharCode(b)).join('');
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/parse-save.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "SQLITE_HEADER",
    ()=>SQLITE_HEADER,
    "parseF1ManagerSave",
    ()=>parseF1ManagerSave
]);
/**
 * parseF1ManagerSave — entry point ported from the Gazette v2.2 oracle.
 *
 * Pipeline (docs/01-AUDIT-DATA.md §4.2, verified against a real F1M 24 save):
 *   .sav bytes
 *     → GVAS container (header + properties, terminated by "None")
 *     → 5 × int32 (unknownZero, totalSize, size1, size2, size3)
 *     → zlib inflate of the next `totalSize` bytes
 *     → databaseFile = first `size1` bytes, must start with "SQLite format 3"
 *
 * Version detection mirrors the oracle exactly:
 *   SaveGameVersion 2 → BuildId contains "22_"            → F1M 22
 *   SaveGameVersion 3 → BuildId contains "volta23"        → F1M 23
 *   SaveGameVersion 3 → BuildId contains "volta24"        → F1M 24
 *   anything else                                   → UNSUPPORTED_SAVE_FORMAT
 *
 * NOTE (oracle parity): the 23 vs 24 `gameVersion` substring offsets differ
 * in the oracle ("23+" + 3 vs "24+" + 8). Kept as-is — it only affects the
 * cosmetic `gameVersion` metadata string, never parsing.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$pako$2f$dist$2f$pako$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/pako/dist/pako.mjs [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$gvas$2f$serializer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/gvas/serializer.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$gvas$2f$gvas$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/gvas/gvas.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/errors.ts [app-client] (ecmascript)");
;
;
;
;
const SQLITE_HEADER = 'SQLite format 3';
function parseF1ManagerSave(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const serial = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$gvas$2f$serializer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Serializer"](bytes);
    let gvas;
    try {
        gvas = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$gvas$2f$gvas$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readGvas"])(serial);
    } catch (err) {
        if (err instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"]) throw err;
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MALFORMED_GVAS, `Failed to read GVAS container: ${err.message}`);
    }
    const { saveGameVersion } = gvas.header;
    const buildId = gvas.header.engineVersion.buildId;
    let version = 0;
    let gameVersion = null;
    let gameVersionWithBuild = null;
    if (saveGameVersion === 2) {
        version = 2;
        gameVersion = 'F1M22';
        gameVersionWithBuild = `${buildId.substring(buildId.indexOf('22_') + 3)}.${gvas.header.engineVersion.build & 2147483647}`;
    } else if (saveGameVersion === 3) {
        if (buildId.includes('volta23')) {
            version = 3;
            gameVersion = 'F1M23';
            gameVersionWithBuild = `${buildId.substring(buildId.indexOf('23+') + 3)}.${gvas.header.engineVersion.build & 2147483647}`;
        }
        if (buildId.includes('volta24')) {
            version = 4;
            gameVersion = 'F1M24';
            gameVersionWithBuild = `${buildId.substring(buildId.indexOf('24+') + 8)}.${gvas.header.engineVersion.build & 2147483647}`;
        }
    }
    if (version === 0 || gameVersion === null || gameVersionWithBuild === null) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].UNSUPPORTED_SAVE_FORMAT, `Unsupported save format: SaveGameVersion=${saveGameVersion}, BuildId='${buildId}'`);
    }
    serial.readInt32(); // unknownZero
    const totalSize = serial.readInt32();
    const size1 = serial.readInt32();
    const size2 = serial.readInt32();
    const size3 = serial.readInt32();
    if (totalSize <= 0 || size1 <= 0) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].NOT_A_SQLITE_DB, `Invalid embedded database sizes: total=${totalSize}, db=${size1}`);
    }
    const compressed = serial.read(totalSize);
    let output;
    try {
        output = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$pako$2f$dist$2f$pako$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__["inflate"])(compressed);
    } catch (err) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].DB_INFLATE_FAILED, `zlib inflate failed: ${err.message}`);
    }
    const databaseFile = output.slice(0, size1);
    const headerText = latin1Of(databaseFile.subarray(0, 16));
    if (!headerText.startsWith(SQLITE_HEADER)) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].NOT_A_SQLITE_DB, `Embedded database header check failed: '${headerText}'`);
    }
    return {
        databaseFile,
        metadata: {
            version,
            gameVersion,
            gameVersionWithBuild,
            fullBuildId: buildId,
            saveGameClassName: gvas.header.saveGameClassName,
            saveGameVersion,
            engineVersion: `${gvas.header.engineVersion.major}.${gvas.header.engineVersion.minor}.${gvas.header.engineVersion.patch}`
        }
    };
}
function latin1Of(bytes) {
    return Array.from(bytes, (b)=>String.fromCharCode(b)).join('');
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/sqlite/sqljs-loader.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "loadSqlJs",
    ()=>loadSqlJs,
    "openDatabase",
    ()=>openDatabase,
    "queryAll",
    ()=>queryAll
]);
/**
 * sql.js WASM loader — Phase 0 (docs/02-ARCHITECTURE.md §3.1, §3.6).
 *
 * The WASM binary is self-hosted at /sql-wasm/sql-wasm.wasm (copied from the
 * pinned sql.js npm package) — never loaded from a CDN, per §3.6 (CORS +
 * version drift). Initialisation is cached: exactly one WASM instance per
 * page/worker lifetime.
 *
 * In Node (vitest), callers pass `locateFile` pointing into node_modules.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sql$2e$js$2f$dist$2f$sql$2d$wasm$2d$browser$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/sql.js/dist/sql-wasm-browser.js [app-client] (ecmascript)");
;
let cached = null;
function loadSqlJs(options = {}) {
    if (cached) return cached;
    cached = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$sql$2e$js$2f$dist$2f$sql$2d$wasm$2d$browser$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"])({
        locateFile: options.locateFile ?? ((file)=>{
            // Absolute origin required: inside a Turbopack blob worker the
            // document base is blob:…, so a leading-slash path would resolve
            // against the blob URL and fail to fetch the WASM binary.
            const origin = typeof self !== 'undefined' && self.location?.origin ? self.location.origin : '';
            return `${origin}/sql-wasm/${file}`;
        })
    });
    return cached;
}
async function openDatabase(bytes, options = {}) {
    const SQL = await loadSqlJs(options);
    return new SQL.Database(bytes);
}
function queryAll(db, sql, bind) {
    const res = db.exec(sql, bind);
    if (res.length === 0) return [];
    return res[0].values;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/schema.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Schema detection — Phase 0 (docs/01-AUDIT-DATA.md §4.3, §A1).
 *
 * Core tables are mandatory: without them the save cannot serve the Pit Wall
 * and we fail with MISSING_CORE_TABLES listing what is absent.
 * Optional tables degrade to confidence LOW fallbacks, never crashes.
 *
 * The A1 inventory (docs/01-AUDIT-DATA.md) was verified against a real
 * F1M 24 save (build volta24+game+1.11.0): all core tables present,
 * 324 tables total.
 */ __turbopack_context__.s([
    "CORE_TABLES",
    ()=>CORE_TABLES,
    "OPTIONAL_TABLES",
    ()=>OPTIONAL_TABLES,
    "detectSchema",
    ()=>detectSchema,
    "hasTable",
    ()=>hasTable,
    "listTables",
    ()=>listTables,
    "tableColumns",
    ()=>tableColumns
]);
const CORE_TABLES = [
    'Races',
    'Races_Tracks',
    'Races_Results',
    'Teams',
    'Staff_BasicData',
    'Player',
    'Player_State'
];
const OPTIONAL_TABLES = [
    'Races_QualifyingResults',
    'Races_SprintResults',
    'Races_PitStopResults',
    'Races_PitStopTimings',
    'Races_PracticeResults',
    'Races_DriverStandings',
    'Races_TeamStandings',
    'Save_CarTyreAllocation',
    'Staff_PerformanceStats',
    'Staff_DriverData',
    'Staff_Contracts',
    'Staff_ContractPatience',
    'Teams_Colours',
    'Countries',
    'Parts_TeamExpertise',
    'Parts_Designs',
    'Parts_Items',
    'Parts_CarLoadout',
    'Regulations_Proposals',
    'Finance_Transactions',
    'Finance_TeamBalance',
    'Seasons',
    'Board_SeasonObjectives',
    'Board_Confidence'
];
function listTables(db) {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name");
    if (res.length === 0) return [];
    return res[0].values.map((row)=>String(row[0]));
}
function hasTable(db, table) {
    const res = db.exec("SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?", [
        table
    ]);
    const first = res[0]?.values[0]?.[0];
    return Number(first ?? 0) > 0;
}
function tableColumns(db, table) {
    const sqlRes = db.exec("SELECT sql FROM sqlite_master WHERE type IN ('table','view') AND name = ?", [
        table
    ]);
    const sqlText = sqlRes[0]?.values[0]?.[0];
    if (typeof sqlText === 'string' && sqlText.length > 0) {
        const parsed = parseCreateTableColumns(sqlText);
        if (parsed.length > 0) return parsed;
    }
    try {
        const pragma = db.exec(`PRAGMA table_info(${quoteIdent(table)})`);
        if (pragma.length > 0) {
            return pragma[0].values.map((row)=>String(row[1]));
        }
    } catch  {
    // fallthrough
    }
    return [];
}
function detectSchema(db) {
    const present = new Set(listTables(db));
    const missingCore = CORE_TABLES.filter((t)=>!present.has(t));
    const missingOptional = OPTIONAL_TABLES.filter((t)=>!present.has(t));
    const tableColumns = {};
    for (const t of CORE_TABLES){
        if (present.has(t)) tableColumns[t] = tableColumnsOf(db, t);
    }
    return {
        tablesPresent: Array.from(present),
        tablesMissingCore: [
            ...missingCore
        ],
        tablesMissingOptional: [
            ...missingOptional
        ],
        tableColumns
    };
}
function tableColumnsOf(db, table) {
    return tableColumns(db, table);
}
function parseCreateTableColumns(sql) {
    const open = sql.indexOf('(');
    const close = sql.lastIndexOf(')');
    if (open < 0 || close <= open) return [];
    const body = sql.slice(open + 1, close);
    const columns = [];
    let depth = 0;
    let token = '';
    const flush = ()=>{
        const t = token.trim().replace(/^["`[\]]+|["`[\]]+$/g, '');
        if (t.length > 0) {
            const first = t.split(/\s+/)[0];
            const upper = first.toUpperCase();
            if (upper !== 'PRIMARY' && upper !== 'UNIQUE' && upper !== 'CHECK' && upper !== 'FOREIGN' && upper !== 'CONSTRAINT') {
                columns.push(first.replace(/^["`[\]]+|["`[\]]+$/g, ''));
            }
        }
        token = '';
    };
    for (const ch of body){
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) {
            flush();
        } else {
            token += ch;
        }
    }
    flush();
    return columns;
}
function quoteIdent(name) {
    return `"${name.replace(/"/g, '""')}"`;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/player.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Player repository — the ONLY place that knows how Player data lives in
 * SQL (docs/02-ARCHITECTURE.md rule: SQL only inside parser/repositories).
 * Verified columns (F1M 24, build volta24+game+1.11.0):
 *   Player: TeamID, FirstName, LastName, CustomTeamEnabled
 *   Player_State: Day, CurrentSeason
 */ __turbopack_context__.s([
    "getPlayer",
    ()=>getPlayer,
    "getPlayerState",
    ()=>getPlayerState
]);
function getPlayer(db) {
    const rows = db.exec('SELECT TeamID, FirstName, LastName, CustomTeamEnabled FROM Player LIMIT 1');
    const row = rows[0]?.values[0];
    if (!row) return null;
    return {
        teamId: Number(row[0] ?? 0),
        firstName: String(row[1] ?? ''),
        lastName: String(row[2] ?? ''),
        customTeamEnabled: Number(row[3] ?? 0)
    };
}
function getPlayerState(db) {
    const rows = db.exec('SELECT Day, CurrentSeason FROM Player_State LIMIT 1');
    const row = rows[0]?.values[0];
    if (!row) return null;
    return {
        day: Number(row[0] ?? 0),
        currentSeason: Number(row[1] ?? 0)
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/teams.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Teams repository — verified columns (F1M 24):
 *   Teams: TeamID, TeamName, TeamNameLocKey, IsCustomTeam, Formula
 *   Teams_Colours: TeamID, ColourID, Colour (optional)
 */ __turbopack_context__.s([
    "getTeams",
    ()=>getTeams
]);
function getTeams(db) {
    const rows = db.exec('SELECT TeamID, TeamName, TeamNameLocKey, IsCustomTeam, Formula FROM Teams ORDER BY TeamID');
    if (rows.length === 0) return [];
    return rows[0].values.map((row)=>({
            teamId: Number(row[0] ?? 0),
            teamName: String(row[1] ?? ''),
            teamNameLocKey: row[2] == null ? undefined : String(row[2]),
            isCustomTeam: Number(row[3] ?? 0),
            formula: Number(row[4] ?? 0)
        }));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/races.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Races repository — verified columns (F1M 24):
 *   Races: RaceID, SeasonID, Day, TrackID, State, RainPractice,
 *          RainQualifying, RainRace, TemperatureRace, WeekendType
 *   Races_Tracks: TrackID, Name, Laps (+ Phase 3: TrackLength, TypeOfTrack,
 *          FirstRace, FastestLap, FastestLapDriverID, FastestLapYear)
 *   Races_Results: Season, RaceID, FinishingPos, DriverID, TeamID, Laps,
 *          Time, FastestLap, Points, DNF, StartingPos (+ Phase 3:
 *          SuccessfulOvertakes, SafetyCarDeployments,
 *          VirtualSafetyCarDeployments)
 * TIME UNITS: the save stores seconds (float). This repo converts to the
 * model contract (ms) at the boundary — engines/UI never see raw seconds.
 *
 * Phase 3 note: the new Gazette columns are selected SOFTLY — the column
 * list is read from sqlite_master first and missing columns become NULL
 * (→ undefined in the model) instead of failing the whole parse. Verified
 * schemas are listed in tests/fixtures/schema/; older/minimal schemas
 * (e.g. F1M 23 exports) degrade gracefully per docs/01 §4.1 rule 4.
 *
 * NOTE (verified vs planning): Races_Results uses `Season` + `FinishingPos`,
 * Races uses `WeekendType` (planning file 01 flagged these columns as
 * "cần verify" — differences recorded in tests/fixtures/schema JSON).
 */ __turbopack_context__.s([
    "getRaceResults",
    ()=>getRaceResults,
    "getRaces",
    ()=>getRaces
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/schema.ts [app-client] (ecmascript)");
;
/**
 * Soft column selection: build a SELECT list where missing optional columns
 * become `NULL`. `cols` empty (table introspection failed) → assume present
 * (previous hard-SELECT behaviour, keeps Phase 0/1 saves working).
 */ function softSelect(cols, specs) {
    return specs.map(([expr, column])=>cols.size === 0 || cols.has(column) ? expr : null);
}
function num(row, idx) {
    if (idx == null) return undefined;
    const v = row[idx];
    return v == null ? undefined : Number(v);
}
/**
 * Absolute column index of spec item i inside the final SELECT list.
 * A NULL placeholder still occupies one slot, so the index is simply the
 * mandatory-block offset + i; NULL → null (read as undefined).
 */ function slotAt(spec, i, offset) {
    return spec[i] == null ? null : offset + i;
}
function getRaces(db) {
    const rCols = new Set((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tableColumns"])(db, 'Races'));
    const tCols = new Set((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tableColumns"])(db, 'Races_Tracks'));
    const racesSpec = softSelect(rCols, [
        [
            'r.RainPractice',
            'RainPractice'
        ],
        [
            'r.RainQualifying',
            'RainQualifying'
        ],
        [
            'r.RainRace',
            'RainRace'
        ],
        [
            'r.TemperatureRace',
            'TemperatureRace'
        ],
        [
            'r.WeekendType',
            'WeekendType'
        ]
    ]);
    const trackSpec = softSelect(tCols, [
        [
            't.Name',
            'Name'
        ],
        [
            't.Laps',
            'Laps'
        ],
        [
            't.TrackLength',
            'TrackLength'
        ],
        [
            't.TypeOfTrack',
            'TypeOfTrack'
        ],
        [
            't.FirstRace',
            'FirstRace'
        ],
        [
            't.FastestLap',
            'FastestLap'
        ],
        [
            't.FastestLapDriverID',
            'FastestLapDriverID'
        ],
        [
            't.FastestLapYear',
            'FastestLapYear'
        ]
    ]);
    const RACES_OFFSET = 5; // mandatory block: RaceID..State
    const TRACK_OFFSET = RACES_OFFSET + racesSpec.length;
    const R = {
        rainPractice: slotAt(racesSpec, 0, RACES_OFFSET),
        rainQualifying: slotAt(racesSpec, 1, RACES_OFFSET),
        rainRace: slotAt(racesSpec, 2, RACES_OFFSET),
        temperatureRace: slotAt(racesSpec, 3, RACES_OFFSET),
        weekendType: slotAt(racesSpec, 4, RACES_OFFSET)
    };
    const T = {
        trackName: slotAt(trackSpec, 0, TRACK_OFFSET),
        laps: slotAt(trackSpec, 1, TRACK_OFFSET),
        trackLengthKm: slotAt(trackSpec, 2, TRACK_OFFSET),
        trackType: slotAt(trackSpec, 3, TRACK_OFFSET),
        trackFirstRaceYear: slotAt(trackSpec, 4, TRACK_OFFSET),
        trackFastestLapMs: slotAt(trackSpec, 5, TRACK_OFFSET),
        trackFastestLapDriverId: slotAt(trackSpec, 6, TRACK_OFFSET),
        trackFastestLapYear: slotAt(trackSpec, 7, TRACK_OFFSET)
    };
    const exprs = [
        'r.RaceID',
        'r.SeasonID',
        'r.Day',
        'r.TrackID',
        'r.State',
        ...racesSpec.map((s)=>s ?? 'NULL'),
        ...trackSpec.map((s)=>s ?? 'NULL')
    ];
    const rows = db.exec(`
    SELECT ${exprs.join(', ')}
    FROM Races r
    LEFT JOIN Races_Tracks t ON t.TrackID = r.TrackID
    ORDER BY r.SeasonID, r.Day
  `);
    if (rows.length === 0) return [];
    // Fixed indices for the mandatory columns:
    const I = {
        raceId: 0,
        seasonId: 1,
        day: 2,
        trackId: 3,
        state: 4
    };
    return rows[0].values.map((row)=>{
        const fastestLapMs = num(row, T.trackFastestLapMs);
        return {
            raceId: Number(row[I.raceId] ?? 0),
            seasonId: Number(row[I.seasonId] ?? 0),
            day: Number(row[I.day] ?? 0),
            trackId: Number(row[I.trackId] ?? 0),
            state: Number(row[I.state] ?? 0),
            rainPractice: num(row, R.rainPractice),
            rainQualifying: num(row, R.rainQualifying),
            // Phase 0 columns keep their hard-SELECT defaults (0) for parity.
            rainRace: R.rainRace == null ? 0 : Number(row[R.rainRace] ?? 0),
            temperatureRace: R.temperatureRace == null ? 0 : Number(row[R.temperatureRace] ?? 0),
            weekendType: R.weekendType == null ? 0 : Number(row[R.weekendType] ?? 0),
            trackName: (()=>{
                const i = T.trackName;
                return i == null || row[i] == null ? undefined : String(row[i]);
            })(),
            laps: num(row, T.laps),
            trackLengthKm: num(row, T.trackLengthKm),
            trackType: num(row, T.trackType),
            trackFirstRaceYear: num(row, T.trackFirstRaceYear),
            // Track record stored in seconds — ms at the boundary (model contract).
            trackFastestLapMs: fastestLapMs == null ? undefined : Math.round(fastestLapMs * 1000),
            trackFastestLapDriverId: num(row, T.trackFastestLapDriverId),
            trackFastestLapYear: num(row, T.trackFastestLapYear)
        };
    });
}
function getRaceResults(db) {
    const resCols = new Set((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["tableColumns"])(db, 'Races_Results'));
    const spec = softSelect(resCols, [
        [
            'Laps',
            'Laps'
        ],
        [
            'FastestLap',
            'FastestLap'
        ],
        [
            'StartingPos',
            'StartingPos'
        ],
        [
            'Time',
            'Time'
        ],
        [
            'SuccessfulOvertakes',
            'SuccessfulOvertakes'
        ],
        [
            'SafetyCarDeployments',
            'SafetyCarDeployments'
        ],
        [
            'VirtualSafetyCarDeployments',
            'VirtualSafetyCarDeployments'
        ]
    ]);
    const RES_OFFSET = 6; // mandatory block: RaceID..DNF
    const K = {
        laps: slotAt(spec, 0, RES_OFFSET),
        fastestLap: slotAt(spec, 1, RES_OFFSET),
        startingPos: slotAt(spec, 2, RES_OFFSET),
        time: slotAt(spec, 3, RES_OFFSET),
        overtakes: slotAt(spec, 4, RES_OFFSET),
        sc: slotAt(spec, 5, RES_OFFSET),
        vsc: slotAt(spec, 6, RES_OFFSET)
    };
    const exprs = [
        'RaceID',
        'DriverID',
        'TeamID',
        'FinishingPos',
        'Points',
        'DNF',
        ...spec.map((s)=>s ?? 'NULL')
    ];
    const rows = db.exec(`
    SELECT ${exprs.join(', ')}
    FROM Races_Results
    ORDER BY RaceID, FinishingPos
  `);
    if (rows.length === 0) return [];
    const I = {
        raceId: 0,
        driverId: 1,
        teamId: 2,
        finishingPos: 3,
        points: 4,
        dnf: 5
    };
    return rows[0].values.map((row)=>{
        const fastestLap = num(row, K.fastestLap);
        const totalTime = num(row, K.time);
        return {
            raceId: Number(row[I.raceId] ?? 0),
            driverId: Number(row[I.driverId] ?? 0),
            teamId: Number(row[I.teamId] ?? 0),
            finishingPos: Number(row[I.finishingPos] ?? 0),
            points: Number(row[I.points] ?? 0),
            dnf: Number(row[I.dnf] ?? 0),
            laps: num(row, K.laps),
            // FastestLap stored in seconds (float) — normalized to ms (contract).
            fastestLap: fastestLap == null ? undefined : Math.round(fastestLap * 1000),
            startingPos: num(row, K.startingPos),
            // Total race Time stored in seconds — ms at the boundary.
            totalTimeMs: totalTime == null ? undefined : Math.round(totalTime * 1000),
            overtakes: num(row, K.overtakes),
            safetyCarDeployments: num(row, K.sc),
            vscDeployments: num(row, K.vsc)
        };
    });
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/drivers.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Drivers repository — verified columns (F1M 24):
 *   Staff_BasicData: StaffID, FirstName, LastName
 *   Staff_DriverData: StaffID, DriverCode
 *   Staff_Contracts: StaffID, ContractType, TeamID, StartDay
 * ContractType = 0 → driver contract (docs/01-AUDIT-DATA.md §4.2).
 */ __turbopack_context__.s([
    "getDrivers",
    ()=>getDrivers
]);
function getDrivers(db) {
    const hasDriverData = hasTable(db, 'Staff_DriverData');
    const rows = db.exec(`
    SELECT s.StaffID, s.FirstName, s.LastName
           ${hasDriverData ? ', dd.DriverCode' : ', NULL'}
    FROM Staff_BasicData s
    ${hasDriverData ? 'JOIN Staff_DriverData dd ON dd.StaffID = s.StaffID' : ''}
    ORDER BY s.StaffID
  `);
    if (rows.length === 0) return [];
    const contracts = new Map();
    try {
        const cRows = db.exec(`
      SELECT StaffID, TeamID, StartDay
      FROM Staff_Contracts
      WHERE ContractType = 0
      ORDER BY StartDay
    `);
        for (const row of cRows[0]?.values ?? []){
            contracts.set(Number(row[0]), Number(row[1] ?? 0)); // later StartDay overwrites
        }
    } catch  {
    // Staff_Contracts optional — degrade to results-based team mapping
    }
    return rows[0].values.map((row)=>({
            staffId: Number(row[0] ?? 0),
            firstName: String(row[1] ?? ''),
            lastName: String(row[2] ?? ''),
            code: row[3] == null || String(row[3]).length === 0 ? undefined : String(row[3]),
            contractTeamId: contracts.get(Number(row[0] ?? 0))
        }));
}
function hasTable(db, table) {
    const res = db.exec("SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?", [
        table
    ]);
    return Number(res[0]?.values[0]?.[0] ?? 0) > 0;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/practice.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Practice repository — verified columns (F1M 24):
 *   Races_PracticeResults: RaceID, PracticeSession, DriverID, TeamID,
 *     BestLapTime, BestLapTyre, RaceFormula
 * BestLapTyre encoding (oracle-verified): 0=H, 1=M, 2=S.
 */ __turbopack_context__.s([
    "getPracticeResults",
    ()=>getPracticeResults
]);
function getPracticeResults(db) {
    const rows = db.exec(`
    SELECT RaceID, PracticeSession, DriverID, TeamID, BestLapTime, BestLapTyre, RaceFormula
    FROM Races_PracticeResults
    WHERE BestLapTime IS NOT NULL AND BestLapTime > 0 AND BestLapTyre IS NOT NULL
    ORDER BY RaceID, PracticeSession, DriverID
  `);
    if (rows.length === 0) return [];
    return rows[0].values.map((row)=>({
            raceId: Number(row[0] ?? 0),
            session: Number(row[1] ?? 0),
            driverId: Number(row[2] ?? 0),
            teamId: Number(row[3] ?? 0),
            // BestLapTime stored in seconds (float) — normalized to ms.
            bestLapMs: Math.round(Number(row[4] ?? 0) * 1000),
            bestLapTyre: Number(row[5] ?? 0),
            raceFormula: Number(row[6] ?? 0)
        }));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/pitstops.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Pit stop repository — verified columns (F1M 24):
 *   Races_PitStopTimings: SeasonID, RaceID, TeamID, DriverID, PitStopID,
 *     PitStopStage, Duration, IncidentDelay, Lap
 * One physical stop can span several timing rows (stationary + lane);
 * PitStopID groups them (oracle groups by RaceID+DriverID+PitStopID and
 * takes MIN(Lap)).
 */ __turbopack_context__.s([
    "getPitTimings",
    ()=>getPitTimings
]);
function getPitTimings(db) {
    const rows = db.exec(`
    SELECT RaceID, DriverID, TeamID, PitStopID, PitStopStage, Lap, Duration
    FROM Races_PitStopTimings
    ORDER BY RaceID, Lap
  `);
    if (rows.length === 0) return [];
    return rows[0].values.map((row)=>({
            raceId: Number(row[0] ?? 0),
            driverId: Number(row[1] ?? 0),
            teamId: Number(row[2] ?? 0),
            pitStopId: Number(row[3] ?? 0),
            stage: Number(row[4] ?? 0),
            lap: Number(row[5] ?? 0),
            // Duration stored in seconds (float) — normalized to ms.
            durationMs: Math.round(Number(row[6] ?? 0) * 1000)
        }));
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/tyres.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Tyre repository — verified columns (F1M 24):
 *   Save_CarTyreAllocation: CarID, TyreSetID, WeekendTyreType, FrontLeftWear,
 *     AvailabilityState, EstimatedLapLifeRemaining, LapsCompleted
 * WeekendTyreType encoding (oracle-verified): 0=W, 1=I, 2=S, 3=M, 4=H.
 */ __turbopack_context__.s([
    "getTyreAllocations",
    ()=>getTyreAllocations
]);
function getTyreAllocations(db) {
    if (!hasTable(db, 'Save_CarTyreAllocation')) return [];
    const rows = db.exec(`
    SELECT CarID, TyreSetID, WeekendTyreType, FrontLeftWear,
           AvailabilityState, EstimatedLapLifeRemaining
    FROM Save_CarTyreAllocation
  `);
    if (rows.length === 0) return [];
    return rows[0].values.map((row)=>({
            carId: Number(row[0] ?? 0),
            tyreSetId: Number(row[1] ?? 0),
            weekendTyreType: Number(row[2] ?? 0),
            frontLeftWear: Number(row[3] ?? 0),
            availabilityState: Number(row[4] ?? 0),
            estimatedLapLifeRemaining: row[5] == null ? undefined : Number(row[5])
        }));
}
function hasTable(db, table) {
    const res = db.exec("SELECT count(*) FROM sqlite_master WHERE type IN ('table','view') AND name = ?", [
        table
    ]);
    return Number(res[0]?.values[0]?.[0] ?? 0) > 0;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/adaptive.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Schema-adaptive table reader — Phase 2.
 *
 * Problem: Parts_*, Finance_*, Staff_* detail and Regulations_* columns have
 * NOT been captured in an introspected fixture (tests/fixtures/schema only
 * stores table names), and the Gazette oracle HTML is no longer available in
 * the working environment.
 *
 * Strategy (docs/01-AUDIT-DATA.md §4.3 + §4.5 degradation rules):
 *   1. `readTable` SELECTs * from the table (guarded by hasTable) and hands
 *      back the ACTUAL header sql.js reports — no guessed column names in SQL.
 *   2. Each repo declares candidate column names per concept (from planning
 *      docs + F1M 23/24 naming conventions). `buildColumnMap` binds a concept
 *      only when the column really exists (case-insensitive).
 *   3. Unmapped concepts stay `undefined` — engines degrade to confidence
 *      LOW with an explicit assumption. Never fabricated numbers.
 *
 * Verification status: CANDIDATE. Re-verify candidates with
 * `bun scripts/introspect-save.ts <save>` (dumps every table's columns
 * since Phase 2) and adjust the candidate lists — engine logic stays put.
 */ __turbopack_context__.s([
    "buildColumnMap",
    ()=>buildColumnMap,
    "colIndex",
    ()=>colIndex,
    "pkCandidates",
    ()=>pkCandidates,
    "readNum",
    ()=>readNum,
    "readNumOrStr",
    ()=>readNumOrStr,
    "readStr",
    ()=>readStr,
    "readTable",
    ()=>readTable
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/schema.ts [app-client] (ecmascript)");
;
function readTable(db, table) {
    if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["hasTable"])(db, table)) return {
        present: false,
        columns: [],
        rows: []
    };
    try {
        const res = db.exec(`SELECT * FROM "${table.replace(/"/g, '""')}"`);
        if (res.length === 0) return {
            present: true,
            columns: [],
            rows: []
        };
        return {
            present: true,
            columns: res[0].columns,
            rows: res[0].values
        };
    } catch  {
        // Unreadable table (corrupt page etc.) — degrade, never throw upstream.
        return {
            present: true,
            columns: [],
            rows: []
        };
    }
}
function buildColumnMap(columns, candidates) {
    const lower = new Map(columns.map((c)=>[
            c.toLowerCase(),
            c
        ]));
    const map = {};
    for (const [concept, names] of Object.entries(candidates)){
        for (const name of names){
            const actual = lower.get(name.toLowerCase());
            if (actual) {
                map[concept] = actual;
                break;
            }
        }
    }
    return map;
}
function colIndex(columns, col) {
    if (!col) return -1;
    return columns.indexOf(col);
}
function readNum(row, idx) {
    if (idx < 0) return undefined;
    const v = row[idx];
    if (v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
function readStr(row, idx) {
    if (idx < 0) return undefined;
    const v = row[idx];
    return v == null ? undefined : String(v);
}
function readNumOrStr(row, columns, map, concept) {
    const idx = colIndex(columns, map[concept]);
    if (idx < 0) return undefined;
    const v = row[idx];
    if (v == null) return undefined;
    return typeof v === 'number' ? String(v) : String(v);
}
function pkCandidates(table) {
    // 0.4.1 bug fix (verified against a real 1.11.0 save): F1M24 names the PK
    // after the SINGULAR entity — Parts_Designs → DesignID, Parts_Items →
    // ItemID, Regulations_Proposals → ProposalID. The old "<Table>ID" guesses
    // never matched, so every Parts/Regulations row was silently dropped.
    const last = table.split('_').pop() ?? table;
    const singular = last.endsWith('s') ? last.slice(0, -1) : last;
    return [
        `${table}ID`,
        `${table}_ID`,
        `${singular}ID`,
        'ID',
        'Id'
    ];
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/quali.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Qualifying repository — schema-adaptive (Phase 2, for the sim engine).
 *
 * Verified facts from the planning docs (docs/01 §4.2):
 *   - `Races_QualifyingResults.ChampionshipPoints` exists (pole bonus source).
 *   - "QualifyingStage = MAX(...) để lấy kết quả quali cuối cùng" — keep the
 *     highest stage per driver per race (normalize does the MAX).
 * Remaining columns are candidates (adaptive reader, see adaptive.ts).
 */ __turbopack_context__.s([
    "getQualifyingResults",
    ()=>getQualifyingResults
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/adaptive.ts [app-client] (ecmascript)");
;
const TABLE = 'Races_QualifyingResults';
const CANDIDATES = {
    rowId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pkCandidates"])(TABLE),
    raceId: [
        'RaceID'
    ],
    driverId: [
        'DriverID'
    ],
    teamId: [
        'TeamID'
    ],
    finishingPos: [
        'FinishingPos',
        'Position',
        'Pos'
    ],
    qualifyingStage: [
        'QualifyingStage',
        'Stage'
    ],
    championshipPoints: [
        'ChampionshipPoints',
        'Points'
    ]
};
function getQualifyingResults(db) {
    const tbl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, TABLE);
    if (!tbl.present) return [];
    const map = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(tbl.columns, CANDIDATES);
    if (!map.raceId || !map.driverId || !map.teamId || !map.finishingPos) return [];
    const rIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tbl.columns, map.raceId);
    const dIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tbl.columns, map.driverId);
    const tIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tbl.columns, map.teamId);
    const fIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tbl.columns, map.finishingPos);
    const sIdx = map.qualifyingStage ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tbl.columns, map.qualifyingStage) : -1;
    const pIdx = map.championshipPoints ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tbl.columns, map.championshipPoints) : -1;
    const out = [];
    for (const row of tbl.rows){
        const raceId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, rIdx);
        const driverId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, dIdx);
        const teamId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, tIdx);
        const finishingPos = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, fIdx);
        if (raceId == null || driverId == null || teamId == null || finishingPos == null) {
            continue;
        }
        out.push({
            raceId,
            driverId,
            teamId,
            finishingPos,
            qualifyingStage: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, sIdx),
            championshipPoints: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, pIdx)
        });
    }
    return out;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/parts.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Parts repository — schema-adaptive (Phase 2).
 *
 * Tables (docs/01-AUDIT-DATA.md A1): Parts_Designs, Parts_Designs_StatValues,
 * Parts_Items, Parts_Items_Faults, Parts_CarLoadout, Parts_TeamExpertise.
 *
 * Verified facts from the planning docs:
 *   - `Parts_TeamExpertise.NextSeasonExpertise` (exact, docs/01 §2.1).
 *   - Engine/ERS/gearbox are supplier parts — bank resets each season
 *     (docs/03 §5.5); detected by partType keywords, never assumed by id.
 *
 * Candidate columns below are CANDIDATE-level (see adaptive.ts header).
 */ __turbopack_context__.s([
    "getPartTypeLabels",
    ()=>getPartTypeLabels,
    "getPartsSnapshot",
    ()=>getPartsSnapshot,
    "isSupplierPartType",
    ()=>isSupplierPartType,
    "normalizeCondition",
    ()=>normalizeCondition,
    "resolvePartType",
    ()=>resolvePartType
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/adaptive.ts [app-client] (ecmascript)");
;
const DESIGNS_TABLE = 'Parts_Designs';
const STAT_VALUES_TABLE = 'Parts_Designs_StatValues';
const ITEMS_TABLE = 'Parts_Items';
const LOADOUT_TABLE = 'Parts_CarLoadout';
const EXPERTISE_TABLE = 'Parts_TeamExpertise';
const DESIGN_CANDIDATES = {
    designId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pkCandidates"])(DESIGNS_TABLE),
    teamId: [
        'TeamID'
    ],
    partType: [
        'PartType',
        'PartTypeID',
        'PartCategory',
        'Type'
    ],
    name: [
        'Name',
        'DesignName'
    ],
    status: [
        'Status',
        'DesignStatus',
        'State'
    ],
    points: [
        'Points',
        'DesignPoints',
        'StatPoints',
        'ResearchPoints',
        'CDBPoints'
    ],
    cost: [
        'Cost',
        'DesignCost',
        'CostCredits',
        'Price'
    ],
    buildDays: [
        'BuildDays',
        'Days',
        'BuildTime',
        'DurationDays'
    ]
};
const STAT_VALUE_CANDIDATES = {
    designId: [
        `${DESIGNS_TABLE}ID`,
        'DesignID',
        'Parts_DesignID',
        'ParentID'
    ],
    stat: [
        'Stat',
        'StatName',
        'Name',
        'StatType',
        'Attribute'
    ],
    value: [
        'Value',
        'StatValue',
        'Amount'
    ]
};
const ITEM_CANDIDATES = {
    itemId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pkCandidates"])(ITEMS_TABLE),
    designId: [
        `${DESIGNS_TABLE}ID`,
        'DesignID',
        'Parts_DesignID'
    ],
    carId: [
        'CarID'
    ],
    teamId: [
        'TeamID'
    ],
    partType: [
        'PartType',
        'PartTypeID',
        'Type'
    ],
    condition: [
        'Condition',
        'ConditionPercent',
        'Wear',
        'Health'
    ],
    faultCount: [
        'FaultCount',
        'Faults',
        'FaultsCount'
    ]
};
const LOADOUT_CANDIDATES = {
    carId: [
        'CarID'
    ],
    itemId: [
        `${ITEMS_TABLE}ID`,
        'ItemID',
        'Parts_ItemID'
    ],
    slot: [
        'SlotType',
        'PartType',
        'Type',
        'Slot'
    ]
};
const EXPERTISE_CANDIDATES = {
    teamId: [
        'TeamID'
    ],
    partType: [
        'PartType',
        'PartTypeID',
        'Type'
    ],
    expertise: [
        'Expertise',
        'CurrentExpertise'
    ],
    nextSeasonExpertise: [
        'NextSeasonExpertise'
    ]
};
function normalizeCondition(raw) {
    if (raw == null) return undefined;
    if (raw >= 0 && raw <= 1) return raw;
    if (raw > 1 && raw <= 100) return raw / 100;
    return undefined; // unknown scale — do not guess
}
function getPartsSnapshot(db) {
    /* PartType value → label from the save's own enum table (0.4.1). */ const typeLabels = getPartTypeLabels(db);
    /* stat values first — designs need them attached */ const sv = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, STAT_VALUES_TABLE);
    const svMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(sv.columns, STAT_VALUE_CANDIDATES);
    const svByDesign = new Map();
    if (sv.present && svMap.designId && svMap.value) {
        const dIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(sv.columns, svMap.designId);
        const sIdx = svMap.stat ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(sv.columns, svMap.stat) : -1;
        const vIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(sv.columns, svMap.value);
        for (const row of sv.rows){
            const designId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, dIdx);
            const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, vIdx);
            if (designId == null || value == null) continue;
            const name = sIdx >= 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStr"])(row, sIdx) ?? `stat${sIdx}` : `stat${sIdx}`;
            const list = svByDesign.get(designId) ?? [];
            list.push({
                name,
                value
            });
            svByDesign.set(designId, list);
        }
    }
    const dsg = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, DESIGNS_TABLE);
    const dMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(dsg.columns, DESIGN_CANDIDATES);
    const designs = dsg.present ? dsg.rows.flatMap((row)=>{
        const idIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(dsg.columns, dMap.designId);
        const designId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, idIdx);
        if (designId == null) return [];
        return [
            {
                designId,
                teamId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(dsg.columns, dMap.teamId)),
                partType: dMap.partType ? resolvePartType((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNumOrStr"])(row, dsg.columns, dMap, 'partType'), typeLabels) : undefined,
                name: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStr"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(dsg.columns, dMap.name)),
                status: dMap.status ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNumOrStr"])(row, dsg.columns, dMap, 'status') : undefined,
                points: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(dsg.columns, dMap.points)),
                cost: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(dsg.columns, dMap.cost)),
                buildDays: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(dsg.columns, dMap.buildDays)),
                stats: svByDesign.get(designId) ?? []
            }
        ];
    }) : [];
    const itm = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, ITEMS_TABLE);
    const iMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(itm.columns, ITEM_CANDIDATES);
    const items = itm.present ? itm.rows.flatMap((row)=>{
        const idIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(itm.columns, iMap.itemId);
        const itemId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, idIdx);
        if (itemId == null) return [];
        return [
            {
                itemId,
                designId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(itm.columns, iMap.designId)),
                carId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(itm.columns, iMap.carId)),
                teamId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(itm.columns, iMap.teamId)),
                partType: iMap.partType ? resolvePartType((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNumOrStr"])(row, itm.columns, iMap, 'partType'), typeLabels) : undefined,
                condition: normalizeCondition((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(itm.columns, iMap.condition))),
                faultCount: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(itm.columns, iMap.faultCount))
            }
        ];
    }) : [];
    const lod = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, LOADOUT_TABLE);
    const lMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(lod.columns, LOADOUT_CANDIDATES);
    const loadouts = lod.present ? lod.rows.flatMap((row)=>{
        const carId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(lod.columns, lMap.carId));
        if (carId == null) return [];
        return [
            {
                carId,
                itemId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(lod.columns, lMap.itemId)),
                slot: lMap.slot ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNumOrStr"])(row, lod.columns, lMap, 'slot') : undefined
            }
        ];
    }) : [];
    const exp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, EXPERTISE_TABLE);
    const eMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(exp.columns, EXPERTISE_CANDIDATES);
    const expertise = exp.present ? exp.rows.flatMap((row)=>{
        const teamId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(exp.columns, eMap.teamId));
        if (teamId == null) return [];
        return [
            {
                teamId,
                partType: eMap.partType ? resolvePartType((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNumOrStr"])(row, exp.columns, eMap, 'partType'), typeLabels) : undefined,
                expertise: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(exp.columns, eMap.expertise)),
                nextSeasonExpertise: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(exp.columns, eMap.nextSeasonExpertise))
            }
        ];
    }) : [];
    return {
        designs,
        items,
        loadouts,
        expertise,
        tablesPresent: {
            designs: dsg.present,
            items: itm.present,
            statValues: sv.present,
            loadouts: lod.present,
            expertise: exp.present
        }
    };
}
function isSupplierPartType(partType) {
    if (!partType) return false;
    return /engine|ers|gearbox|powertrain|energystore/i.test(partType);
}
function getPartTypeLabels(db) {
    const enumTable = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, 'Parts_Enum_Type');
    const labels = new Map();
    if (!enumTable.present) return labels;
    const vIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(enumTable.columns, 'Value');
    const nIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(enumTable.columns, 'Name');
    if (vIdx < 0 || nIdx < 0) return labels;
    for (const row of enumTable.rows){
        const value = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, vIdx);
        const name = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStr"])(row, nIdx);
        if (value != null && name != null && !labels.has(value)) labels.set(value, name);
    }
    return labels;
}
function resolvePartType(raw, labels) {
    if (raw == null) return undefined;
    if (/^\d+$/.test(raw)) {
        return labels.get(Number(raw)) ?? `PartType ${raw}`;
    }
    return raw;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/finance.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Finance repository — schema-adaptive (Phase 2).
 *
 * Tables (docs/01 A1): Finance_TeamBalance, Finance_Transactions.
 * No column for either table has been introspected yet — all candidates.
 * Amounts stay in game units (model contract: money = number, format at UI).
 */ __turbopack_context__.s([
    "getFinanceSnapshot",
    ()=>getFinanceSnapshot
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/adaptive.ts [app-client] (ecmascript)");
;
const BALANCE_TABLE = 'Finance_TeamBalance';
const TRANSACTIONS_TABLE = 'Finance_Transactions';
const BALANCE_CANDIDATES = {
    teamId: [
        'TeamID'
    ],
    day: [
        'Day',
        'BalanceDay'
    ],
    balance: [
        'Balance',
        'Amount',
        'Value',
        'Credits',
        'CurrentBalance',
        'Money'
    ],
    budget: [
        'Budget',
        'SeasonBudget',
        'BudgetCap',
        'CostCap'
    ]
};
const TX_CANDIDATES = {
    txId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pkCandidates"])(TRANSACTIONS_TABLE),
    teamId: [
        'TeamID'
    ],
    day: [
        'Day',
        'TransactionDay',
        'Date'
    ],
    amount: [
        'Amount',
        'Value',
        'Cost',
        'Money',
        'Delta'
    ],
    category: [
        'TransactionType',
        'Category',
        'Type',
        'Reason'
    ],
    note: [
        'Description',
        'Note',
        'Details',
        'Label'
    ]
};
function getFinanceSnapshot(db) {
    /* TransactionType value → label from the save's own enum table (0.4.1) —
   * same pattern as Parts_Enum_Type; raw transactions store numeric types. */ const typeLabels = new Map();
    const txEnum = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, 'Finance_Enum_TransactionType');
    if (txEnum.present) {
        const vIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(txEnum.columns, 'TransactionType');
        const nIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(txEnum.columns, 'Name');
        if (vIdx >= 0 && nIdx >= 0) {
            for (const row of txEnum.rows){
                const v = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, vIdx);
                const n = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStr"])(row, nIdx);
                if (v != null && n != null && !typeLabels.has(v)) typeLabels.set(v, n);
            }
        }
    }
    const resolveCategory = (raw)=>{
        if (raw == null) return undefined;
        if (/^\d+$/.test(raw)) return typeLabels.get(Number(raw)) ?? `Type ${raw}`;
        return raw;
    };
    const bal = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, BALANCE_TABLE);
    const bMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(bal.columns, BALANCE_CANDIDATES);
    const perTeam = new Map();
    if (bal.present && bMap.teamId) {
        const tIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(bal.columns, bMap.teamId);
        const dIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(bal.columns, bMap.day);
        const bIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(bal.columns, bMap.balance);
        const gIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(bal.columns, bMap.budget);
        for (const row of bal.rows){
            const teamId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, tIdx);
            if (teamId == null) continue;
            const day = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, dIdx);
            const cur = perTeam.get(teamId);
            // Latest row per team wins (largest Day; ties keep the last seen).
            if (!cur || day != null && (cur.day == null || day >= cur.day)) {
                perTeam.set(teamId, {
                    teamId,
                    day,
                    balance: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, bIdx),
                    budget: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, gIdx)
                });
            }
        }
    }
    const tx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, TRANSACTIONS_TABLE);
    const tMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(tx.columns, TX_CANDIDATES);
    const txIdIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tx.columns, tMap.txId);
    const transactions = tx.present ? tx.rows.flatMap((row, i)=>{
        // 0.4.1 bug fix (verified 1.11.0): Finance_Transactions has NO
        // primary-key column at all — the old `txId == null → skip` dropped
        // EVERY row. Fall back to the row position as a stable local id
        // (ordering/reference only; the save itself has no id to preserve).
        const txId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, txIdIdx) ?? (txIdIdx < 0 ? i : null);
        if (txId == null) return [];
        return [
            {
                txId,
                teamId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tx.columns, tMap.teamId)),
                day: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tx.columns, tMap.day)),
                amount: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tx.columns, tMap.amount)),
                category: tMap.category ? resolveCategory((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStr"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tx.columns, tMap.category))) : undefined,
                note: tMap.note ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStr"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(tx.columns, tMap.note)) : undefined
            }
        ];
    }) : [];
    return {
        latestBalance: [
            ...perTeam.values()
        ],
        transactions,
        tablesPresent: {
            balance: bal.present,
            transactions: tx.present
        }
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/staff-detail.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Staff detail repository — schema-adaptive (Phase 2).
 *
 * Tables (docs/01 A1): Staff_Contracts, Staff_PerformanceStats,
 * Staff_ContractPatience. DriverCode already handled in drivers.repo.
 *
 * Verified facts from the planning docs:
 *   - `Staff_Contracts.ContractType = 0` = driver contract (docs/01 §4.2).
 *   - `Staff_ContractPatience` carries suitability/opinion/acceptance
 *     threshold (0..1) — lower threshold = easier to sign (docs/03 §5.7).
 */ __turbopack_context__.s([
    "getStaffDetail",
    ()=>getStaffDetail
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/adaptive.ts [app-client] (ecmascript)");
;
const CONTRACTS_TABLE = 'Staff_Contracts';
const PERFORMANCE_TABLE = 'Staff_PerformanceStats';
const PATIENCE_TABLE = 'Staff_ContractPatience';
const CONTRACT_CANDIDATES = {
    staffId: [
        'StaffID'
    ],
    teamId: [
        'TeamID'
    ],
    contractType: [
        'ContractType'
    ],
    salary: [
        'Salary',
        'WeeklySalary',
        'Cost',
        'Wage',
        'Pay'
    ],
    endDay: [
        'EndDay',
        'ContractEndDay',
        'ExpiryDay',
        'EndDate',
        'End'
    ],
    durationDays: [
        'Duration',
        'DurationDays',
        'Length',
        'Years'
    ],
    // Phase 3 (Gazette transfers): verified F1M24 columns StartDay/EndSeason.
    startDay: [
        'StartDay'
    ],
    endSeason: [
        'EndSeason'
    ]
};
const PERFORMANCE_CANDIDATES = {
    staffId: [
        'StaffID'
    ],
    rating: [
        'Rating',
        'OverallRating',
        'Overall'
    ],
    morale: [
        'Morale',
        'MoraleLevel'
    ]
};
const PATIENCE_CANDIDATES = {
    staffId: [
        'StaffID',
        'StaffID_1'
    ],
    // F1M24 (verified 1.11.0): one row per (StaffID, TeamID) — 11 teams.
    teamId: [
        'TeamID',
        'TeamID_1'
    ],
    suitability: [
        'Suitability',
        'SuitabilityRating'
    ],
    opinion: [
        'Opinion',
        'OpinionRating',
        'TeamOpinionRating'
    ],
    threshold: [
        'Threshold',
        'ContractAcceptanceThreshold',
        'AcceptanceThreshold',
        'Patience',
        'PatienceThreshold'
    ]
};
function getStaffDetail(db) {
    const con = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, CONTRACTS_TABLE);
    const cMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(con.columns, CONTRACT_CANDIDATES);
    const contracts = con.present ? con.rows.flatMap((row)=>{
        const staffId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(con.columns, cMap.staffId));
        if (staffId == null) return [];
        return [
            {
                staffId,
                teamId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(con.columns, cMap.teamId)),
                contractType: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(con.columns, cMap.contractType)),
                salary: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(con.columns, cMap.salary)),
                endDay: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(con.columns, cMap.endDay)),
                durationDays: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(con.columns, cMap.durationDays)),
                startDay: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(con.columns, cMap.startDay)),
                endSeason: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(con.columns, cMap.endSeason))
            }
        ];
    }) : [];
    const perf = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, PERFORMANCE_TABLE);
    const pMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(perf.columns, PERFORMANCE_CANDIDATES);
    const performance = perf.present ? perf.rows.flatMap((row)=>{
        const staffId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(perf.columns, pMap.staffId));
        if (staffId == null) return [];
        return [
            {
                staffId,
                rating: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(perf.columns, pMap.rating)),
                morale: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(perf.columns, pMap.morale))
            }
        ];
    }) : [];
    const pat = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, PATIENCE_TABLE);
    const aMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(pat.columns, PATIENCE_CANDIDATES);
    const patience = pat.present ? pat.rows.flatMap((row)=>{
        const staffId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(pat.columns, aMap.staffId));
        if (staffId == null) return [];
        return [
            {
                staffId,
                teamId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(pat.columns, aMap.teamId)),
                suitability: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(pat.columns, aMap.suitability)),
                opinion: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(pat.columns, aMap.opinion)),
                threshold: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(pat.columns, aMap.threshold))
            }
        ];
    }) : [];
    return {
        contracts,
        performance,
        patience,
        tablesPresent: {
            contracts: con.present,
            performance: perf.present,
            patience: pat.present
        }
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/repositories/regulations.repo.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Regulations repository — schema-adaptive (Phase 2).
 *
 * Tables (docs/01 A1): Regulations_Proposals, Regulations_TeamVotes,
 * Regulations_ChangeGroups, Regulations_Proposals_ChangeGroups.
 * Vote encoding is NOT verified — engines treat 1 as YES and surface the
 * raw tally with an explicit note instead of inventing semantics.
 */ __turbopack_context__.s([
    "getRegulations",
    ()=>getRegulations
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/adaptive.ts [app-client] (ecmascript)");
;
const PROPOSALS_TABLE = 'Regulations_Proposals';
const VOTES_TABLE = 'Regulations_TeamVotes';
const GROUPS_TABLE = 'Regulations_ChangeGroups';
const PROPOSAL_GROUPS_TABLE = 'Regulations_Proposals_ChangeGroups';
const PROPOSAL_CANDIDATES = {
    proposalId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pkCandidates"])(PROPOSALS_TABLE),
    seasonId: [
        'SeasonID'
    ],
    state: [
        'State',
        'ProposalState',
        'Status'
    ],
    title: [
        'Title',
        'Name',
        'Description'
    ]
};
const VOTE_CANDIDATES = {
    proposalId: [
        `${PROPOSALS_TABLE}ID`,
        'ProposalID'
    ],
    teamId: [
        'TeamID'
    ],
    vote: [
        'Vote',
        'Approved',
        'Decision',
        'Support'
    ]
};
const GROUP_CANDIDATES = {
    groupId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["pkCandidates"])(GROUPS_TABLE),
    label: [
        'Name',
        'Title',
        'Description',
        'LocKey',
        'Label'
    ]
};
const PROPOSAL_GROUP_CANDIDATES = {
    proposalId: [
        `${PROPOSALS_TABLE}ID`,
        'ProposalID'
    ],
    groupId: [
        `${GROUPS_TABLE}ID`,
        'ChangeGroupID',
        'GroupID'
    ]
};
function getRegulations(db) {
    const prop = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, PROPOSALS_TABLE);
    const pMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(prop.columns, PROPOSAL_CANDIDATES);
    const votes = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, VOTES_TABLE);
    const vMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(votes.columns, VOTE_CANDIDATES);
    const votesByProposal = new Map();
    if (votes.present && vMap.proposalId && vMap.teamId) {
        const pIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(votes.columns, vMap.proposalId);
        const tIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(votes.columns, vMap.teamId);
        const voteIdx = vMap.vote ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(votes.columns, vMap.vote) : -1;
        for (const row of votes.rows){
            const proposalId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, pIdx);
            const teamId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, tIdx);
            if (proposalId == null || teamId == null) continue;
            const list = votesByProposal.get(proposalId) ?? [];
            list.push({
                teamId,
                vote: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, voteIdx)
            });
            votesByProposal.set(proposalId, list);
        }
    }
    const groups = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, GROUPS_TABLE);
    const gMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(groups.columns, GROUP_CANDIDATES);
    const labelByGroup = new Map();
    if (groups.present && gMap.groupId) {
        const gIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(groups.columns, gMap.groupId);
        const lIdx = gMap.label ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(groups.columns, gMap.label) : -1;
        for (const row of groups.rows){
            const groupId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, gIdx);
            if (groupId == null) continue;
            labelByGroup.set(groupId, lIdx >= 0 ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStr"])(row, lIdx) : undefined);
        }
    }
    const propGroups = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readTable"])(db, PROPOSAL_GROUPS_TABLE);
    const pgMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildColumnMap"])(propGroups.columns, PROPOSAL_GROUP_CANDIDATES);
    const groupsByProposal = new Map();
    if (propGroups.present && pgMap.proposalId && pgMap.groupId) {
        const pIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(propGroups.columns, pgMap.proposalId);
        const gIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(propGroups.columns, pgMap.groupId);
        for (const row of propGroups.rows){
            const proposalId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, pIdx);
            const groupId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, gIdx);
            if (proposalId == null || groupId == null) continue;
            const list = groupsByProposal.get(proposalId) ?? [];
            list.push(groupId);
            groupsByProposal.set(proposalId, list);
        }
    }
    const proposals = prop.present ? prop.rows.flatMap((row)=>{
        const idIdx = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(prop.columns, pMap.proposalId);
        const proposalId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, idIdx);
        if (proposalId == null) return [];
        const changes = (groupsByProposal.get(proposalId) ?? []).map((groupId)=>({
                groupId,
                label: labelByGroup.get(groupId)
            }));
        return [
            {
                proposalId,
                seasonId: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(prop.columns, pMap.seasonId)),
                state: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readNum"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(prop.columns, pMap.state)),
                title: pMap.title ? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["readStr"])(row, (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$adaptive$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["colIndex"])(prop.columns, pMap.title)) : undefined,
                votes: votesByProposal.get(proposalId) ?? [],
                changes
            }
        ];
    }) : [];
    return {
        proposals,
        tablesPresent: {
            proposals: prop.present,
            votes: votes.present,
            changeGroups: groups.present
        }
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/normalize/compute-standings.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
 */ __turbopack_context__.s([
    "computeStandings",
    ()=>computeStandings
]);
function computeStandings(races, seasonId) {
    const driverAgg = new Map();
    const teamAgg = new Map();
    for (const race of races){
        if (race.seasonId !== seasonId) continue;
        for (const res of race.results){
            const d = driverAgg.get(res.driverId) ?? {
                points: 0,
                wins: 0,
                podiums: 0,
                name: res.driverName,
                teamId: res.teamId
            };
            d.points += res.points;
            d.name = res.driverName;
            d.teamId = res.teamId;
            if (!res.dnf && res.finishingPos === 1) d.wins += 1;
            if (!res.dnf && res.finishingPos > 0 && res.finishingPos <= 3) d.podiums += 1;
            driverAgg.set(res.driverId, d);
            const t = teamAgg.get(res.teamId) ?? {
                points: 0,
                wins: 0,
                podiums: 0,
                name: res.teamName
            };
            t.points += res.points;
            t.name = res.teamName;
            if (!res.dnf && res.finishingPos === 1) t.wins += 1;
            teamAgg.set(res.teamId, t);
        }
    }
    const rank = (map, nameOf, teamIdOf)=>Array.from(map.entries()).map(([id, agg])=>({
                id,
                ...agg
            })).sort((a, b)=>b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.id - b.id).map((row, i)=>({
                position: i + 1,
                id: row.id,
                name: nameOf(row.id),
                teamId: teamIdOf(row.id),
                points: row.points
            }));
    return {
        drivers: rank(driverAgg, (id)=>driverAgg.get(id)?.name ?? `Driver ${id}`, (id)=>driverAgg.get(id)?.teamId),
        teams: rank(teamAgg, (id)=>teamAgg.get(id)?.name ?? `Team ${id}`, ()=>undefined)
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/normalize/build-model.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Normalize: raw repository rows → SaveModel v0. Phase 0.
 *
 * Rules (docs/01-AUDIT-DATA.md §4.1):
 *   - UI never sees SQL; it only gets this model.
 *   - Missing optional tables → warnings + degraded availability, no throw.
 *   - Missing CORE tables → SaveParseError(MISSING_CORE_TABLES) upstream.
 *   - No races completed → warning NO_COMPLETED_RACES, not fatal.
 */ __turbopack_context__.s([
    "STAFF_NAME_DISPLAY_PATCHES",
    ()=>STAFF_NAME_DISPLAY_PATCHES,
    "buildSaveModel",
    ()=>buildSaveModel,
    "cleanStaffName",
    ()=>cleanStaffName,
    "removeTrailingDigit",
    ()=>removeTrailingDigit
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/schema.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$player$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/player.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$teams$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/teams.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$races$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/races.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$drivers$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/drivers.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$practice$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/practice.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$pitstops$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/pitstops.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$tyres$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/tyres.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$quali$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/quali.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$parts$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/parts.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$finance$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/finance.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$staff$2d$detail$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/staff-detail.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$regulations$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/repositories/regulations.repo.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$normalize$2f$compute$2d$standings$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/normalize/compute-standings.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/errors.ts [app-client] (ecmascript)");
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
function buildSaveModel(input) {
    const { db, binaryMeta, schema, saveId, fileName, fileSizeBytes } = input;
    const player = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$player$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getPlayer"])(db);
    if (!player) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MISSING_CORE_TABLES, 'Player row missing — save is not a career save the Pit Wall can read');
    }
    const playerState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$player$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getPlayerState"])(db);
    const warnings = [];
    const races = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$races$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRaces"])(db);
    const results = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$races$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRaceResults"])(db);
    const teams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$teams$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getTeams"])(db);
    const completed = races.filter((r)=>r.state === 2).length;
    if (completed === 0) {
        warnings.push('NO_COMPLETED_RACES');
    }
    const teamById = new Map(teams.map((t)=>[
            t.teamId,
            t
        ]));
    const playerTeam = teamById.get(player.teamId);
    const teamName = playerTeam?.teamName ?? `Team ${player.teamId}`;
    const currentSeason = playerState?.currentSeason ?? races.at(-1)?.seasonId ?? 0;
    const raceModels = races.map((r)=>({
            raceId: r.raceId,
            seasonId: r.seasonId,
            trackId: r.trackId,
            trackName: r.trackName ?? `Track ${r.trackId}`,
            day: r.day,
            state: r.state,
            isSprint: r.weekendType !== 0,
            laps: r.laps,
            weather: r.temperatureRace !== 0 || r.rainRace !== 0 || r.rainPractice === 1 || r.rainQualifying === 1 ? {
                raceTempC: r.temperatureRace,
                raceRain: r.rainRace === 1,
                practiceRain: r.rainPractice === 1,
                qualifyingRain: r.rainQualifying === 1
            } : undefined,
            results: [],
            /* Phase 3 — track facts for the Gazette preview + trivia. */ trackLengthKm: r.trackLengthKm,
            trackType: r.trackType,
            trackFirstRaceYear: r.trackFirstRaceYear,
            trackFastestLapMs: r.trackFastestLapMs,
            trackFastestLapDriverId: r.trackFastestLapDriverId,
            trackFastestLapYear: r.trackFastestLapYear
        }));
    const raceById = new Map(raceModels.map((r)=>[
            r.raceId,
            r
        ]));
    for (const res of results){
        const race = raceById.get(res.raceId);
        if (!race) continue;
        race.results.push({
            driverId: res.driverId,
            driverName: '',
            teamId: res.teamId,
            teamName: teamById.get(res.teamId)?.teamName ?? `Team ${res.teamId}`,
            finishingPos: res.finishingPos,
            startingPos: res.startingPos,
            points: res.points,
            dnf: res.dnf === 1,
            laps: res.laps,
            fastestLapMs: res.fastestLap,
            /* Phase 3 — Gazette gap + aggregates (SC/VSC repeat per row). */ totalTimeMs: res.totalTimeMs,
            overtakes: res.overtakes,
            safetyCarDeployments: res.safetyCarDeployments,
            vscDeployments: res.vscDeployments
        });
    }
    // Drivers (Staff join) — names replace placeholders in race results.
    const driversRaw = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$drivers$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getDrivers"])(db);
    const driverById = new Map(driversRaw.map((d)=>[
            d.staffId,
            d
        ]));
    const driverName = (id)=>{
        const d = driverById.get(id);
        const name = d ? `${cleanStaffName(d.firstName)} ${cleanStaffName(d.lastName)}`.trim() : '';
        return name.length > 0 ? name : `Driver ${id}`;
    };
    for (const race of raceModels){
        for (const res of race.results){
            res.driverName = driverName(res.driverId);
        }
    }
    // Pit stops — group timing rows per physical stop (oracle: MIN lap,
    // SUM duration across rows of the same PitStopID).
    const pitTimings = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$pitstops$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getPitTimings"])(db);
    const stopKey = (raceId, driverId, pitStopId)=>`${raceId}:${driverId}:${pitStopId}`;
    const stopsAgg = new Map();
    for (const t of pitTimings){
        const key = stopKey(t.raceId, t.driverId, t.pitStopId);
        const agg = stopsAgg.get(key);
        if (agg) {
            agg.lap = Math.min(agg.lap, t.lap);
            agg.durationMs += t.durationMs;
        } else {
            stopsAgg.set(key, {
                raceId: t.raceId,
                driverId: t.driverId,
                teamId: t.teamId,
                lap: t.lap,
                durationMs: t.durationMs,
                pitStopId: t.pitStopId
            });
        }
    }
    for (const stop of stopsAgg.values()){
        const race = raceById.get(stop.raceId);
        if (!race) continue;
        race.pitStops ??= [];
        race.pitStops.push({
            driverId: stop.driverId,
            teamId: stop.teamId,
            lap: stop.lap,
            durationMs: stop.durationMs,
            pitStopId: stop.pitStopId
        });
    }
    for (const race of raceModels){
        if (race.pitStops) race.pitStops.sort((a, b)=>a.lap - b.lap);
    }
    // Practice — flattened rows per race (engine aggregates per compound).
    for (const p of (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$practice$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getPracticeResults"])(db)){
        const race = raceById.get(p.raceId);
        if (!race) continue;
        race.practice ??= [];
        race.practice.push({
            driverId: p.driverId,
            teamId: p.teamId,
            session: p.session,
            bestLapMs: p.bestLapMs,
            bestLapTyre: p.bestLapTyre
        });
    }
    // Qualifying — keep the LAST stage per driver per race (oracle:
    // QualifyingStage = MAX(...) is the final classification).
    const qualiRows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$quali$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getQualifyingResults"])(db);
    const qualiKey = (raceId, driverId)=>`${raceId}:${driverId}`;
    const qualiFinal = new Map();
    for (const q of qualiRows){
        const key = qualiKey(q.raceId, q.driverId);
        const cur = qualiFinal.get(key);
        if (!cur || (q.qualifyingStage ?? 0) >= (cur.qualifyingStage ?? 0)) {
            qualiFinal.set(key, q);
        }
    }
    for (const q of qualiFinal.values()){
        const race = raceById.get(q.raceId);
        if (!race) continue;
        race.qualifying ??= [];
        const entry = {
            driverId: q.driverId,
            driverName: driverName(q.driverId),
            teamId: q.teamId,
            finishingPos: q.finishingPos,
            championshipPoints: q.championshipPoints
        };
        race.qualifying.push(entry);
    }
    for (const race of raceModels){
        if (race.qualifying) race.qualifying.sort((a, b)=>a.finishingPos - b.finishingPos);
    }
    /* ── Phase 2 sections — schema-adaptive, each isolated (never throws) ── */ const phase2Warnings = [];
    const safe = (table, fn, fallback)=>{
        try {
            return fn();
        } catch (err) {
            phase2Warnings.push(`REPO_FAILED:${table}:${err instanceof Error ? err.message : 'unknown'}`);
            return fallback;
        }
    };
    const partsModel = safe('Parts_*', ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$parts$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getPartsSnapshot"])(db), {
        designs: [],
        items: [],
        loadouts: [],
        expertise: [],
        tablesPresent: {
            designs: false,
            items: false,
            statValues: false,
            loadouts: false,
            expertise: false
        }
    });
    const financeModel = safe('Finance_*', ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$finance$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getFinanceSnapshot"])(db), {
        latestBalance: [],
        transactions: [],
        tablesPresent: {
            balance: false,
            transactions: false
        }
    });
    const staffDetail = safe('Staff_*', ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$staff$2d$detail$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getStaffDetail"])(db), {
        contracts: [],
        performance: [],
        patience: [],
        tablesPresent: {
            contracts: false,
            performance: false,
            patience: false
        }
    });
    const regulationsModel = safe('Regulations_*', ()=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$regulations$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getRegulations"])(db), {
        proposals: [],
        tablesPresent: {
            proposals: false,
            votes: false,
            changeGroups: false
        }
    });
    const playerFinance = financeModel.latestBalance.find((b)=>b.teamId === player.teamId);
    const meta = {
        id: saveId,
        fileName,
        fileSizeBytes,
        gameVersion: toGameVersion(binaryMeta.gameVersion),
        saveGameVersion: binaryMeta.saveGameVersion,
        engineVersion: binaryMeta.engineVersion,
        gameVersionWithBuild: binaryMeta.gameVersionWithBuild,
        saveGameClassName: binaryMeta.saveGameClassName,
        parsedAt: new Date().toISOString(),
        seasonId: currentSeason,
        day: playerState?.day ?? 0,
        playerTeamId: player.teamId,
        tablesPresent: schema.tablesPresent,
        tablesMissing: schema.tablesMissingOptional,
        warnings: [
            ...warnings,
            ...phase2Warnings
        ]
    };
    // Standings computed from results (formula verified 0-mismatch on a real
    // F1M24 save vs Races_DriverStandings — see compute-standings.ts).
    const standings = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$normalize$2f$compute$2d$standings$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["computeStandings"])(raceModels, currentSeason);
    // Tyre allocation — may be empty between weekends (verified: real save
    // has 0 rows post-race); engines must fall back to the model envelope.
    const tyreSets = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$repositories$2f$tyres$2e$repo$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["getTyreAllocations"])(db);
    return {
        meta,
        player: {
            teamId: player.teamId,
            teamName,
            managerName: `${player.firstName} ${player.lastName}`.trim() || undefined,
            customTeamEnabled: player.customTeamEnabled === 1
        },
        teams: teams.map((t)=>({
                teamId: t.teamId,
                teamName: t.teamName,
                isCustomTeam: t.isCustomTeam === 1,
                formula: t.formula
            })),
        drivers: driversRaw.map((d)=>({
                staffId: d.staffId,
                fullName: `${cleanStaffName(d.firstName)} ${cleanStaffName(d.lastName)}`.trim(),
                code: d.code,
                teamId: d.contractTeamId
            })),
        staff: [],
        seasons: [
            ...new Set(races.map((r)=>r.seasonId))
        ].map((seasonId)=>({
                seasonId
            })),
        races: raceModels,
        standings,
        tyres: tyreSets.map((t)=>({
                carId: t.carId,
                tyreSetId: t.tyreSetId,
                weekendTyreType: t.weekendTyreType,
                frontLeftWear: t.frontLeftWear,
                availabilityState: t.availabilityState,
                estimatedLapLifeRemaining: t.estimatedLapLifeRemaining
            })),
        parts: partsModel,
        regulations: regulationsModel.proposals,
        finance: {
            balance: playerFinance?.balance,
            budget: playerFinance?.budget,
            transactions: financeModel.transactions,
            tablesPresent: financeModel.tablesPresent
        },
        personnel: staffDetail,
        availability: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["OPTIONAL_TABLES"].map((t)=>({
                table: t,
                present: !schema.tablesMissingOptional.includes(t)
            }))
    };
}
function toGameVersion(v) {
    if (v === 'F1M22' || v === 'F1M23' || v === 'F1M24') return v;
    return 'UNKNOWN';
}
const STAFF_NAME_DISPLAY_PATCHES = {
    OWard: "O'Ward",
    DeLaRosa: 'de la Rosa',
    dosSantos: 'dos Santos',
    Barichello: 'Barrichello'
};
function cleanStaffName(raw) {
    const token = raw.trim();
    const m = token.match(/^\[([^\]]+)\]$/);
    if (!m) return token;
    const key = m[1];
    const PREFIXES = [
        'StaffName_Forename_Male_',
        'StaffName_Forename_Female_',
        'StaffName_Surname_'
    ];
    for (const p of PREFIXES){
        if (key.startsWith(p)) {
            const decoded = removeTrailingDigit(key.slice(p.length));
            return STAFF_NAME_DISPLAY_PATCHES[decoded] ?? decoded;
        }
    }
    // Unknown key shape — keep the tail segment, still readable.
    const tail = removeTrailingDigit(key.split('_').pop() ?? token);
    return STAFF_NAME_DISPLAY_PATCHES[tail] ?? tail;
}
function removeTrailingDigit(str) {
    return /\d$/.test(str) ? str.slice(0, -1) : str;
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/pipeline.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "runParsePipeline",
    ()=>runParsePipeline
]);
/**
 * Full parse pipeline — Phase 0. Runs inside the Web Worker only.
 *
 * .sav bytes → GVAS → zlib → SQLite → schema detect → repositories → model
 * (docs/01-AUDIT-DATA.md §4.2). Emits progress callbacks for the UI.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$parse$2d$save$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/parse-save.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$sqlite$2f$sqljs$2d$loader$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/sqlite/sqljs-loader.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/schema.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$normalize$2f$build$2d$model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/normalize/build-model.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/errors.ts [app-client] (ecmascript)");
;
;
;
;
;
async function runParsePipeline(bytes, options) {
    const { onProgress } = options;
    onProgress?.(5, 'gvas');
    const binary = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$parse$2d$save$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["parseF1ManagerSave"])(bytes);
    onProgress?.(40, 'inflate');
    let db;
    try {
        db = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$sqlite$2f$sqljs$2d$loader$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["openDatabase"])(binary.databaseFile, {
            locateFile: options.locateFile
        });
    } catch (err) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].DB_OPEN_FAILED, `sql.js failed to open database: ${err.message}`);
    }
    onProgress?.(60, 'sqlite');
    const schema = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["detectSchema"])(db);
    if (schema.tablesMissingCore.length > 0) {
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].MISSING_CORE_TABLES, `Missing core tables: ${schema.tablesMissingCore.join(', ')}`, JSON.stringify({
            expected: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$schema$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CORE_TABLES"],
            missing: schema.tablesMissingCore
        }));
    }
    onProgress?.(80, 'normalize');
    let model;
    try {
        model = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$normalize$2f$build$2d$model$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["buildSaveModel"])({
            db,
            binaryMeta: binary.metadata,
            schema,
            saveId: options.saveId,
            fileName: options.fileName,
            fileSizeBytes: options.fileSizeBytes
        });
    } catch (err) {
        if (err instanceof __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"]) throw err;
        throw new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SaveParseError"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$errors$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ParseErrorCode"].NORMALIZE_FAILED, `Failed to build SaveModel: ${err.message}`);
    }
    onProgress?.(100, 'done');
    return {
        model,
        binaryMeta: binary.metadata,
        tablesPresentCount: schema.tablesPresent.length
    };
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/parser/worker/parse.worker.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
/**
 * Parse Web Worker — Phase 0 (docs/02-ARCHITECTURE.md §3.3).
 *
 * Receives { id, file: ArrayBuffer, fileName } — the .sav NEVER leaves the
 * device: all parsing happens right here, in this worker, on the user's
 * machine. Posts { type:'progress' } updates and a final
 * { type:'done'|'error' } message.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$pipeline$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/parser/pipeline.ts [app-client] (ecmascript)");
;
self.onmessage = async (event)=>{
    const req = event.data;
    try {
        const bytes = new Uint8Array(req.file);
        const saveId = await sha256Hex(bytes);
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$parser$2f$pipeline$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["runParsePipeline"])(bytes, {
            fileName: req.fileName,
            fileSizeBytes: bytes.byteLength,
            saveId,
            onProgress: (percent, stage)=>{
                const msg = {
                    type: 'progress',
                    id: req.id,
                    percent,
                    stage
                };
                self.postMessage(msg);
            }
        });
        const done = {
            type: 'done',
            id: req.id,
            model: result.model
        };
        self.postMessage(done);
    } catch (err) {
        const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : 'PARSE_FAILED';
        const details = typeof err === 'object' && err !== null && 'details' in err ? err.details : undefined;
        const errorMsg = {
            type: 'error',
            id: req.id,
            code,
            message: err.message ?? 'Unknown parse failure',
            details
        };
        self.postMessage(errorMsg);
    }
};
async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b)=>b.toString(16).padStart(2, '0')).join('');
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_parser_5b96c007._.js.map