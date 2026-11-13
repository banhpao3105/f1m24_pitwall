# Changelog

Tất cả thay đổi đáng chú ý của F1 Pit Wall. Format theo [Keep a Changelog](https://keepachangelog.com/), version theo [SemVer](https://semver.org/).

## [0.4.1] — Bugfix: pace đối trọng, dedupe nhân sự, khôi phục Parts/Finance, hiển thị tên

Báo cáo lỗi từ chủ dự án sau Phase 3 + điều tra trên save thật (F1M24 1.11.0.498643).

### Fixed — Race Weekend ghi sai đối thủ pace (nghiêm trọng)
- Race Weekend lấy tên đối thủ từ `rivals[0]` (đội **nhanh nhất** trong nhóm rival) trong khi `playerVsRivalS` tính với `rivalRef` (đội **gần pace nhất**) → hiện "nhanh hơn Red Bull 0.090s" trong khi sự thật là "nhanh hơn **Alpine** 0.090s, chậm hơn Red Bull 1.731s". Home view tự tính đúng, Race Weekend sai.
- Fix tại nguồn: `pace.engine` xuất thêm **`rivalRef`** vào `PaceBoard` (đội duy nhất mà `playerVsRivalS` đo chống lại); `RaceWeekendView` + `WallHomeView` đều dùng chung — UI không còn tự suy luận lại. Regression test: `rivalRef` theo pace proximity, không theo thứ tự danh sách.

### Fixed — Strategy: duplicate key + khuyến nghị tự mâu thuẫn
- `Staff_Contracts` là **lịch sử hợp đồng** (1 người nhiều dòng khi gia hạn — verified save thật). Engine giờ dedupe về **1 dòng/người** (hợp đồng hiện hành: StartDay lớn nhất ≤ day hiện tại, tie-break EndSeason cao nhất; model giữ nguyên dòng thô cho Gazette transfers). Hết duplicate React keys + double rows.
- `Staff_ContractPatience` lưu **1 dòng/(staff, team)** — 11 dòng/người ở save 11 đội. Repo giờ map `TeamID` + các cột verified thật (`SuitabilityRating`/`TeamOpinionRating`/`ContractAcceptanceThreshold` — trước giờ toàn NULL), engine lọc về **dòng của đội người chơi** → FA intel hiện số liệu thật thay vì "—" và không còn key trùng.
- Khuyến nghị expertise dùng `>= median` → cả giải bằng 0 thì median 0, 0 ≥ 0 thành "**trên** median" trong khi hạng chót. So sánh nghiêm ngặt + 3 nhánh văn bản (trên / bằng / dưới) + ghi chú "toàn bộ N đội đang bằng 0" khi đúng vậy; `riskIfIgnored` chỉ khi thật sự dưới median.

### Fixed — lớp parser làm rỗng Parts / Finance / Regulations (gốc rễ Car Lab "suy giảm")
- **`pkCandidates` sai convention**: sinh `<Table>ID` (`Parts_DesignsID`) nhưng F1M24 đặt PK theo **số ít** (`DesignID`, `ItemID`, `ProposalID`) → **mọi dòng** Parts_Designs/Parts_Items/Regulations_Proposals bị âm thầm bỏ qua. Đây là lý do Car Lab vào "chế độ suy giảm" dù save có đủ bảng Parts. Fix: derive số ít từ segment cuối.
- **`Finance_Transactions` không có cột PK** — `txId == null → skip` làm rỗng toàn bộ giao dịch (finance snapshot trước giờ chỉ có balance). Fallback row-index khi bảng không có cột id.
- Car Lab khi parts đã map + khoẻ mạnh → rec "**Không có part nào trong vùng rủi ro**" thay vì rec "chế độ suy giảm" (rec suy giảm chỉ khi `!hasPartsData` hoặc parts rỗng). Dev queue trống là **bình thường** ở schema F1M24 (không có cột design points — `Parts_Designs.Points` không tồn tại; league vẫn theo pace fallback, ghi rõ).
- PartType/TransactionType số ("0", "22") giờ resolve qua **enum table của chính save** (`Parts_Enum_Type`, `Finance_Enum_TransactionType`) — đọc được "FrontWing", "PartDesign" mà không hardcode lookup trong app. Save thật sau fix: 9 nhóm part + 17 nhóm chi + 6 regulation proposals hiện đầy đủ.

### Fixed — hiển thị
- **Tên đường đua thô** (`AlbertPark`, `SpaFrancorchamps`) → `src/lib/track-display.ts` port map `TRACKS` từ oracle (26 track, VI/EN theo oracle tracks.js ~line 9788), áp ở Home/TyreLab/RaceWeekend/Season (+CSV)/Gazette/CommandPalette. Key lạ pass-through, không bịa tên.
- **"Pato OWard" mất dấu nháy** — save chứa localization KEY (`[StaffName_Surname_OWard]`, game tự thêm dấu nháy khi runtime). Thêm bảng `STAFF_NAME_DISPLAY_PATCHES` có chủ đích + ghi chú (OWard → O'Ward, DeLaRosa → de la Rosa, dosSantos → dos Santos, Barichello → Barrichello) — deviation có tài liệu so với oracle names.js.
- **Tyre Lab mâu thuẫn số pit**: "số pit kỳ vọng ~3" (trung bình cánh quân) vs plan 1 pit → thêm dòng đối chiếu khi hai số khác nhau: kỳ vọng = tham khảo cánh quân từ `{source}`, plan = tối ưu tổng thời gian trên lốp của đội bạn; label đổi thành "Trung bình pit của cánh quân".
- **Toast "Đã khôi phục save"** giờ tối đa **1 lần/kỳ tải trang** (module guard — chống remount/Fast Refresh), tự tắt sau 2.5 s; 6 lần chuyển view không toast lại (verify browser).

### Verified trên save thật (browser + harness)
- Race Weekend: "0.090s/vòng **nhanh so với Alpine**" (trước: Red Bull — sai).
- Strategy: "Cả giải chưa bank expertise nào (toàn bộ 0)…", finance snapshot 20.1M/64.2M/chi-điểm 3.2M + categories có tên, 229 contract rows duy nhất, FA intel có số liệu, **console sạch duplicate-key**.
- Car Lab: durability 9 nhóm (Body 97%…), rec khoẻ mạnh; Gazette chặng đã đấu (Albert Park — Verstappen wire-to-wire) + tên track VI/EN đúng.
- Toast 1 lần/kỳ tải; không overflow 375/1440.

## [0.4.0] — Phase 3: Gazette + Polish

Phase 3 theo `docs/05-ROADMAP-STANDARDS.md` — Definition of Done đối chiếu ở cuối mục này.

### Added — Gazette (narrative, tách khỏi engine quyết định theo docs/03 §5.10)
- **`src/engines/gazette.engine.ts`** — port trung thành từ oracle Gazette v2.2: race report (gap = `Time − winnerTime`, tính từ `totalTimeMs`), aggregates (`SuccessfulOvertakes`, SC/VSC), fastest lap + kỷ lục đường đua (tolerance 0,5 ms), pit nhanh nhất, comeback (gain ≥ 5), **transfers** từ `Staff_Contracts ContractType=3` (đội hiện tại từ kết quả chặng, fallback `ContractType=0`; lọc cùng đội + ngoài F1; ưu tiên đội người chơi rồi F1↔F1), **odds** (`OVERROUND 1.15`, baseline đội 2.5 / tay đua 1.2, clamp 1.05–67), **favorites** (form theo TypeOfTrack của chặng kế tiếp, < 2 chặng → cả mùa), **dark horse** (≥ 6 chặng, recent 3 vs early, ngưỡng 1.5/1.0, loại favourite), **trivia** (số lần đua, last winner, most wins, lap record). Quote banks deterministic: seed = `winner.driverId + raceId` v.v. — cùng save → cùng số, không random mỗi lần load. Narrative trả `recommendations: []` đúng thiết kế — không ảnh hưởng khuyến nghị.
- **GazetteView** (`?view=gazette&race=N`): masthead (Vol/No/Season), headline + subhead + para (weatherLine/safetyCarLine/flRecord/lead — compose bằng next-intl, không string trần), bảng kết quả (gap/overtakes), awards, highlights, transfers + quote, next-race preview (trivia + odds + dark horse), team watch, provenance. Nhóm NARRATIVE (màu gold) trong WallNav. Trạng thái chưa đua/không tìm thấy rõ ràng.
- **Model v1.1**: `RaceResult.totalTimeMs/overtakes/safetyCarDeployments/vscDeployments`, `Weather.practiceRain/qualifyingRain`, track facts (`trackLengthKm/trackType/trackFirstRaceYear/trackFastestLap*`), `StaffContractRow.startDay/endSeason`.
- **Repository soft-select** (`races.repo.ts`): đọc cột từ sqlite_master trước, cột thiếu → NULL → undefined (không vỡ parse với save tối giản/schema khác F1M24). Parity oracle: `removeTrailingDigit` cho tên sinh từ key ("Mini1" → "Mini") + `cleanStaffName` áp cho `drivers[].fullName`.

### Added — Palette + keyboard
- **Command palette** `Cmd/Ctrl+K` (cmdk + shadcn CommandDialog): nhóm Navigate (9 module, shortcut 1–9 — bỏ qua khi đang gõ trong input), Races (nhảy Race Weekend + Gazette từng chặng đã đua), Actions (đổi ngôn ngữ). State `paletteOpen` trong `ui.store` (không persist).

### Added — PWA offline + persistence
- **Auto-restore**: pointer `pitwall:last-active` trong IndexedDB; mở lại app → khôi phục save gần nhất (race-guard khi đang parse), toast xác nhận, badge "đang mở" trong Library, xoá save gỡ pointer. "Mở lại không cần nạp lại file" đạt.
- **PWA shell**: `manifest.webmanifest` + icon (SVG tự vẽ → PNG 192/512 qua sharp) + `sw.js` thủ công (precache shell; navigate network-first fallback cache; static stale-while-revalidate) — **chỉ register ở production build** (dev không register để không vỡ HMR).

### Added — Export
- **Print/PDF cho Gazette**: toolbar "In / Xuất PDF" (`window.print`) + `@media print` (nền trắng, ink override, ẩn chrome/nav/footer/library/toast, bảng không cắt giữa dòng).
- **CSV Season**: đã có từ Phase 2 — được khoá bằng component test (Blob UTF-8 BOM EF BB BF + anchor download).

### Added — Motion polish (docs/06 §6.4)
- **NumberTween** (useSpring + `useReducedMotion` — first paint không animate) áp cho KPI điểm + hạng xe; live-pulse dot cho trạng thái đang đua (state=1); stagger chuẩn 0.04 s (SeasonView). Reduced-motion vẫn có kill-switch CSS toàn cục từ Phase 0.

### Fixed
- `listSaves()` lọc pointer `pitwall:last-active` (đưa vào crash `meta of undefined` khi lưu pointer chung store — phát hiện qua browser test).
- Gazette engine key theo **activeRaceId** (deep-link không có `race` → chặng hoàn thành gần nhất), bỏ subhead trùng lặp.
- **A11y**: `--color-ink-faint` `#5c6b7d` (3,2:1) → `#7d8fa3` (≥ 4,8:1 trên mọi nền) — audit contrast WCAG AA cho text; các token khác đã đạt (ink 14,8 / soft 6,8 / danger 5,8 trên panel).

### Notes — Definition of Done đối chiếu (docs/05 Phase 3)
- Lighthouse ≥ 90 (desktop): **chưa đo được trong sandbox** — môi trường cấm `next build` (chỉ dev server) và không có Lighthouse; đo thay thế: parse save thật 7,5 MB → khuyến nghị đầu tiên **548 ms** (ngân sách < 10 s), engine Gazette 4 ms; không có overflow ngang ở 375/768/1024/1440.
- Không lỗi a11y nghiêm trọng: contrast AA text đạt; focus-visible + aria-label + badge text+icon giữ nguyên; responsive audit 4 breakpoint bằng screenshot.
- SW chỉ kích hoạt production — installability cần build thật để verify.

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
