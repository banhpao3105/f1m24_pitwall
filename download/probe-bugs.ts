/**
 * Local probe (NOT committed): inspect real-save facts needed for bug fixes.
 *  - Staff_Contracts rows per StaffID (duplicate check)
 *  - Staff_ContractPatience rows per StaffID
 *  - Parts_Designs TeamID/DesignSpeed distribution (car league feasibility)
 *  - Parts_Items Condition coverage
 *  - Races_Tracks Name values (raw keys)
 * Prints aggregates only — no personal data in output beyond generated names.
 */
import { readFileSync } from 'node:fs';
import { parseF1ManagerSave } from '../src/parser/parse-save';
import { openDatabase } from '../src/parser/sqlite/sqljs-loader';

const SAVE = process.argv[2] ?? 'upload/autosave.sav';
const SQL_WASM = '/home/z/my-project/node_modules/sql.js/dist/sql-wasm.wasm';

async function main() {
  const raw = readFileSync(SAVE);
  const binary = parseF1ManagerSave(raw);
  const db = await openDatabase(binary.databaseFile, { locateFile: () => SQL_WASM });

  const q = (sql: string): unknown[][] => db.exec(sql)[0]?.values ?? [];

  console.log('== Staff_Contracts duplicates ==');
  console.log(q(`SELECT StaffID, COUNT(*) n, GROUP_CONCAT(ContractType) types,
    GROUP_CONCAT(StartDay) starts, GROUP_CONCAT(EndSeason) ends
    FROM Staff_Contracts GROUP BY StaffID HAVING n > 1 ORDER BY n DESC LIMIT 10`));

  console.log('\n== Staff_ContractPatience duplicates ==');
  console.log(q(`SELECT StaffID, COUNT(*) n FROM Staff_ContractPatience
    GROUP BY StaffID HAVING n > 1 ORDER BY n DESC LIMIT 10`));
  console.log('total patience rows:', q(`SELECT COUNT(*) FROM Staff_ContractPatience`)[0]);

  console.log('\n== Parts_Designs per team (DesignSpeed stats) ==');
  console.log(q(`SELECT TeamID, COUNT(*) n, MIN(DesignSpeed), MAX(DesignSpeed)
    FROM Parts_Designs GROUP BY TeamID ORDER BY TeamID LIMIT 15`));

  console.log('\n== Parts_Designs DesignWork/DesignWorkMax sample (finished designs) ==');
  console.log(q(`SELECT DesignID, PartType, DesignType, TeamID, DesignWork, DesignWorkMax,
    DayCompleted IS NOT NULL, DesignSpeed, PartKnowledge
    FROM Parts_Designs LIMIT 8`));

  console.log('\n== Parts_Items condition coverage ==');
  console.log(q(`SELECT COUNT(*) total, SUM(Condition IS NOT NULL) withCond,
    MIN(Condition), MAX(Condition) FROM Parts_Items`));

  console.log('\n== Races_Tracks names ==');
  console.log(q(`SELECT TrackID, Name FROM Races_Tracks ORDER BY TrackID`));
}

main().catch((e) => {
  console.error('PROBE FAILED:', e);
  process.exit(1);
});

// appended probe: staff names + contract current-row analysis
const raw2 = readFileSync(SAVE);
const bin2 = parseF1ManagerSave(raw2);
const db2 = await openDatabase(bin2.databaseFile, { locateFile: () => SQL_WASM });
const q2 = (sql: string): unknown[][] => db2.exec(sql)[0]?.values ?? [];
console.log('\n== Generated staff name keys (distinct, first 40) ==');
console.log(q2(`SELECT DISTINCT FirstName, LastName FROM Staff_BasicData
  WHERE IsGeneratedStaff = 1 LIMIT 40`));
console.log('\n== meta day ==');
console.log(q2(`SELECT MAX(Day) FROM Races WHERE State = 2`));
