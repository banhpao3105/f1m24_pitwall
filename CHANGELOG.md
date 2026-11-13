# Changelog

Tất cả thay đổi đáng chú ý của F1 Pit Wall. Format theo [Keep a Changelog](https://keepachangelog.com/), version theo [SemVer](https://semver.org/).

## [0.3.0] — Phase 2: Car + Strategy + Research (unreleased → pushed)

Phase 2 theo `docs/05-ROADMAP-STANDARDS.md` — **mọi module P1 đều có recommendation + confidence + evidence** (Definition of Done của phase).

### Added — engines (thuần TS, unit test Vitest)
- **`src/engines/car.engine.ts`** — Car Lab: league xe (design points, fallback pace), durability theo nhóm part với ngưỡng rủi ro `HIGH < 0.40 ≤ WATCH < 0.70 ≤ LOW` (hằng số mô hình — thay đổi cần ghi chú ở đây), dev queue xếp theo **points-per-million** (không phải điểm tuyệt đối), nhận diện supplier part (engine/ERS/gearbox — bank reset mỗi mùa).
- **`src/engines/finance.engine.ts`** — Finance snapshot: balance mới nhất theo Day, spend by category (amount âm = chi), cost-per-point = tổng chi / điểm standings, **expertise banking** từ `Parts_TeamExpertise.NextSeasonExpertise` (cột đã xác minh từ bản cũ) xếp hạng toàn giải.
- **`src/engines/personnel.engine.ts`** — Driver cards (form 5 chặng, quali/race median, **laps/stint** làm proxy giữ lốp, DNF rate), teammate duel head-to-head (JTBD #8), hợp đồng với ngưỡng cảnh báo `CONTRACT_ALERT_DAYS = 60`, FA intel từ `Staff_ContractPatience`.
- **`src/engines/regulation.engine.ts`** — Regulation proposals: tally thô theo **giả định có ghi chú vote=1=YES** (encoding chưa verify trên save thật), không bịa tác động điểm/budget khi semantics của ChangeGroups chưa rõ; kết hợp expertise banking cho trang Research.
- **`src/engines/sim.engine.ts`** — Quali sim (median vị trí quali → fallback StartingPos → practice, band Q1/Q2/Q3 theo tỉ lệ giải) + Race sim (xếp theo median fastest-lap delta vs best của chặng — mô hình tuyến tính, giả định ghi rõ ở UI).
- **`src/engines/tyre.engine.ts`** — mở rộng what-if: `whatIfPitShift` (dời pit ±N vòng, clamp theo đời lốp — game kill set ở life estimate) và `buildWetPlan` (plan I→W **chỉ từ allocation**, thiếu allocation → trả null, không bịa hằng số wet).

### Added — parser
- Repository **schema-adaptive** (`parser/repositories/adaptive.ts` + parts/finance/staff-detail/regulations/quali repo): SELECT * thật + map concept→cột runtime qua `tableColumns()`; cột không map được → `undefined`, engine degrade LOW + assumption. **Trạng thái: CANDIDATE** — các cột Parts_*/Finance_*/Staff_*/Regulations_* chưa được verify trên save thật.
- `scripts/introspect-save.ts` giờ dump **cột của mọi bảng** (`allTableColumns`) — chạy `bun scripts/introspect-save.ts <save>` để chốt candidate columns, không cần sửa engine.
- Normalize: quali được đưa vào model (giữ stage cuối theo oracle `QualifyingStage = MAX`), `SaveModel` v1 có `parts/finance/personnel` + `regulations` chi tiết; lỗi repo mới không làm chết parse (warning `REPO_FAILED:*`).

### Added — UI (kiêm chế cyber theo docs/04, token-first, VI/EN)
- Nav 2 mode: Race Weekend (Pit Wall, Tyre Lab, Race Weekend) / Factory–Season (Car Lab, Drivers, Season, Strategy, Research) — query-param deep-link `/?view=…&race=…`.
- **DriversView**: cards + duel selector; **SeasonView**: calendar + standings + bảng dữ liệu chặng + **export CSV** (UTF-8 BOM); **CarLabView**: league/parts/dev queue; **StrategyView**: finance + hợp đồng + FA intel; **ResearchView**: proposal cards + expertise ranking.
- **Race Weekend** thêm tab Sim (quali + race board + assumptions); **Tyre Lab** thêm what-if (slider pit ±3 vòng + toggle mưa → plan I/W từ allocation).
- **Feedback 👍/👎 local** trên RecommendationCard — lưu `localStorage` (`pitwall:feedback`), không gửi đi đâu (local-first).
- AlertBanner bổ sung: part HIGH risk + hợp đồng sắp hết hạn; Pit Wall Home thêm KPI "Xếp hạng xe" + merge recs từ car/finance engines.
- Debug hook dev-only `window.__pitwall.useSaveStore` (không chạy trong production) phục vụ browser verification.

### Notes
- Bổ trách xác minh: khi có save thật, chạy introspect (bản mới) → đối chiếu `allTableColumns` với candidate lists trong các repo adaptive → chỉnh candidate, **không sửa engine logic**. UI các module thiếu dữ liệu hiển thị trạng thái "Thiếu dữ liệu — chạy chế độ suy giảm" + confidence LOW, không hiện số 0 giả.
- Tag `v1.0.0` (Phase 2 xong theo docs/09) chờ milestone demo với 5 người chơi ("Biết nâng cấp gì, ký ai, vote gì?") — chưa tag ở bản này.

## [0.2.1] — Phase 1: Pit Wall MVP
- Parser GVAS + sql.js WASM trong Web Worker, Normalized Model v0, standings tự tính verified 0-mismatch vs save thật.
- Tyre Engine v1 (stint optimizer, confidence + evidence), Pace Engine v1 (pace board vs direct rival), Pit Wall Home, Tyre Lab, Race Weekend, save library (IndexedDB), VI/EN.

## [0.1.0] — Phase 0: Foundation
- Scaffold Next.js 15 + TS strict + Tailwind v4 + shadcn/ui + next-intl (không locale prefix — deviation có ghi chú), i18n VI/EN từ ngày 0, schema introspect fixture từ save thật volta24 1.11.0.
