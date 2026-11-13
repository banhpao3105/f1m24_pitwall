/**
 * Real-save verification for the 0.4.1 bug fixes (NOT committed — local
 * harness). Prints aggregates only, no personal data beyond game roster.
 */
import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
import { buildPaceBoard } from '../src/engines/pace.engine';
import { buildPersonnel } from '../src/engines/personnel.engine';
import { buildFinance } from '../src/engines/finance.engine';
import { buildCarLab } from '../src/engines/car.engine';
import { trackDisplay } from '../src/lib/track-display';

const SAVE = process.argv[2] ?? 'upload/autosave.sav';
const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

async function main() {
  const bytes = readFileSync(SAVE);
  const { model } = await runParsePipeline(new Uint8Array(bytes), {
    fileName: SAVE,
    fileSizeBytes: bytes.byteLength,
    saveId: 'verify-bugfix',
    locateFile: () => SQL_WASM,
  });

  console.log('== BUG 1: pace rivalRef ==');
  const pace = buildPaceBoard(model);
  console.log('playerVsRivalS:', pace.data.playerVsRivalS);
  console.log('rivalRef:', pace.data.rivalRef?.teamName);
  console.log('rivals[0] (old wrong label):', pace.data.rivals[0]?.teamName);
  console.log('rec title:', pace.recommendations[0]?.title);

  console.log('\n== BUG 2a: personnel dedupe + patience ==');
  const pers = buildPersonnel(model);
  const ids = pers.data.contracts.map((c) => c.staffId);
  console.log('contracts:', ids.length, 'unique:', new Set(ids).size);
  console.log(
    'patience rows:',
    pers.data.patience.length,
    'with threshold:',
    pers.data.patience.filter((p) => p.threshold != null).length,
  );
  console.log('patience sample:', JSON.stringify(pers.data.patience.slice(0, 3)));

  console.log('\n== BUG 2b: finance expertise wording ==');
  const fin = buildFinance(model);
  const expRec = fin.recommendations.find((r) => r.id === 'finance-expertise-bank');
  console.log('playerNext:', fin.data.expertise.playerNext, 'median:', fin.data.expertise.leagueMedianNext);
  console.log('action:', expRec?.action);
  console.log('risk:', expRec?.riskIfIgnored);

  console.log('\n== Car Lab rec ==');
  const car = buildCarLab(model);
  console.log('parts groups:', car.data.parts.length, 'queue:', car.data.devQueue.length);
  console.log('recs:', car.recommendations.map((r) => r.id));
  console.log('healthy why:', car.recommendations.find((r) => r.id === 'car-parts-healthy')?.why);

  console.log("\n== O'Ward name ==");
  const oward = model.drivers.find((d) => d.fullName.includes('Ward'));
  console.log('driver:', oward?.fullName);

  console.log('\n== track names via UI map (spot check) ==');
  const names = [...new Set(model.races.slice(0, 6).map((r) => r.trackName))];
  for (const n of names) console.log(n, '→', trackDisplay(n, 'vi'), '/', trackDisplay(n, 'en'));
}

main().catch((e) => {
  console.error('VERIFY FAILED:', e);
  process.exit(1);
});
