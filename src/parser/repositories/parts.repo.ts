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
 */

import type { SqlJsDatabase } from '../sqlite/sqljs-loader';
import {
  readTable,
  buildColumnMap,
  colIndex,
  readNum,
  readNumOrStr,
  readStr,
  pkCandidates,
} from './adaptive';
import type {
  PartDesign,
  PartItem,
  CarLoadoutRow,
  TeamExpertiseRow,
} from '../../domain/types';

const DESIGNS_TABLE = 'Parts_Designs';
const STAT_VALUES_TABLE = 'Parts_Designs_StatValues';
const ITEMS_TABLE = 'Parts_Items';
const LOADOUT_TABLE = 'Parts_CarLoadout';
const EXPERTISE_TABLE = 'Parts_TeamExpertise';

const DESIGN_CANDIDATES: Record<string, string[]> = {
  designId: pkCandidates(DESIGNS_TABLE),
  teamId: ['TeamID'],
  partType: ['PartType', 'PartTypeID', 'PartCategory', 'Type'],
  name: ['Name', 'DesignName'],
  status: ['Status', 'DesignStatus', 'State'],
  points: ['Points', 'DesignPoints', 'StatPoints', 'ResearchPoints', 'CDBPoints'],
  cost: ['Cost', 'DesignCost', 'CostCredits', 'Price'],
  buildDays: ['BuildDays', 'Days', 'BuildTime', 'DurationDays'],
  /* v0.8.0: Parts_Designs.DayCompleted — when a loadout DesignID is NULL
   * the engine falls back to the team's LATEST COMPLETED design
   * (DayCompleted > 0), so the day must be mapped, not guessed. */
  dayCompleted: ['DayCompleted', 'DayFinished', 'CompletedDay'],
};

const STAT_VALUE_CANDIDATES: Record<string, string[]> = {
  designId: [
    `${DESIGNS_TABLE}ID`,
    'DesignID',
    'Parts_DesignID',
    'ParentID',
  ],
  /* v0.8.0: the REAL F1M24 column is PartStat (numeric FK into
   * Parts_Enum_Stats) — the old candidate list missed it, so every stat row
   * was labelled "stat-1" and stat identity was lost. Numeric cells resolve
   * through Parts_Enum_Stats (Value → Name) below. */
  stat: ['PartStat', 'Stat', 'StatName', 'Name', 'StatType', 'Attribute'],
  value: ['Value', 'StatValue', 'Amount'],
};

const ITEM_CANDIDATES: Record<string, string[]> = {
  itemId: pkCandidates(ITEMS_TABLE),
  designId: [`${DESIGNS_TABLE}ID`, 'DesignID', 'Parts_DesignID'],
  carId: ['CarID'],
  teamId: ['TeamID'],
  partType: ['PartType', 'PartTypeID', 'Type'],
  condition: ['Condition', 'ConditionPercent', 'Wear', 'Health'],
  faultCount: ['FaultCount', 'Faults', 'FaultsCount'],
};

/* v0.8.0 — the REAL Parts_CarLoadout columns are
 * (TeamID, LoadoutID, PartType, DesignID, ItemID). The old candidates keyed
 * on CarID, a column this table does not have, so EVERY row was dropped and
 * model.parts.loadouts was always empty on real saves. LoadoutID is the
 * seat within the team (0/1); DesignID may be NULL on AI rows (engine
 * falls back to the team's latest completed design, source-labelled). */
const LOADOUT_CANDIDATES: Record<string, string[]> = {
  teamId: ['TeamID'],
  loadoutId: ['LoadoutID', 'Loadout', 'SlotIndex'],
  partType: ['PartType', 'PartTypeID', 'Type', 'SlotType', 'Slot'],
  designId: [`${DESIGNS_TABLE}ID`, 'DesignID', 'Parts_DesignID'],
  itemId: [`${ITEMS_TABLE}ID`, 'ItemID', 'Parts_ItemID'],
};

const EXPERTISE_CANDIDATES: Record<string, string[]> = {
  teamId: ['TeamID'],
  partType: ['PartType', 'PartTypeID', 'Type'],
  expertise: ['Expertise', 'CurrentExpertise'],
  nextSeasonExpertise: ['NextSeasonExpertise'],
};

/** Condition scales seen in games: 0..1 fraction or 0..100 percent. */
export function normalizeCondition(raw: number | undefined): number | undefined {
  if (raw == null) return undefined;
  if (raw >= 0 && raw <= 1) return raw;
  if (raw > 1 && raw <= 100) return raw / 100;
  return undefined; // unknown scale — do not guess
}

export interface RawParts {
  designs: PartDesign[];
  items: PartItem[];
  loadouts: CarLoadoutRow[];
  expertise: TeamExpertiseRow[];
  tablesPresent: {
    designs: boolean;
    items: boolean;
    statValues: boolean;
    loadouts: boolean;
    expertise: boolean;
  };
}

/**
 * PartStat display labels from the save's own enum table (v0.8.0).
 * Parts_Enum_Stats(Value, Name) — the game's authoritative PartStat →
 * label mapping; StatValues rows store the numeric Value ("0", "13").
 * Mirrors getPartTypeLabels — no hardcoded lookup in the app.
 */
export function getPartStatLabels(db: SqlJsDatabase): Map<number, string> {
  const enumTable = readTable(db, 'Parts_Enum_Stats');
  const labels = new Map<number, string>();
  if (!enumTable.present) return labels;
  const vIdx = colIndex(enumTable.columns, 'Value');
  const nIdx = colIndex(enumTable.columns, 'Name');
  if (vIdx < 0 || nIdx < 0) return labels;
  for (const row of enumTable.rows) {
    const value = readNum(row, vIdx);
    const name = readStr(row, nIdx);
    if (value != null && name != null && !labels.has(value)) labels.set(value, name);
  }
  return labels;
}

/** Resolve a raw PartStat value against the enum labels (numeric-safe). */
export function resolvePartStat(
  raw: string | undefined,
  labels: Map<number, string>,
): string | undefined {
  if (raw == null) return undefined;
  if (/^\d+$/.test(raw)) {
    return labels.get(Number(raw)) ?? `PartStat ${raw}`;
  }
  return raw;
}

export function getPartsSnapshot(db: SqlJsDatabase): RawParts {
  /* PartType value → label from the save's own enum table (0.4.1). */
  const typeLabels = getPartTypeLabels(db);
  /* PartStat value → label from the save's own enum table (v0.8.0). */
  const statLabels = getPartStatLabels(db);

  /* stat values first — designs need them attached */
  const sv = readTable(db, STAT_VALUES_TABLE);
  const svMap = buildColumnMap(sv.columns, STAT_VALUE_CANDIDATES);
  const svByDesign = new Map<number, { name: string; value: number }[]>();
  if (sv.present && svMap.designId && svMap.value) {
    const dIdx = colIndex(sv.columns, svMap.designId);
    const sIdx = svMap.stat ? colIndex(sv.columns, svMap.stat) : -1;
    const vIdx = colIndex(sv.columns, svMap.value);
    for (const row of sv.rows) {
      const designId = readNum(row, dIdx);
      const value = readNum(row, vIdx);
      if (designId == null || value == null) continue;
      const name =
        sIdx >= 0
          ? (resolvePartStat(readStr(row, sIdx), statLabels) ?? `stat${sIdx}`)
          : `stat${sIdx}`;
      const list = svByDesign.get(designId) ?? [];
      list.push({ name, value });
      svByDesign.set(designId, list);
    }
  }

  const dsg = readTable(db, DESIGNS_TABLE);
  const dMap = buildColumnMap(dsg.columns, DESIGN_CANDIDATES);
  const designs: PartDesign[] = dsg.present
    ? dsg.rows.flatMap((row) => {
        const idIdx = colIndex(dsg.columns, dMap.designId);
        const designId = readNum(row, idIdx);
        if (designId == null) return [];
        return [
          {
            designId,
            teamId: readNum(row, colIndex(dsg.columns, dMap.teamId)),
            partType: dMap.partType
              ? resolvePartType(readNumOrStr(row, dsg.columns, dMap, 'partType'), typeLabels)
              : undefined,
            name: readStr(row, colIndex(dsg.columns, dMap.name)),
            status: dMap.status
              ? readNumOrStr(row, dsg.columns, dMap, 'status')
              : undefined,
            points: readNum(row, colIndex(dsg.columns, dMap.points)),
            cost: readNum(row, colIndex(dsg.columns, dMap.cost)),
            buildDays: readNum(row, colIndex(dsg.columns, dMap.buildDays)),
            dayCompleted: readNum(row, colIndex(dsg.columns, dMap.dayCompleted)),
            stats: svByDesign.get(designId) ?? [],
          },
        ];
      })
    : [];

  const itm = readTable(db, ITEMS_TABLE);
  const iMap = buildColumnMap(itm.columns, ITEM_CANDIDATES);
  const items: PartItem[] = itm.present
    ? itm.rows.flatMap((row) => {
        const idIdx = colIndex(itm.columns, iMap.itemId);
        const itemId = readNum(row, idIdx);
        if (itemId == null) return [];
        return [
          {
            itemId,
            designId: readNum(row, colIndex(itm.columns, iMap.designId)),
            carId: readNum(row, colIndex(itm.columns, iMap.carId)),
            teamId: readNum(row, colIndex(itm.columns, iMap.teamId)),
            partType: iMap.partType
              ? resolvePartType(readNumOrStr(row, itm.columns, iMap, 'partType'), typeLabels)
              : undefined,
            condition: normalizeCondition(
              readNum(row, colIndex(itm.columns, iMap.condition)),
            ),
            faultCount: readNum(row, colIndex(itm.columns, iMap.faultCount)),
          },
        ];
      })
    : [];

  const lod = readTable(db, LOADOUT_TABLE);
  const lMap = buildColumnMap(lod.columns, LOADOUT_CANDIDATES);
  const loadouts: CarLoadoutRow[] = lod.present
    ? lod.rows.flatMap((row) => {
        const teamId = readNum(row, colIndex(lod.columns, lMap.teamId));
        const loadoutId = readNum(row, colIndex(lod.columns, lMap.loadoutId));
        if (teamId == null || loadoutId == null) return [];
        return [
          {
            teamId,
            loadoutId,
            partType: lMap.partType
              ? resolvePartType(readNumOrStr(row, lod.columns, lMap, 'partType'), typeLabels)
              : undefined,
            designId: readNum(row, colIndex(lod.columns, lMap.designId)),
            itemId: readNum(row, colIndex(lod.columns, lMap.itemId)),
          },
        ];
      })
    : [];

  const exp = readTable(db, EXPERTISE_TABLE);
  const eMap = buildColumnMap(exp.columns, EXPERTISE_CANDIDATES);
  const expertise: TeamExpertiseRow[] = exp.present
    ? exp.rows.flatMap((row) => {
        const teamId = readNum(row, colIndex(exp.columns, eMap.teamId));
        if (teamId == null) return [];
        return [
          {
            teamId,
            partType: eMap.partType
              ? resolvePartType(readNumOrStr(row, exp.columns, eMap, 'partType'), typeLabels)
              : undefined,
            expertise: readNum(row, colIndex(exp.columns, eMap.expertise)),
            nextSeasonExpertise: readNum(
              row,
              colIndex(exp.columns, eMap.nextSeasonExpertise),
            ),
          },
        ];
      })
    : [];

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
      expertise: exp.present,
    },
  };
}

/** Supplier part keywords (docs/03 §5.5) — matched on the stored label. */
export function isSupplierPartType(partType: string | undefined): boolean {
  if (!partType) return false;
  return /engine|ers|gearbox|powertrain|energystore/i.test(partType);
}

/**
 * PartType display labels from the save's own enum table (0.4.1).
 * Parts_Enum_Type(Value, Name) is the game's authoritative PartType → label
 * mapping; raw designs/items store the numeric Value ("0", "1"). Returning
 * the save's own Name keeps the part grid readable WITHOUT hardcoding a
 * lookup table in the app (still local-first, still traceable to the save).
 */
export function getPartTypeLabels(db: SqlJsDatabase): Map<number, string> {
  const enumTable = readTable(db, 'Parts_Enum_Type');
  const labels = new Map<number, string>();
  if (!enumTable.present) return labels;
  const vIdx = colIndex(enumTable.columns, 'Value');
  const nIdx = colIndex(enumTable.columns, 'Name');
  if (vIdx < 0 || nIdx < 0) return labels;
  for (const row of enumTable.rows) {
    const value = readNum(row, vIdx);
    const name = readStr(row, nIdx);
    if (value != null && name != null && !labels.has(value)) labels.set(value, name);
  }
  return labels;
}

/** Resolve a raw PartType value against the enum labels (numeric-safe). */
export function resolvePartType(
  raw: string | undefined,
  labels: Map<number, string>,
): string | undefined {
  if (raw == null) return undefined;
  if (/^\d+$/.test(raw)) {
    return labels.get(Number(raw)) ?? `PartType ${raw}`;
  }
  return raw;
}
