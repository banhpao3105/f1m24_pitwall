> Gộp từ các file cũ: 02-CURRENT-STATE-AUDIT.md, 04-DATA-MODEL-SAVE.md, A1-SQL-TABLE-INVENTORY.md — nội dung giữ nguyên, chỉ gộp file, không cắt ý.


---

<!-- Nguồn: 02-CURRENT-STATE-AUDIT.md -->

# 02 — Audit bản hiện tại: `F1_Manager_Circuit_Gazette.html`

> File: `workspace/user/files/F1_Manager_Circuit_Gazette.html`
> Đo ngày 13/11/2026: **21.426 dòng, 2.335.278 bytes (~2,3 MB)**. Đây là audit kỹ thuật để quyết định giữ / viết lại / bỏ.

## 2.1. Bản cũ làm được gì — rất đáng giữ

### Pipeline parse — đây là tài sản quý nhất

```
.sav (F1 Manager 23/24)
  → GVAS parser (UESaveTool, port JS: GvasHeader, Serializer, Property types)
  → tách SQLite DB nhúng trong save
  → sql.js (SQLite compiled to WASM, instantiateStreaming + ArrayBuffer fallback)
  → SQL query trực tiếp lên DB
  → render HTML string (template literal) → innerHTML
```

- **Điểm mạnh:** Chạy hoàn toàn local, đúng triết lý privacy. Đã xử lý được format GVAS + SQLite — phần khó nhất, không nên viết lại từ đầu nếu không cần.
- **Bằng chứng trong file:** `window.F1MSave = { parseF1ManagerSave }`, `F1MSaveBundle`, các class `Bool/Int/Float/Str/Struct/Array/EnumProperty`, `SaveGameVersion` / `SaveGameClassName`, check header `SQLite format 3`, lỗi `UNSUPPORTED_SAVE_FORMAT`, `NOT_A_SQLITE_DB`.
- **Kết luận:** Mang nguyên pipeline này sang Next.js, nhưng **đóng gói lại** thành module TypeScript + chạy trong Web Worker (file 03, 04).

### 9 tab hiện tại — bản đồ tính năng

| Tab (`data-tab`) | Nội dung thực tế trong code | Giá trị | Hướng mới |
|---|---|---|---|
| `gazette` | Circuit Gazette: báo cáo chặng, bảng kết quả, standings, awards, transfers, highlights, next race preview, odds, dark horse, teammate duel | Cao — narrative, giữ chân | Giữ, tách thành module `Gazette` riêng, không trộn vào Pit Wall |
| `kpi` | KPI strip, verdict, “mọi số đo từ save” | Cao — đúng tư duy decision | **Thành màn hình chính Pit Wall** |
| `strategy` | Reality table, condition bars (parts + morale), durability/failure risk, loadout, personnel | Cao | Tách thành `Strategy` + `Car Health` |
| `cars` | Car Lab: pace board, race sim (slider số vòng), quali sim, league table, part grid, durability | Rất cao — core | Giữ engine, viết lại UI |
| `tyres` | Tyre Lab: recommendation card (stint sequence), compound cards, observed data, wet note, player drivers, provenance | Rất cao — core | **Thành module flagship**, thêm confidence + what-if |
| `research` | Regulations vote, impact, expertise banking, engine supplier verdict, project queue, calendar | Cao | Giữ, thêm “nên vote gì” |
| `drivers` | Driver cards: rating bars, record, avgs, leader highlight | Cao | Giữ, thêm duel + tyre preservation |
| `teams` | Team cards: record, pit stats, sparkline | Trung bình | Gộp vào Drivers/Season, làm comparison |
| `season` | Season data table: race list, sprint tag, rain flags, temp, pit timings | Cao — dữ liệu thô | Thành `Season` + export |

### Những chi tiết tốt cần mang sang

- **Provenance (nguồn dữ liệu):** Các chuỗi như `provStintModel`, `provShapeModel`, `tyreObservedNote`, `planExpNote: Source: Parts_TeamExpertise.NextSeasonExpertise` — đây là DNA của sản phẩm. Bản mới phải làm mạnh hơn, không yếu đi.
- **Fallback có ý thức:** Khi thiếu pit history → dùng “save-wide average (hoặc model constant ≈ 0.28 × race distance)”; khi thiếu tyre allocation → dùng “model envelope (S ≈ 0.51×, M ≈ 0.7×…)”. Ghi rõ fallback trong UI. Giữ nguyên triết lý này, chuẩn hóa thành `confidence: LOW + assumption[]`.
- **i18n VI/EN:** Object `UI[lang]` lớn, có `btnLangVi/btnLangEn`, track name VI/EN, quote VI/EN. Giữ song ngữ từ đầu.
- **Hiểu game sâu:** Pole bonus, sprint points, fastest-lap bonus, `Races_QualifyingResults.ChampionshipPoints`, `Staff_ContractPatience` (suitability/opinion/threshold), engine/ERS/gearbox là supplier parts (bank reset mỗi mùa), expertise carry-over. Đây là domain knowledge không mua được — phải trích ra thành tài liệu + test.
- **Visual identity ban đầu:** Dark command-centre, `--steel: #2ee6c8` (teal), `--red: #ff5c6c`, `--amber: #ffb02e`, `--gold: #ffc94d`, `--green: #3ddc97`, `--blue: #4cc3ff`, grid nền, checker, mono font cho số. Đây là hạt nhân cho design system mới (file 06).

## 2.2. Vấn đề — vì sao phải đập đi xây lại

| Vấn đề | Bằng chứng | Hậu quả |
|---|---|---|
| **Monolith 1 file** | 21.426 dòng, CSS + WASM sql.js + GVAS + i18n + SQL + render trộn lẫn | Không test, không review, sửa 1 chỗ vỡ chỗ khác, load chậm, khó onboard |
| **Render bằng string template** | `esc2(...)`, template literal dài hàng trăm dòng, `innerHTML` | XSS risk nếu esc sót, không có component reuse, không có state, không có animation có kiểm soát |
| **SQL nằm rải rác trong UI** | Hàng chục `q(db, 'SELECT ... FROM Races_Results ...')` trong hàm render | Đổi schema = sửa khắp nơi. Không có model trung gian. Không cache. |
| **Không có state / routing** | Tab bằng `data-tab`, hashchange thủ công, không có URL share được cho 1 chặng / 1 tay đua | Không deep-link, không back/forward đúng, không lưu view |
| **Không có worker** | Parse + SQL chạy trên main thread (theo code hiện tại) | File save lớn → UI đơ, không có progress thật |
| **Không có test** | Không có test file, không có save mẫu versioned | Không biết thay đổi có làm sai số không — nguy hiểm nhất với tool “khuyến nghị” |
| **Không có design token** | Màu hard-code trong CSS, `color-mix` rải rác | Không đổi theme, không làm motion system, không responsive hệ thống |
| **Không có “độ tin cậy” chuẩn** | Fallback ghi bằng text tự do, không có field `confidence` | Người chơi không phân biệt được số đo thật vs số ước lượng |

## 2.3. Bảng dữ liệu đã dùng — trích từ code (để làm input cho file 04)

**Core (bắt buộc, thiếu là lỗi):** `Races, Races_Tracks, Races_Results, Teams, Staff_BasicData, Player, Player_State`

**Mở rộng (thiếu thì degrade):** `Races_QualifyingResults, Races_SprintResults, Races_PitStopResults, Races_PitStopTimings, Races_PracticeResults, Races_DriverStandings, Races_TeamStandings, Save_CarTyreAllocation, Staff_PerformanceStats, Staff_Contracts, Staff_DriverData, Staff_ContractPatience, Teams_Colours, Countries, Parts_* (Parts_TeamExpertise, Parts_...), Regulations_*`

**Quy tắc kiểm tra schema trong code cũ:** `SELECT name FROM sqlite_master WHERE type IN ('table','view')`, `hasTable()`, `tableColumns()`, `standingsColumns()` — giữ lại tư duy này, đưa vào `schema.ts`.

## 2.4. Quyết định migration

| Hạng mục | Quyết định |
|---|---|
| GVAS parser + sql.js | **Mang sang, đóng gói lại** thành `packages/parser` (TS + Worker). Không viết lại parser từ đầu trừ khi phát hiện bug. |
| SQL queries | **Viết lại** thành Repository layer trả về Normalized Model. Không copy-paste query string vào component. |
| Logic phân tích (tyre life, pace, sim, durability, regulation) | **Trích + viết lại thành engine thuần TS**, có unit test với fixture. Giữ công thức cũ làm baseline, ghi lại công thức trong file 05. |
| UI strings VI/EN | **Trích** thành `locales/vi.json, en.json` (next-intl hoặc tương đương). Không để string trong component. |
| Gazette narrative | **Giữ** nhưng tách thành route riêng `/gazette`, render bằng component, không phải 1 template khổng lồ. |
| CSS hiện tại | **Không mang sang nguyên vẹn.** Lấy palette + tinh thần, xây lại bằng design token (file 06). |
| File HTML cũ | **Giữ làm tài liệu tham khảo + test oracle** (so sánh output cũ vs mới trên cùng save mẫu). Không xóa. Không deploy song song lâu dài. |

## 2.5. Rủi ro khi migration (đừng coi thường)

1. **Sai số âm thầm:** Công thức tính điểm (pole + sprint + fastest lap) rất dễ sai 1 điểm. Cần test đối chiếu standings cũ vs mới trên cùng save.
2. **Schema khác nhau giữa F1M 23 và 24:** Tên cột có thể khác, bảng có thể thiếu. Cần schema adapter theo `SaveGameVersion` + `EngineVersion`.
3. **Save lớn / save lỗi:** Save hỏng giữa chừng, save đang chơi dở (chưa có race hoàn thành → `errorNoRaces`). Cần trạng thái lỗi rõ ràng, không trắng trang.
4. **Hiệu năng WASM:** sql.js WASM load lần đầu nặng. Cần lazy-load, cache, progress indicator.


---

<!-- Nguồn: 04-DATA-MODEL-SAVE.md -->

# 04 — Data Model: từ save SQLite tới Normalized Model

## 4.1. Nguyên tắc

1. **UI không query SQL.** Chỉ parser + repository được chạm vào SQLite.
2. **Normalized Model là hợp đồng.** Mọi engine và component chỉ biết model này.
3. **Mọi số đều có provenance.** Mỗi giá trị suy ra phải biết nó từ bảng nào, mùa nào, chặng nào.
4. **Thiếu bảng ≠ crash.** Model có field `availability: { table: boolean }` và engine phải xử lý.
5. **Version-aware.** F1M 23 vs 24 có thể khác cột. Adapter theo version, không `if (game === 24)` rải rác trong UI.

## 4.2. Pipeline parse (chi tiết)

```
.sav bytes
  → GVAS header: SaveGameVersion, SaveGameClassName, EngineVersion
  → if version không hỗ trợ → UNSUPPORTED_SAVE_FORMAT
  → slice databaseFile (phần SQLite)
  → check 16 bytes đầu == "SQLite format 3" else NOT_A_SQLITE_DB
  → sql.js: new SQL.Database(bytes)
  → schema detect:
      SELECT name FROM sqlite_master WHERE type IN ('table','view')
      + PRAGMA table_info(<table>) cho từng bảng cần
  → if thiếu CORE_TABLES → MISSING_CORE_TABLES + liệt kê
  → repositories query (xem 4.3)
  → normalize → SaveModel
  → validate: có ít nhất 1 race State=2? Nếu không → NO_COMPLETED_RACES (warning, không phải lỗi fatal)
  → trả về { model, meta, warnings[] }
```

**Lưu ý từ code cũ cần giữ:**
- `Races.State = 2` = race đã hoàn thành.
- `Races_Results.Points` đã gồm fastest-lap bonus; sprint points ở `Races_SprintResults.ChampionshipPoints`; pole bonus ở `Races_QualifyingResults` (kiểm tra lại bằng test đối chiếu standings).
- `QualifyingStage = MAX(...)` để lấy kết quả quali cuối cùng.
- `TeamID BETWEEN 1 AND 10 OR TeamID = 32` (custom team) — cần xác nhận lại cho 23/24.
- `Staff_Contracts.ContractType = 0` = driver contract.

## 4.3. Bảng inventory (từ audit file cũ — cần verify lại bằng save thật)

### Core — bắt buộc

| Bảng | Dùng cho | Field quan trọng (cần verify) |
|---|---|---|
| `Player` | Team người chơi | `TeamID, FirstName, LastName, CustomTeamEnabled` |
| `Player_State` | Tiến trình | `Day, CurrentSeason` |
| `Teams` | Tên đội | `TeamID, TeamName, TeamNameLocKey` |
| `Teams_Colours` | Màu đội | `TeamID, ColourID, Colour` |
| `Races` | Lịch + trạng thái | `RaceID, SeasonID, TrackID, Day, State, RaceFormula` |
| `Races_Tracks` | Đường đua | `TrackID, FastestLap, FastestLapDriverID, FastestLapYear, ...` |
| `Races_Results` | Kết quả đua | `RaceID, DriverID, Position, Points, ...` |
| `Staff_BasicData` | Con người | `StaffID, FirstName, LastName` |

### Mở rộng — thiếu thì degrade

| Bảng | Dùng cho | Fallback khi thiếu |
|---|---|---|
| `Races_QualifyingResults` | Quali, pole | Không có quali sim |
| `Races_SprintResults` | Sprint | Bỏ sprint points, ghi chú |
| `Races_PitStopResults` / `Races_PitStopTimings` | Pit, tyre observed | Dùng save-wide average |
| `Races_PracticeResults` | Practice pace, compound | Dùng race pace |
| `Races_DriverStandings` / `Races_TeamStandings` | Standings | Tự tính từ Results (cần test) |
| `Save_CarTyreAllocation` | Tyre allocation | Model envelope |
| `Staff_PerformanceStats` | Driver rating | Ẩn rating, chỉ hiện record |
| `Staff_DriverData` | Driver stats | Ẩn chi tiết |
| `Staff_Contracts` | Hợp đồng | Ẩn personnel |
| `Staff_ContractPatience` | FA intel | Ẩn intel, chỉ hiện lương |
| `Parts_*` / `Parts_TeamExpertise` | Car Lab, R&D | Ẩn Car Lab, ghi rõ |
| `Regulations_*` | Research | Ẩn Research |
| `Countries` | Quốc tịch, tên GP | Dùng TrackID fallback |

**Việc cần làm ở Phase 0:** Chạy script `introspect-save` trên 2–3 save thật (F1M 23, F1M 24, save mới, save nhiều mùa) để dump `sqlite_master + PRAGMA table_info` ra JSON, lưu vào `tests/fixtures/schema/`. Đây là tài liệu sống cho model.

## 4.4. Normalized Model (TypeScript — khung sườn)

```ts
// domain/types.ts — KHÔNG import React, KHÔNG import SQL

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export interface Evidence {
  source: string;          // vd: 'Races_PitStopTimings'
  label: string;           // vd: 'Pit history tại Bahrain, 3 chặng'
  detail?: string;
  seasonId?: number;
  raceId?: number;
}
export interface Assumption {
  text: string;            // vd: 'Dùng trung bình save vì thiếu pit history tại track này'
  fallbackValue?: string;  // vd: '≈ 0.28 × race distance'
}

export interface SaveMeta {
  id: string;              // hash(file)
  fileName: string;
  gameVersion: 'F1M23' | 'F1M24' | 'UNKNOWN';
  saveGameVersion: number;
  engineVersion?: string;
  parsedAt: string;        // ISO
  seasonId: number;
  day: number;
  playerTeamId: number;
  tablesPresent: string[];
  tablesMissing: string[];
  warnings: string[];
}

export interface SaveModel {
  meta: SaveMeta;
  player: { teamId: number; teamName: string; };
  teams: Team[];
  drivers: Driver[];
  staff: StaffMember[];
  seasons: Season[];
  races: Race[];           // kèm results, quali, pit, practice đã join sẵn
  standings: { drivers: StandingRow[]; teams: StandingRow[]; };
  tyres: TyreAllocation[];
  parts: Part[];
  regulations: RegulationProposal[];
  finance: FinanceSnapshot;
}

export interface Race {
  raceId: number; seasonId: number; trackId: number;
  trackName: string; day: number; state: number; // 2 = completed
  isSprint: boolean;
  weather?: { raceTempC?: number; raceRain?: boolean; };
  results: RaceResult[];
  qualifying?: QualifyingResult[];
  pitStops?: PitStop[];
  practice?: PracticeResult[];
}

export interface Recommendation {
  id: string;
  title: string;           // vd: 'Pit ở vòng 18–20, chuyển sang Medium'
  action: string;          // Động từ cụ thể
  why: string;
  confidence: Confidence;
  evidence: Evidence[];
  assumptions: Assumption[];
  riskIfIgnored?: string;
  expectedGain?: string;   // vd: '+2.3s vs 1-stop' — phải ghi rõ là ước lượng
}
```

**Quy tắc:**
- `RaceResult` đã join tên driver/team, không để UI tự join.
- Thời gian lưu dạng `number` (ms hoặc giây, thống nhất 1 đơn vị trong toàn model — khuyến nghị **ms** cho lap time, **giây** cho gap).
- Tiền lưu dạng `number` (đơn vị game), format ở `lib/format.ts`.
- Không lưu `SQL.Database` hay `ArrayBuffer` trong model — model phải `JSON.stringify` được.

## 4.5. Repository pattern

Mỗi domain 1 file, 1 hàm chính:

```ts
// parser/repositories/tyres.repo.ts
export function getTyreAllocations(db: Database): RawTyreAllocation[]
export function getPitTimings(db: Database, raceId: number): RawPitTiming[]
```

- Repository chỉ trả raw rows + kiểm tra `hasTable`.
- Normalize nằm ở `parser/normalize/`, không nằm trong repository.
- Thêm `parser/schema.ts`: `CORE_TABLES`, `OPTIONAL_TABLES`, `detectGameVersion()`, `getTableColumns()`.

## 4.6. Caching & persistence

- **In-memory:** Zustand `save.store` giữ `SaveModel` hiện tại.
- **IndexedDB:** Lưu `SaveModel` theo `id = hash`. Khi mở lại app, load từ IndexedDB trước, không bắt nạp lại file. Có TTL / nút xóa.
- **Không lưu file .sav thô** trừ khi user bật “Lưu file gốc để mở lại” (P2).
- **Hash:** SHA-256 của file (Web Crypto) để dedupe + làm key.

## 4.7. Test data

- Cần ít nhất 3 fixture: `F1M23 early save`, `F1M24 mid-season save`, `F1M24 multi-season save`.
- Mỗi fixture kèm `expected-normalized.json` (snapshot) + `expected-standings.json` để đối chiếu.
- **Không commit save thật có dữ liệu cá nhân** nếu save chứa tên custom — anonymize hoặc dùng save mẫu tự tạo.
- Test: `normalize` không được throw khi thiếu bảng optional; `standings` tự tính phải khớp `Races_DriverStandings` trong save (sai số 0).


---

<!-- Nguồn: A1-SQL-TABLE-INVENTORY.md -->

# A1 — SQL Table Inventory (phụ lục cho Phase 0, không thuộc bộ 00–10)

> **Nguồn:** trích máy từ `workspace/user/files/F1_Manager_Circuit_Gazette.html`
> (21.426 dòng, 2.335.278 bytes) ngày 2026-11-13 bằng grep `FROM|JOIN <Table>`.
> **Mục đích:** checklist cho bước `introspect-save` ở Phase 0 (file 08) và cho
> file 04 — đối chiếu schema save thật với những bảng bản cũ thực sự query.
> **Không phải planning đã duyệt:** file 02 §2.3 vẫn là bản audit chính thức.
> File này chỉ bổ sung số đếm và những bảng file 02 chưa liệt kê tên.
>
> **Giới hạn của số đếm:** đếm số lần tên bảng xuất hiện sau `FROM`/`JOIN`
> trong file (code đã minify, tên hàm bị rút gọn thành `AA`, `AB`… nên không
> đếm được số query riêng biệt hay cột nào được SELECT). Một bảng xuất hiện
> nhiều lần có thể là cùng 1 query lặp lại ở nhiều tab, hoặc nhiều query khác
> nhau — cần introspect save thật để phân biệt.

## A1.1. Tổng quan

- **68 tên distinct** sau `FROM`/`JOIN`, trong đó:
  - `sqlite_master` — catalog SQLite, không phải bảng game.
  - `P` (1 lần) — nhiều khả năng là match giả do code minify, **chưa xác minh**,
    đừng đưa vào adapter khi chưa kiểm tra tay.
  - **66 bảng game thực** (68 − 2).
- File 02 §2.3 liệt kê khoảng ~30 bảng theo nhóm; **danh sách dưới đây đầy đủ hơn**
  và là danh sách cần đối chiếu khi introspect.

## A1.2. Bảng dùng nhiều nhất (core — thiếu là lỗi, theo file 02)

| Bảng | Số lần | Ghi chú |
|---|---|---|
| `Races` | 51 | Trung tâm mọi tab |
| `Races_Results` | 29 | Kết quả đua, điểm số |
| `Staff_BasicData` | 28 | Tay đua + nhân sự |
| `Staff_Contracts` | 16 | Hợp đồng, patience |
| `Races_Tracks` | 16 | Thông tin chặng |
| `Teams` | 10 | Đội đua |
| `Races_QualifyingResults` | 10 | Quali + điểm pole |
| `Staff_GameData` | 8 | |
| `Parts_Designs` | 8 | Thiết kế part |
| `Staff_PerformanceStats` | 7 | |
| `Staff_PitCrew_PerformanceStats` | 6 | Pit crew — **chưa có tên trong file 02 §2.3** |
| `Races_TeamStandings` | 6 | |
| `Races_PitStopTimings` | 6 | |
| `Finance_Transactions` | 6 | |
| `Parts_Items` | 5 | |
| `Parts_CarLoadout` | 5 | Loadout xe |
| `Finance_TeamBalance` | 5 | |
| `Teams_PitCrewRecordPerSeason` | 4 | Pit crew theo mùa — **chưa có tên trong file 02 §2.3** |
| `Staff_DriverData` | 4 | |
| `Regulations_Proposals` | 4 | |
| `Player` | 4 | |
| `Parts_Designs_StatValues` | 4 | |

## A1.3. Bảng còn lại (mở rộng — thiếu thì degrade)

| Bảng | Số lần | Nhóm |
|---|---|---|
| `Staff_State` | 3 | Nhân sự |
| `Staff_ContractOffers` | 3 | Nhân sự |
| `Regulations_NonTechnical` | 3 | Luật |
| `Races_SprintResults` | 3 | Đua |
| `Races_PitStopResults` | 3 | Đua |
| `Player_State` | 3 | Người chơi |
| `Board_SeasonObjectives` | 3 | Board |
| `Board_Confidence` | 3 | Board |
| `Seasons` | 2 | Mùa giải |
| `Save_Weekend` | 2 | Save |
| `Save_CarTyreAllocation` | 2 | Lốp |
| `Regulations_Technical_TypeStatComboReductions` | 2 | Luật kỹ thuật |
| `Regulations_Technical_TypeReductions` | 2 | Luật kỹ thuật |
| `Regulations_Technical_SweepingReductions` | 2 | Luật kỹ thuật |
| `Regulations_Technical_StatReductions` | 2 | Luật kỹ thuật |
| `Regulations_TeamVotes` | 2 | Luật |
| `Regulations_Proposals_ChangeGroups` | 2 | Luật |
| `Regulations_ChangeGroups` | 2 | Luật |
| `Races_PracticeResults` | 2 | Đua |
| `Races_PitCrewStandings` | 2 | Pit crew |
| `Races_DriverStandings` | 2 | Đua |
| `Parts_TeamExpertise` | 2 | Expertise / research |
| `Parts_PowertrainRaceHistoryData` | 2 | Động cơ |
| `Parts_Items_Faults` | 2 | Hỏng hóc |
| `Teams_Colours` | 1 | Đội |
| `Staff_RaceEngineerDriverAssignments` | 1 | Nhân sự |
| `Staff_PitCrew_DevelopmentPlanGlobalData` | 1 | Pit crew |
| `Staff_PitCrew_DevelopmentPlan` | 1 | Pit crew |
| `Staff_ContractPatience` | 1 | Nhân sự — file 02 nhắc trong prose, không có trong danh sách bảng |
| `Sponsorship_RaceBonuses` | 1 | Tài trợ |
| `Sponsorship_EngagementActivities` | 1 | Tài trợ |
| `Sponsorship_ActivePackages` | 1 | Tài trợ |
| `Scouting_Staff_PerformanceStats` | 1 | Scouting |
| `Scouting_Staff_CommonData` | 1 | Scouting |
| `Save_PlayerStrategyStints` | 1 | Chiến thuật đã lưu |
| `Regulations_NonTechnical_PrizeShare` | 1 | Luật |
| `Regulations_NonTechnical_PartResources` | 1 | Luật |
| `Regulations_EventCalendar` | 1 | Luật |
| `Races_TeamPerformance` | 1 | Đua |
| `Player_PreSeason` | 1 | Người chơi |
| `Parts_InspectionResults` | 1 | Kiểm tra part |
| `Parts_Enum_EngineManufacturers` | 1 | Động cơ |
| `Parts_EnginePurchase_MonthlyPayments` | 1 | Tài chính / động cơ |
| `Countries` | 1 | Danh mục |

## A1.4. Những điểm đã xác minh thêm (2026-11-13)

- **Tyre fallback constants trong file 02 §2.1 có thật trong code:** `0.28`
  (3 lần), `0.51` (2 lần), `0.7` (6 lần) — khớp mô tả “0.28 × race distance”
  và “S ≈ 0.51×, M ≈ 0.7×”. Ngữ cảnh từng lần dùng chưa đối chiếu tay,
  nên file 05 khi ghi công thức vẫn cần trích đúng dòng code.
- **Version check có thật:** `SaveGameVersion` (9 lần), `EngineVersion`
  (17 lần) — adapter theo version ở Phase 0 có điểm bám.
- **F1M 23 và 24 đều được nhắc:** “F1 Manager 23” (5 lần), “F1M24” (2 lần).
- **Schema introspection có thật:** `SELECT name FROM sqlite_master WHERE
  type IN ('table','view')` (2 lần) — giữ tư duy `hasTable()` /
  `tableColumns()` như file 02 §2.3 nói.
- **ui-ux-pro-max:** repo `nextlevelbuilder/ui-ux-pro-max-skill` tồn tại,
  MIT, ~142k–148k stars theo nhiều directory độc lập (SkillsLLM 148.417,
  star-history 147,3k, Beetlix 142.523 — số liệu khác nhau theo thời điểm
  crawl). Con số 148.715 trong file 00 là hợp lý, không phải bịa.

## A1.5. Việc còn lại cho Phase 0 (không làm thay được ở đây)

1. Chạy `introspect-save` trên 2–3 save thật (23 và 24) và đối chiếu từng
   bảng trong A1.2–A1.3: bảng nào có thật, thiếu bảng nào, tên cột khác gì.
2. Xác minh `P` (1 lần) là gì — nếu là match giả thì xóa khỏi danh sách.
3. Với mỗi bảng, ghi cột nào được SELECT — grep `FROM|JOIN` không cho
   biết điều này.
4. Trích ngữ cảnh của `0.28 / 0.51 / 0.7` để khóa công thức tyre vào file 05.
