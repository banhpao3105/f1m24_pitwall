import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';
async function main() {
  const bytes = readFileSync('upload/autosave.sav');
  const { model } = await runParsePipeline(new Uint8Array(bytes), {
    fileName: 'autosave.sav', fileSizeBytes: bytes.byteLength, saveId: 'probe',
    locateFile: () => SQL_WASM,
  });
  console.log('player.teamId:', model.player.teamId, 'teamName:', model.player.teamName);
  console.log('parts.designs:', model.parts.designs.length);
  console.log('parts.items:', model.parts.items.length);
  console.log('first 3 items:', JSON.stringify(model.parts.items.slice(0, 3)));
  const playerDesigns = model.parts.designs.filter((d) => d.teamId === model.player.teamId);
  console.log('player designs:', playerDesigns.length, 'sample:', JSON.stringify(playerDesigns.slice(0, 2)));
  const linked = model.parts.items.filter((it) => playerDesigns.some((d) => d.designId === it.designId));
  console.log('items linked to player designs:', linked.length);
  console.log('design teamIds:', [...new Set(model.parts.designs.map((d) => d.teamId))].sort((a,b)=>(a??0)-(b??0)));
  console.log('loadouts:', model.parts.loadouts.length, 'sample:', JSON.stringify(model.parts.loadouts.slice(0, 3)));
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
