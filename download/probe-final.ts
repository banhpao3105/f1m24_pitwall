import { readFileSync } from 'node:fs';
import { runParsePipeline } from '../src/parser/pipeline';
import { buildFinance } from '../src/engines/finance.engine';
import { buildRegulations } from '../src/engines/regulation.engine';
import { buildCarLab } from '../src/engines/car.engine';
const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';
async function main() {
  const bytes = readFileSync('upload/autosave.sav');
  const { model } = await runParsePipeline(new Uint8Array(bytes), {
    fileName: 'autosave.sav', fileSizeBytes: bytes.byteLength, saveId: 'probe',
    locateFile: () => SQL_WASM,
  });
  const fin = buildFinance(model);
  console.log('hasBalance:', fin.data.hasBalance, 'hasTransactions:', fin.data.hasTransactions);
  console.log('balance:', fin.data.balance, 'totalSpend:', fin.data.totalSpend, 'costPerPoint:', fin.data.costPerPoint);
  console.log('categories:', fin.data.spendByCategory.slice(0, 4).map((s) => `${s.category}=${s.total}`));
  const regs = buildRegulations(model);
  console.log('reg proposals:', regs.data.proposals.length);
  const car = buildCarLab(model);
  console.log('part types:', car.data.parts.map((p) => `${p.partType}(${p.count})`).slice(0, 12));
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
