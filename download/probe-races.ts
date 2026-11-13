import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';
async function main() {
  const bytes = readFileSync('upload/autosave.sav');
  const { model } = await runParsePipeline(new Uint8Array(bytes), {
    fileName: 'autosave.sav', fileSizeBytes: bytes.byteLength, saveId: 'probe',
    locateFile: () => SQL_WASM,
  });
  const done = model.races.filter((r) => r.seasonId === model.meta.seasonId && r.state === 2);
  console.log('season', model.meta.seasonId, 'completed:', done.map((r) => `${r.raceId}:${r.trackName}`));
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
