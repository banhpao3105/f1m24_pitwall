/**
 * Oracle comparison harness — NOT committed to CI (uses the local, personal
 * autosave.sav). Compares the TypeScript port against the Python simulation
 * of the Gazette v2.2 oracle on the same real save.
 *
 * Run: bun scripts/oracle-compare.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase } from '../src/parser/sqlite/sqljs-loader';
import { detectSchema, listTables } from '../src/parser/schema';
import { deflate } from 'pako';

const SAVE_PATH = process.argv[2] ?? '/home/z/my-project/upload/autosave.sav';
const PY_DB_PATH = process.argv[3] ?? '/tmp/extracted.db';

async function main() {
  const raw = readFileSync(SAVE_PATH);
  console.log(`save: ${SAVE_PATH} (${raw.byteLength} bytes)`);

  const t0 = Date.now();
  const result = parseF1ManagerSave(raw);
  const parseMs = Date.now() - t0;

  console.log('metadata:', JSON.stringify(result.metadata, null, 2));
  console.log(`databaseFile: ${result.databaseFile.byteLength} bytes (parsed in ${parseMs}ms)`);

  const pyDb = readFileSync(PY_DB_PATH);
  const same = Buffer.from(result.databaseFile).equals(pyDb);
  console.log(`matches Python oracle extraction (${PY_DB_PATH}): ${same ? 'IDENTICAL' : 'MISMATCH'}`);

  // Schema introspection on the real save through the new parser.
  const db = await openDatabase(result.databaseFile, {
    locateFile: () => '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm',
  });
  const tables = listTables(db);
  console.log(`tables+views in real save: ${tables.length}`);

  const schema = detectSchema(db);
  console.log('missing core:', schema.tablesMissingCore);
  console.log('missing optional:', schema.tablesMissingOptional);

  // Round-trip re-deflate sanity (pipeline path uses pako inflate — already exercised).
  const recompressed = deflate(result.databaseFile).length;
  console.log(`re-deflate size sanity: ${recompressed} bytes`);

  writeFileSync('/tmp/ts-extracted.db', result.databaseFile);
  console.log('ts-extracted.db written to /tmp for diffing');
}

main().catch((err) => {
  console.error('ORACLE COMPARISON FAILED:', err);
  process.exit(1);
});
