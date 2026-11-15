# Changelog

Tất cả thay đổi đáng chú ý của F1 Pit Wall. Format theo [Keep a Changelog](https://keepachangelog.com/), version theo [SemVer](https://semver.org/).

## [0.8.0] — Đánh giá sức mạnh xe: aero theo từng bộ phận, % so với mạnh nhất / trung bình grid, head-to-head

Tính năng mới (minor bump) theo prompt v0.8.0. 3 bước + release, mỗi bước 1
commit + push + CI xanh. Nguyen muốn biết xe mình mạnh/yếu ở từng bộ phận
khí động học so với cả grid — đã kiểm chứng dữ liệu CÓ đủ trên save thật,
với 3 giới hạn trung thực khóa lại ngay từ đầu (xem "3 giới hạn").

### Added — Bước 1: parser loadout + engine sức mạnh aero (`5a8dce8`)

- **Sửa 2 lỗi parser phát hiện khi nghiên cứu (cả 2 đều vô hình vì chưa có
  code nào dùng):**
  - `Parts_CarLoadout` bị map theo cột `CarID` — bảng thật (F1M24 1.11.0,
    đã introspect) là `(TeamID, LoadoutID, PartType, DesignID, ItemID)`,
    KHÔNG có `CarID` ⇒ `model.parts.loadouts` luôn rỗng trên save thật.
    `CarLoadoutRow` đổi thành `{teamId, loadoutId, partType, designId,
    itemId}`; hàng `DesignID` NULL được GIỮ (fallback cần nó).
  - Cột chỉ số thật là `PartStat` (số) — danh sách candidate cũ không có
    tên này nên mọi stat đều dán nhãn rác "stat-1", mất hết định danh chỉ
    số. Giờ resolve qua enum của chính save (`Parts_Enum_Stats`, Value →
    Name) đúng mẫu `PartType`. Thêm `PartDesign.dayCompleted`
    (`Parts_Designs.DayCompleted`) cho bộ lọc fallback.
  - Kiểm chứng live (`scripts/audit-carstrength-v080.ts` trên
    `upload/save1.sav`): loadouts **198 hàng** (trước: 0); L1 đội người
    chơi = Body 724 / FrontWing 722 / RearWing 723 / SidePods 650 / Floor
    692 (đúng DesignID đã xác minh).
- **Engine mới `car-strength.engine.ts`** (`buildCarStrength`): với mỗi bộ
  phận aero (Body, FrontWing, RearWing, SidePods, Floor — enum 3–7) × mỗi
  chỉ số aero mà bộ phận đó có thật (8 chỉ số: AirFlowFront,
  AirFlowTolerance, DRSDelta, DragReduction, Low/Med/HighSpeedDownforce,
  AirFlowMiddle): `playerValue` + `playerSource` ('installed' | 'latest' |
  'unknown'), `bestTeamId/Name/Value` (**mạnh nhất TỪNG chỉ số**), `mean`,
  `pctBest`, `pctMean` (làm tròn 1 chữ số thập phân), `rivalValue` cho
  head-to-head (mặc định Williams 6, đổi được qua tham số). Quy tắc xác
  định linh kiện hiện tại (khóa): L1 đang gắn → fallback thiết kế mới nhất
  **đã hoàn thành** (`DayCompleted > 0`, max day, có nhãn 'latest') → không
  có thì 'unknown', không điền 0. Chỉ tính 11 đội F1 (`formula === 1`,
  Prema/F2 loại). Giá trị từ cột `Value` của `Parts_Designs_StatValues`
  (thang ~0–1000, cùng bộ phận + cùng chỉ số mới so sánh được).
- **Test khóa bảng DoD 22 hàng** (save post-Monza Day 46636 không có trong
  sandbox — khóa bằng fixture từ số đã xác minh, đúng mẫu v0.7.x): 22/22
  hàng khớp giá trị bạn / mạnh nhất (tên + số) / TB grid / Williams; % lệch
  ≤ 0.1 trên 2 hàng (làm tròn kép — tài liệu hóa trong test), các hàng
  headline đúng tuyệt đối (32.4%, 36.9%, 69.2%, 75.4%, 96.4%, 102.6%); 3
  trường hợp fallback thật (Red Bull FrontWing → 763 day 46492, Red Bull
  RearWing → 840 day 46546, Williams SidePods → 843 day 46547) ra nguồn
  'latest' đúng DesignID — và thiết kế fallback CÓ THỂ là "mạnh nhất"
  (Red Bull RearWing DRSDelta 815.0, nhãn nguồn ở cả bảng lẫn UI); 1 trường
  hợp `unknown` (bỏ cả loadout lẫn design hoàn thành) → hàng đó `unknown`,
  KHÔNG có số. Trên save post-Monza, xe bạn **không bao giờ là mạnh nhất**
  (AI mạnh hơn ở save đó) mà **vượt TB grid ở đúng 4 chỉ số** (FW
  AirFlowFront 102.6%, FW Low DF 102.4%, RW DRSDelta 101.7%, RW
  DragReduction 102.5%). Suite: 356/356, build 4/4.

### Added — Bước 2: section "Sức mạnh khí động học" trong Car Lab (`180fba7`)

- Đặt ngay sau section League. Bảng nhóm theo 5 bộ phận, mỗi hàng một chỉ
  số: chỉ số | xe bạn (giá trị + nhãn nguồn đang gắn / thiết kế mới nhất /
  không rõ) | mạnh nhất (tên đội + giá trị; nhãn nguồn khi dùng fallback) |
  % mạnh nhất | % TB grid | đối thủ (giá trị + delta = rival − player, dấu
  +/−). Hàng % mạnh nhất < 60% tô đỏ (chỉ trình bày, không chấm điểm).
- Biểu đồ grouped-bar (`CarStrengthChart`): 2 cột mỗi hàng (% so với mạnh
  nhất — teal người chơi, đỏ khi yếu; % so với TB grid — xám) + đường mốc
  vàng 100% = mạnh nhất từng chỉ số. Lấy ĐÚNG số từ cùng engine output với
  bảng (không tính lại — test khóa).
- Head-to-head: dropdown 10 đội F1 còn lại (mặc định Williams), đổi đối thủ
  tính lại engine trong bộ nhớ (không nạp lại save); dòng "Bảng đội" hiện
  khoảng cách điểm thật (Williams 95 vs CustomTeam 92 trên save DoD; trên
  save kiểm chứng live: Williams 26 vs CustomTeam 20). Cột bạn/mạnh nhất/TB
  không đổi khi đổi đối thủ.
- Ghi chú trung thực (bắt buộc, vi + en): "Mạnh nhất" là mạnh nhất TỪNG
  chỉ số; hàng fallback có nhãn; save không có công thức đổi aero → thời
  gian vòng nên % là % GIÁ TRỊ CHỈ SỐ, không phải % thời gian vòng — pace
  đã quan sát nằm ở section League ngay trên (không đổi).
- **Kiểm chứng live trên save thật** (`upload/save1.sav`, day 46495 — save
  post-Monza không có trong sandbox): 22 hàng render đúng, giá trị xe bạn
  khớp bảng DoD 22/22, đổi đối thủ sang Red Bull cập nhật đúng cột đối thủ
  theo engine (774.7 trên save này), i18n VI/EN đều hoạt động, các section
  League / Durability / Dev queue không đổi, 0 console error. Hình học bar
  của biểu đồ xác minh qua DOM (44/44 bar visible) — ảnh chụp full-page co
  chart về 0 trong quá trình capture (artifact của tool, không phải app;
  0 cảnh báo trên load sạch). Screenshot trong `.shots/`.

### Added — Bước 3: release

- `package.json` 0.7.2 → **0.8.0**; SW cache `pitwall-v0.8.0`.

### 3 giới hạn trung thực (khóa từ đầu, không phải thiếu sót)

1. **% theo từng chỉ số, không quy đổi ra thời gian vòng** — save không
   chứa công thức đổi chỉ số aero ra giây/vòng; mọi % trong tính năng này
   là % giá trị chỉ số (so với mạnh nhất / TB grid), UI ghi rõ.
2. **Fallback có nhãn** — hàng nào (của bạn, của đội mạnh nhất, của đối
   thủ) dùng thiết kế mới nhất đã hoàn thành thay vì linh kiện đang gắn
   đều hiện nhãn "thiết kế mới nhất".
3. **Không có điểm tổng hợp** — CẤM gộp chỉ số bằng trọng số tự chọn
   (quy tắc từ v0.5.6): mỗi chỉ số một hàng, "mạnh nhất" tính theo từng
   chỉ số, không xếp hạng chung.

### Out of scope (để v0.8.1+)

Powertrain (Engine/ERS/Gearbox) + Suspension cùng cơ chế; gợi ý "nên phát
triển bộ phận nào trước"; aero theo từng đường đua
(`Parts_RecommendedTrackStats`).

## [0.7.2] — Card kho lốp từng xe hiện số của ĐÚNG xe đó (không phải số cả đội)

Một bước + release theo prompt v0.7.2. Bối cảnh: kiểm chứng v0.7.1 trên cây
đã push (`audit-monza-v071.log`, live UI) thấy engine pass 5/5 DoD trên save
Monza thật (`carTeamsVerified=true`, cap {S 24, M 36, H 55}, grid theo phân
hạng, 57.6s/57.6s/75.0s, practice 3=3, delta M +0.03s), test 326/326, CI
xanh — nhưng còn **1 lỗi hiển thị cùng họ với lỗi fallback của 0.7.0** (hiện
sai phạm vi, chỉ xuống một cấp: từ toàn giải thành cả đội).

### Fixed — card từng xe aggregate từ `car.sets` của chính xe đó (`d00066a`)

- **Bug (xác minh live + trong code):** section "Kho lốp trước race" render
  2 card Xe 1 (CarID 20) / Xe 2 (CarID 21) — nhưng cả 2 card đều hiện **số
  của cả đội**: S mới ×6 · đã dùng ×10. Số thật từng xe trong save Monza
  pre-race: mỗi xe chỉ có **S mới ×3 · đã dùng ×5**. Nguyên nhân:
  `TyreLabView.tsx:391` — trong `inventory.cars.map(...)` (card đã có đúng
  header `car.label` + `CarID`), danh sách lốp lại render từ
  `inventory.teamAggregate` thay vì `car.sets` của chính xe đó. Engine đã
  có đủ dữ liệu từng xe (`InventoryCar.sets`, `perCarMaxStint` đúng cả 2
  xe) — lỗi thuần view.
- **Sửa (engine + view, không đổi số engine nào):** tách công thức
  aggregate trong `buildTyreInventory` thành helper dùng chung
  `aggregateSets(sets)` — cùng công thức cho cả `teamAggregate` (hợp 2 xe
  người chơi, giữ nguyên là cơ sở của cap) lẫn field mới
  `InventoryCar.aggregate` (tính từ `car.sets`). View: từng card render
  `car.aggregate` (lọc S/M/H như cũ); `teamAggregate` chỉ hiện **MỘT lần**
  ngoài vòng lặp card, dòng "Cả đội ({n} xe) — cơ sở của cap" (i18n mới
  vi + en), CẤM render teamAggregate trong card xe. Định dạng hiển thị
  thu gọn khoảng suy biến (min = max → một giá trị: "mòn 74%, đời 41",
  "đời 20") đúng chuỗi DoD. Không đổi: `maxStint`, `perCarMaxStint`, cap,
  plan, delta, confidence, pit cost 20.7s, định nghĩa `fresh`/`wear`/
  `available`.
- **Test khóa lỗi (red → green):** component test
  (`tests/components/v072-tyre-inventory.test.tsx`) chạy TRƯỚC khi sửa và
  FAIL đúng lỗi trên code cũ — card Xe 1 hiện số đội ("mới ×2 (đời 55) ·
  đã dùng ×2 (mòn 74–74%, đời 41–41)") thay vì số xe ("mới ×3 (đời 24) ·
  đã dùng ×5 (mòn 65–90%, đời 16–22)"); sau sửa pass, kèm invariant
  "mới ×6 (đời 24)" xuất hiện đúng 1 lần toàn section và không nằm trong
  card nào. Fixture engine đổi sang **số từng xe thật của Monza** (2 xe
  KHÁC nhau, xem bảng dưới) — khóa per-car aggregate, team union, và cap
  không đổi {S 24, M 36, H 55} per car lẫn toàn đội. Suite: **333/333**,
  build 4/4.
- **Số liệu từng xe (Monza pre-race, save4.sav, Day 46635, race 202 —
  wear = min 4 bánh, mới = FrontLeftWear ≥ 0.99, lock trong test):**
  - Xe 1 (CarID 20): S mới ×3 (đời 24) · đã dùng ×5 (mòn 65–90%, đời
    16–22); M mới ×1 (đời 36) · đã dùng ×2 (mòn 60–82%, đời 22–29); H mới
    ×1 (đời 55) · đã dùng ×1 (mòn 74%, đời 41).
  - Xe 2 (CarID 21): S mới ×3 (đời 24) · đã dùng ×5 (mòn 54–90%, đời
    13–22); M mới ×1 (đời 36) · đã dùng ×2 (mòn 55–57%, đời 20 — cả 2 bộ
    đều đời 20); H mới ×1 (đời 55) · đã dùng ×1 (mòn 74%, đời 41).
  - Cả đội (đúng như cũ, giờ ghi nhãn rõ, hiện 1 lần): S mới ×6 (đời 24) ·
    đã dùng ×10 (mòn 54–90%, đời 13–22); M mới ×2 (đời 36) · đã dùng ×4
    (mòn 55–82%, đời 20–29); H mới ×2 (đời 55) · đã dùng ×2 (mòn 74%,
    đời 41).
- **Kiểm chứng live UI trên save thật** (`upload/save1.sav` — Bahrain
  pre-race, race 193, day 46495, qua trình duyệt thật): 2 card hiện số
  KHÁC nhau đúng số engine (Xe 1: S mới ×2 · đã dùng ×6 (mòn 69–92%, đời
  23–31); Xe 2: S mới ×3 · đã dùng ×5 (mòn 71–92%, đời 23–30) — nếu card
  vẫn hiện số đội thì 2 card sẽ giống hệt nhau "mới ×5"); dòng cả đội
  (S mới ×5 · đã dùng ×11) đúng 1 lần; cap header S 33 / M 46 / H 59;
  0 console error. Script đối chiếu: `scripts/audit-inventory-v072.ts`
  (in aggregate từng xe từ engine trên cùng save để so 1:1 với UI).

### Tồn đọng (đã ghi nhận khi kiểm chứng, KHÔNG sửa trong 0.7.2)

- Mapping ghế lái CarID → tay đua: `resolveCarDrivers` không map được ghế
  nào trên save thật (model có 12 tay đua mang teamId 32 từ
  `Staff_Contracts` lịch sử; guard `drivers.length !== 2` bỏ qua cả đội —
  fail-safe, nhưng đường ghế-xác-minh chưa chạy được trên save thật). Cần
  thiết kế riêng (vd chỉ xét tay đua có mặt ở quali/practice chặng đó) —
  để bản sau.

## [0.7.1] — Sửa 2 lỗi DoD của 0.7.0 (grid + kho lốp) + thống nhất số liệu practice

Năm bước theo prompt v0.7.1. Bối cảnh: kiểm chứng v0.7.0 trên cây đã push
chỉ ra **2 lỗi DoD trên save thật** — cả hai cùng một mẫu: *code đúng với
fixture, sai với save thật* (đúng kiểu bẫy đã gặp ở v0.6.2 mapping lốp và
v0.6.1 fixture hardcode delta). Mỗi bước = 1 commit, cửa xanh (lint +
typecheck + test 326/326) trước MỖI commit.

### Hai lỗi gốc của 0.7.0 (và chỗ sửa)

1. **Grid sai (lỗi A).** Engine xuất grid = thứ tự phân hạng thuần: Piastri
   P7, O'Ward P21, Ricciardo P22 — thực tế sau race: P22 / P20 / P21. Nguyên
   nhân: save trước race **không có phạt nào chưa chấp hành** (9 dòng
   `Races_GridPenalties` đều `Served=1`); cú phạt đẩy Piastri về P22 chỉ có
   trong save SAU race (dòng 40: Team 2 Car 2, Reason 5 ParcFerme,
   PitLaneStart 1). DoD "grid khớp `StartingPos` cả 22 xe" của prompt v0.7.0
   là claim kiểm chứng sai (đọc nhầm dòng phạt team 2), và test của bước 2
   v0.7.0 pass chỉ vì fixture tự bịa một phạt chưa chấp hành không có trong
   save thật. → Sửa ở **bước 3** (`91db97f`).
2. **Cap kho lốp không siết (lỗi B).** `maxStint` vẫn là đời model
   {S26, M39, H60}, plan vẫn 51.7s — CHANGELOG 0.7.0 ghi 57.6s là **sai trên
   save thật**. Hai nguyên nhân đều đã xác minh trong code: (a) công thức
   kiểm tra `Save_CarConfig` (`floor(loadoutId/2)+1`) tính ra 1 cho mọi dòng
   thật (`LoadoutID` chỉ là {0,1} theo từng đội) → fail ngay dòng thứ 2 →
   `carTeamsVerified` luôn false → rơi fallback; (b) fallback gộp **cả 440
   bộ toàn giải** thay vì 2 xe người chơi → cap = max đời toàn giải, không
   bao giờ siết. → Sửa ở **bước 1** (`1557a27`) + **bước 2** (`af828f1`).

### Fixed — Bước 1: kiểm tra `Save_CarConfig` theo đúng shape thật (`1557a27`)
- Kiểm tra mới: tập 22 cặp `(teamIndex, loadoutId)` phải đúng bằng
  {(t,0),(t,1) : t ∈ 1..11} (so Set, không còn công thức floor). Sửa comment
  sai trong `car-config.repo.ts`: `LoadoutID` là ghế 0/1 theo từng đội
  (KHÔNG phải CarID 0–21); `TeamID` ở bảng này là chỉ số đội tuần tự 1..11
  (KHÔNG phải FK `Teams.TeamID`) — giả định còn lại (thứ tự đội F1 theo
  TeamID tăng dần, đội 11 = TeamID 32 CustomTeam → CarID 20/21) được ghi rõ
  là giả định có căn cứ, không phải bằng chứng tuyệt đối.
- Audit trên save thật (`scripts/audit-monza-v071.ts`, save1.sav race 193):
  `carTeamsVerified: true` — lần đầu tiên bảng này pass trên save thật.
- Test mới dùng đúng 22 dòng thật của Monza (verified true) + fixture phủ
  định thiếu 1 cặp (false), trùng cặp (false), shape "LoadoutID 0..21" cũ
  (false).

### Fixed — Bước 2: kho lốp fallback chỉ tính 2 xe người chơi (`af828f1`)
- Xóa nhánh `model.tyres.map(...)` — `allSets` LUÔN là `cars.flatMap(c =>
  c.sets)` (2 xe người chơi). Cờ `perCar` chỉ quyết định nhãn hiển thị,
  không bao giờ phạm vi dữ liệu. Không có mapping CarID→đội → inventory
  null (thiếu trung thực thay vì đoán toàn giải).
- Expose `perCarMaxStint` (cap từng xe, khóa theo CarID); `maxStint` đội là
  min qua 2 xe — chỉ là con số hiển thị tổng hợp thận trọng. Plan tách 2 xe
  tính giá từng xe trên cap ĐÚNG XE đó khi ghế đã xác minh (cap đội là
  fallback cho ghế chưa xác minh — không bao giờ định giá xe trên ph đoán).
- **Plan của game cũng được tính lại giá dưới cap kho lốp** (cùng cơ sở với
  mọi plan xếp hạng): Monza M→H pit 25 = **75.0s** trên cap (deg M24 7.2s /
  H29 8.1s), thay vì 72.5s theo đời model — so sánh web↔game cùng cơ sở.
- DoD save Monza pre-race (số lock trong test trên fixture số liệu thật):
  `teamAggregate` mới **S ×6 (đời 24), M ×2 (36), H ×2 (55)**; đã dùng
  S ×10, M ×4, H ×2 — không còn ×44/×24/×23 toàn giải. `maxStint` =
  {S 24, M 36, H 55}; per-car caps cả 2 xe = {S 24, M 36, H 55}.
- Test khóa trực tiếp lỗi: fixture mang ĐỦ 2 phía số thật (toàn giải mới
  44/24/23 vs đội 6/2/2 + 10/4/2), ép `perCar=false` → aggregate vẫn là số
  2 xe. Test khóa cả 2 đường định giá (per-car + team) bằng fixture kho lệch
  nhau giữa 2 xe: lead chạy tối ưu trên cap đúng xe mình, trail bị siết bởi
  cap xe trail.

### Fixed — Bước 3: grid trung thực với những gì save chứa (`91db97f`)
- **Rút lại DoD sai của 0.7.0** (chi tiết trong mục 0.7.0 bên dưới). Grid
  suy từ save pre-race Monza = thuần phân hạng: **Piastri P7, O'Ward P21,
  Ricciardo P22** — P20/P21 chỉ đúng sau race, khi save mới chứa phạt.
- Phạt chưa gán được ghế XÁC MINH → **KHÔNG áp**, tính unresolved (kèm chi
  tiết đội + xe + lý do trong `unresolvedList` mới). Áp một phạt vào nhầm
  tay đua tệ hơn không áp. DoD fixture: 1 phạt pending + tín hiệu ghế chết
  → grid không đổi, `unresolvedPenalties = 1`, `appliedPenalties = 0`.
- UI: thẻ "Grid xuất phát" mới ở Race Weekend — mỗi dòng P{n}, hiện cả
  `qualiPos` lẫn `gridPos` khi khác nhau, ghi chú rõ khi
  `appliedPenalties = 0` ("Phạt sau quali chỉ xuất hiện khi load save mới
  hơn — kiểm tra lại trước race"), và liệt kê các phạt unresolved. Tyre Lab
  (carPlans) hiện cùng ghi chú: gridPos của lead/trail trên save này là
  P21/P22 (phân hạng), không bao giờ P20/P21.
- Test: fixture phạt tự bịa gắn nhãn **SYNTHETIC — test-only**; thêm test
  khóa save thật (9 dòng đều Served=1 → grid = quali order, applied 0,
  unresolved 0) — test này FAIL nếu ai đó ép grid về P22/P20/P21 từ save
  này; carPlans khóa grid P21/P22 thật.

### Docs — Bước 4: audit lại từ save thật + rút lại claim 0.7.0 (`7403bb5`)
- Chạy lại audit bằng engine đã sửa (script `scripts/audit-monza-v071.ts`).
  **Lưu ý trung thực:** save Monza pre-race (save4.db) không còn trong môi
  trường làm việc — số Monza bên dưới chạy qua CÙNG các engine đó trong
  bộ test, trên fixture dựng từ đúng các số đã chủ-verify của save Monza;
  chân audit trên save thật dùng save1.sav (race 193 Bahrain, pre-race).
- **Số Monza sau sửa (lock trong test, KHÔNG copy từ prompt):** lead
  O'Ward S(19)→M(34) pit V19 = **57.6s** (độ mòn S19 12.5s / M34 23.3s);
  trail Ricciardo M(34)→S(19) pit V34 = **57.6s** (hòa tuyệt đối, pit cách
  15 vòng); game plan M→H (M24+H29, pit 25) = **75.0s**. Trên save thật tại
  thời điểm 0.7.0: plan là 51.7s (cap không siết) và grid là P21/P22.
- Mục 0.7.0 trong CHANGELOG: rút claim "grid khớp StartingPos 22/22", sửa
  mô tả sai shape `Save_CarConfig`, ghi rõ 57.6s chỉ đúng sau 0.7.1 — từng
  chỗ có chú thích inline, không xóa lịch sử.

### Fixed — Bước 5: một pipeline báo cáo duy nhất cho số liệu practice (`a552076`)
- **Một định nghĩa:** `practiceSessions` = số session practice **F1** có
  mặt trong save (lọc `RaceFormula = 1` — session 1 còn có sân F2/F3),
  tính MỘT lần trong `assessReadiness`, truyền qua `readiness`; TyreLab
  không tự tính lại. `getPracticePace` giữ số session cho ra gap nhưng đổi
  tên thành **`sessionsMeasured`** (Monza: 2); evidence hiện dạng
  "(2/3 session đo được delta)". GetPracticePace cũng chỉ pools lap F1.
- **Delta M một số duy nhất:** delta xếp hạng = giá trị đo (raw, làm tròn
  2 chữ số) cho cả M và H — floor 0.05 của M CHỈ còn áp khi số đo
  degenerate (≤ 0). Trên Monza, median đo được thật (0.0285 → +0.03s)
  không còn bị ghi đè bằng 0.05 bịa (mỗi tổng thời gian trước đây lệch
  +0.6s không có bằng chứng). Giới hạn trên (M ≤ 2.5, H ∈ [0.1, 3.5]) và
  quy tắc đơn điệu H giữ nguyên; `clamped` chỉ đánh dấu khi một CLAMP thực
  sự kích hoạt (làm tròn không phải clamp). `paceMeasured.delta` = đúng
  delta xếp hạng (một nguồn); giá trị thô nằm ở `rawDeltas`/`rawDelta`.
- DoD save Monza: `readiness.practiceSessions = 3` = `TyreLab.practiceSessions`;
  `sessionsMeasured = 2`; delta M = **+0.03s** ở mọi nơi (ranking, evidence,
  UI), H = +1.32s; không còn "+0.05s" cho M. Test khóa: cùng một nguồn
  getPracticePace ↔ buildTyreLab; F2/F3 (89.0s nhanh hơn mọi lap F1 trong
  fixture) không bao giờ lọt vào pool pace; degenerate ≤ 0 vẫn floor 0.05.

### Technical
- `PracticeResult.raceFormula` đi qua build-model (cột mềm — schema cũ vẫn
  parse được); `DerivedGrid.unresolvedList` mới (additive).
- Không đổi: pillar confidence, hằng số deg/DEG_CLIFF, pit cost 20.7s,
  mapping lốp 0=H/1=M/2=S/3=I/4=W, quy tắc availability state 0, thuật toán
  xếp hạng plan. SW cache bump `pitwall-v0.7.1`.
- Cửa mỗi commit: lint + typecheck + test xanh (326/326 sau bước 5); audit
  save thật chạy lại sau bước 1, 2, 5.

## [0.7.0] — Cổng dữ liệu sau quali + kho lốp từng xe + tách chiến thuật 2 xe

Bốn bước theo prompt v0.7.0, dựa trên bằng chứng save thật (Monza 2027
pre-race save4.sav, Day 46635, race 202, 53 vòng — và 2 save 1.11 khác dùng
để xác minh enum/mapping). Nguyên tắc xuyên suốt: web KHÔNG được đưa ra dự
đoán nào trước khi người chơi load được save sau quali. **Lưu ý 0.7.1:**
một số claim của mục này chưa đủ căn cứ tại thời điểm release và đã được
rút lại/sửa — tìm các chú thích **[SỬA Ở 0.7.1]** / **[RÚT LẠI ở 0.7.1]**
bên dưới.

### Fixed — Bước 1: chữ "false" trong kết quả đội bạn (`2d656ef`)
- RaceWeekendView truyền `String(lastResult.dnf)` vào slot `{dnf}` của
  i18n `race.lastResult` — xe về đích thì câu hiện "P14 (0 pts)false" (bắt
  trực tiếp trên save sau race Monza). Slot là hậu tố: DNF nối " — DNF",
  về đích an toàn nối chuỗi rỗng. Component test khóa cả 2 nhánh.

### Added — Bước 2: cổng dữ liệu — không đoán chiến thuật trước quali (`84ae043`)
- `buildTyreLab` trả thêm `readiness` (additive): `{ allocation,
  practiceSessions, quali, grid, missing, ready }`. Plan CHỈ được tính và
  hiện khi đủ cả 3: `Save_CarTyreAllocation` có dòng cho chặng (allocation),
  ≥1 session practice có kết quả (practice), và suy được grid cuối từ
  `Races_QualifyingResults` (lọc `RaceFormula = 1`) + phạt
  `Races_GridPenalties` (quali). Chưa đủ → KHÔNG có plan nào trong kết quả
  (kể cả plan thuần model); chặng đã chạy xong không bao giờ "ready"
  (allocation bị xóa sau race — tính lại từ model rồi giới thiệu như đề
  xuất là bịa, đúng lỗi S(20)→M(33) vs S(19)→M(34) sau Monza).
- Tyre Lab hiện checklist 3 mục thiếu dữ liệu (mục nào thiếu ghi rõ cần
  load save nào); save giữa practice (đủ allocation + practice, chưa
  quali) được hiện delta practice đã đo với nhãn "Nháp — chưa đủ dữ liệu,
  chờ quali". KPI "KHUYẾN NGHỊ LỐP" ở Home hiện "Chưa đủ dữ liệu — chờ
  quali" thay vì plan cũ.
- **Dữ liệu mới đã xác minh trên save thật (1.11):** per-wheel wear
  (FrontRight/BackLeft/BackRight) + `LapsCompleted` + `SessionLastUsedIn`
  trên allocation; `LapCount` trên Races_PracticeResults;
  `RaceFormula`/`GridPenalty` trên dòng quali; bảng
  `Races_GridPenalties` (CarID = chỉ số xe trong đội 1–2, Served 0→1 khi
  đã áp; `ServeInRace`/`ServeInSprint`) và enum gốc của game
  `Races_Enum_PenaltyType` (0 ExceededEngineLimit 5, 1 ERS 5, 2 Gearbox 5,
  3 CausingCollision 3, 4 MajorCollision 5, 5 ParcFermeBreach 0).
  `Save_CarConfig` (22 dòng) là tín hiệu đối chiếu độc lập cho mapping
  CarID → đội. ~~22 dòng LoadoutID 0–21 → chỉ số đội F1 1..11 tuần tự~~
  **[SỬA Ở 0.7.1]** mô tả trên SAI về shape thật: `LoadoutID` chỉ là
  {0,1} THEO TỪNG ĐỘI (ghế 1/ghế 2), không phải CarID 0–21 toàn giải;
  bảng chứa đúng 22 cặp {(t,0),(t,1) : t ∈ 1..11}. Công thức kiểm tra
  cũ (floor(loadoutId/2)+1) tính ra 1 cho mọi dòng thật → fail ngay
  dòng thứ 2 → `carTeamsVerified` luôn false → toàn bộ kho lốp từng xe
  + cap của bước 3 rơi vào fallback. Đã sửa ở 0.7.1 bước 1 (kiểm tra
  theo tập cặp).
- **Suy grid (grid.engine):** mỗi tay đua lấy dòng `QualifyingStage` cao
  nhất → xếp (stage giảm dần, FinishingPos tăng dần) → áp phạt các dòng
  `Served = 0, ServeInRace = 1` (phạt vượt định mức/hội đồng/pit lane →
  cuối đoàn; phạt tính place lấy số vòng từ enum của game). ~~Đã đối chiếu
  khớp `StartingPos` sau race 22/22 tay đua trên một chặng thật, gồm đúng
  2 ca bẫy của Monza: driver 102 quali P7 → grid P22 (phạt cuối đoàn,
  dòng team 2) và driver 95 quali P8 → P7 (mọi xe dưới P7 tiến 1 bậc).~~
  **[RÚT LẠI ở 0.7.1]** Claim trên KHÔNG được kiểm chứng tại thời điểm
  release 0.7.0: save Monza pre-race có 9 dòng Races_GridPenalties và TẤT
  CẢ đều `Served = 1` (pending = 0) → grid suy được từ save này là thuần
  thứ tự phân hạng (Piastri P7, O'Ward P21, Ricciardo P22). Cú phạt đẩy
  Piastri về P22 chỉ tồn tại trong save SAU race (dòng 40: Team 2 Car 2,
  Reason 5 ParcFerme, PitLaneStart 1). Người viết prompt v0.7.0 đã đọc
  nhầm dòng phạt khi kiểm chứng, và test khóa claim dùng một fixture
  PHẠT TỰ BỊA không có trong save thật. 0.7.1 sửa: fixture gắn nhãn
  SYNTHETIC (chỉ phủ nhánh engine), thêm test khóa save thật (grid =
  quali order), phạt trên ghế chưa xác minh không còn được áp (unresolved).
  `GridPenalty` trong Races_QualifyingResults = 0 trên mọi save thật —
  phạt thật nằm ở Races_GridPenalties.
- **Mapping CarID → xe:** đội F1 (`Formula = 1`) xếp theo TeamID sở hữu
  cặp xe (0,1), (2,3)… — CustomTeam (TeamID 32, đội F1 thứ 11) = CarID
  20/21 (khớp đúng vị trí allocation của đội người chơi trên save Monza;
  xác minh chéo bằng chỉ số tuần tự 1..11 trong Save_CarConfig). CarID →
  TAY ĐUA dùng tín hiệu tổng vòng practice (`LapsCompleted` theo
  `SessionLastUsedIn` đối chiếu `LapCount` từng tay đua); không xác minh
  được thì nhãn "Xe 1 / Xe 2 — chưa xác minh xe nào là ai" và ghế phạt
  rơi về thứ tự StaffID, ghi rõ là giả định chưa verify.

### Added — Bước 3: kho lốp từng xe + kiểm tra tính khả thi của plan (`a933759`)
- `buildTyreInventory` đọc kho lốp ĐỘI NGƯỜI CHƠI theo từng xe: mỗi bộ có
  mòn = min 4 bánh, fresh = wear ≥ 0.99 (quy ước cũ của repo), còn dùng =
  `AvailabilityState = 0`. Save KHÔNG có bảng enum cho AvailabilityState
  (đã quét toàn bộ *_Enum trên save thật) — quy tắc state 0 là quy tắc
  bảo thủ được kiểm chứng: toàn bộ set fresh (trừ trùng dư) đều state 0,
  chỉ có state {0,2} xuất hiện trên 440 dòng thật, và rule này tái tạo
  đúng cap Monza đã đo.
- **Quy tắc khả thi:** `maxStint[C] = min(đời model[C], đời còn lại lớn
  nhất trong các bộ C còn dùng được)` — thay cap đời model. Mỗi plan xếp
  hạng được đánh giá lại dưới cap: không split nào khớp → loại, ghi rõ
  lý do (stint nào cần bộ bao nhiêu vòng); split khớp → giữ thứ hạng nhưng
  chia lại vòng và **tính lại giá trên đời bộ thật**.
- **Số Monza đổi 51.7s → 57.6s vì cap kho lốp (không phải lỗi):** deg
  M34 tăng 19.5s → 23.3s (đời 39 → 36), deg S19 tăng 10.5s → 12.5s (đời
  26 → 24); pace + pit giữ nguyên → S(19)→M(34) 1 pit = 57.6s. Lý do:
  lives 26/39/60 là median TOÀN giải, còn kho của đội chỉ có bộ S/M/H
  mới đời 24/36/55 (một phần số cũ 51.7s nằm lại ở `modelTimeS` — giá
  xếp hạng theo đời model, hiển thị cạnh giá thực thi).
  **[SỬA Ở 0.7.1]** con số 57.6s NÀY SAI trên save thật tại thời điểm
  release 0.7.0: cap kho lốp không bao giờ được áp (bước 1 — công thức
  CarConfig fail mọi save → fallback; bước 2 — fallback gộp TOÀN BỘ 440
  bộ của giải thay vì 2 xe người chơi → cap = max đời toàn giải, không
  bao giờ siết). Plan thực tế trên save Monza pre-race là 51.7s. 57.6s
  chỉ đúng SAU khi 0.7.1 sửa cả 2 lỗi gốc (xác nhận lại bằng engine đã
  sửa — test khóa Monza fixture + audit save thật; xem mục 0.7.1).
- Plan 2 pit M→S→M: 54.5s theo cap kho lốp / 52.7s theo đời model (locked
  trong test — dùng ở bước 4).
- Mỗi stint ghi rõ dùng bộ nào ("Mới (24)" / "Đã dùng (18.2)"); UI thêm
  bảng kho lốp trước race: S/M/H mới ×n (đời TB), đã dùng ×n (mòn %,
  đời còn lại), nhãn "chưa xác minh xe nào" khi chưa verify ghế.

### Added — Bước 4: tách chiến thuật 2 xe theo vị trí phân hạng (`ede2554`)
- Một plan cho cả đội = một điểm lỗi duy nhất (Silverstone: plan đơn S→H
  của web làm Ricciardo mất race trong khi O'Ward theo game lên P13).
  Giờ: **lead** = tay đua của đội có grid tốt hơn, chạy đúng output tối ưu
  của optimizer (đã qua cap kho lốp); **trail** = plan khả thi nhanh nhất
  mà MỌI vòng pit cách MỌI vòng pit của lead ≥ 3 vòng (quy tắc lệch CHÍNH
  LÀ cách xử lý double-stack — KHÔNG bịa hằng số phạt chờ pit). Ưu tiên
  plan khác compound xuất phát khi chênh lệch tổng thời gian so với plan
  tối ưu ≤ 2s (ngưỡng "hòa" của repo); nếu không có plan nào thỏa → giữ
  plan tối ưu nhưng dịch vòng pit xa nhất có thể + ghi rõ "chỉ lệch được
  X vòng".
- **Số Monza (locked trong test):** lead O'Ward P20: S(19)→M(34), 1 pit
  V19, 57.6s; trail Ricciardo P21: M(34)→S(19), 1 pit V34, 57.6s — hòa
  tuyệt đối (cùng multiset stint), khác compound xuất phát, pit cách nhau
  15 vòng. Plan 2 pit M→S→M (54.5s theo cap — nhanh hơn trên giấy)
  KHÔNG được chọn làm trail: pit đầu V21 chỉ cách V19 của lead 2 vòng
  (< 3). Test khóa trường hợp này. **[SỬA Ở 0.7.1]** (i) grid P20/P21 ở
  trên là grid SAU race suy từ một phạt TỰ BỊA trong fixture — save
  pre-race thật cho P21/P22 (thứ tự phân hạng); (ii) tổng 57.6s sai trên
  save thật tại 0.7.0 vì cap không bao giờ siết (xem sửa ở bước 3);
  (iii) sau khi 0.7.1 sửa xong, lead/trail giữ S(19)→M(34) / M(34)→S(19)
  57.6s trên grid đúng P21/P22.
- Confidence tính riêng từng plan (giữ nguyên các pillar v0.6.1); khi 2
  plan hòa: ghi chú "Hòa về tổng thời gian mô hình — tách để tránh dẫm
  chân + hedge, không phải vì nhanh hơn".
- **Giới hạn đã biết (ghi rõ trong assumptions, không giả vờ):** model
  không phân biệt deg của stint chạy đầu race (xe nặng xăng) với stint
  cuối — 2 plan cùng multiset stint có cùng tổng thời gian mô hình dù
  thứ tự khác nhau.

### Technical
- Parser: tyres/practice/quali repos đọc thêm cột (soft — schema cũ vẫn
  parse được); 2 repo mới `grid-penalties.repo.ts` + `car-config.repo.ts`;
  `SaveModel.gridPenalties` là section mềm (model cũ khôi phục từ
  IndexedDB vẫn chạy).
- Engine mới `src/engines/grid.engine.ts`: deriveGrid + assessReadiness +
  resolveCarDrivers + buildTyreInventory — hàm thuần, không React/DB.
- Không đổi: mapping lốp 0=H/1=M/2=S/3=I/4=W, DEG_FINAL/DEG_EXP/ngưỡng
  cliff, các pillar confidence, công thức xếp hạng, buildWetPlan.
- i18n vi/en đầy đủ cho checklist, kho lốp và 2 card plan; SW cache bump
  `pitwall-v0.7.0`.

## [0.6.3] — Timeline stint 1 hàng + nhãn vòng pit, retune vách mòn cho đời lốp H thật, 4 cosmetic

Ba nhóm việc theo prompt v0.6.3: (1) hồi quy UI v0.6.0 — chart stint bị tách
3 hàng; (2) hằng số vách mòn H không còn khớp dữ liệu tune sau khi mapping
v0.6.2 sửa xong (đời lốp H thật là 43 vòng, không phải 53 suy từ tỉ lệ);
(3) 4 cosmetic tồn từ review 0.6.0. Không đổi mapping lốp, không đổi
DEG_FINAL/DEG_EXP/ngưỡng cliff, không đổi pillars confidence, không đổi
công thức xếp hạng, không đổi số liệu practice thô.

### Fixed — Bước 1: timeline stint về 1 hàng, mỗi stint ghi vòng pit (`040e0b3`)
- **Nguyên nhân:** bước 3 của v0.6.0 đổi container thanh stint từ
  `flex h-9` thành `relative h-9` (để gắn cờ pit absolute lên trục vòng) —
  mất flex khiến các motion.div stint chồng thành 1 hàng mỗi stint, hàng
  cuối còn bị `overflow-hidden` cắt khuất (Montreal S21/S22/M27 thành 3 hàng).
- Container là `relative flex h-9` trở lại: cờ pit amber vẫn absolute trên
  trục vòng, stint ngồi cạnh nhau đúng 1 hàng (hành vi v0.5.6).
- Mỗi segment giờ ghi 2 dòng: dòng 1 hợp chất + số vòng (`S 21v`), dòng 2
  vòng pit của chính stint đó = toLap của stint (`pit V21`), khớp cột PIT
  của bảng stint và pitLaps của engine; stint cuối ghi `về đích`. Segment
  hẹp (< 12% thanh) rơi về dạng gọn `S·15` / `V37` — vòng pit không bao
  giờ bị mất khi truncate trên mobile (nhãn qua i18n `tyres.timeline`,
  vi/en; không hardcode tiếng Việt trong component).
- Hero plan ghi luôn vòng pit: `S(21) → S(22) → M(27) — 2 pit (V21, V43)`
  — biến `{pits}` mới trong `tyres.heroPlan` (vi/en), lấy từ
  `best.pitLaps`. Giữ nguyên: trục L0/L18/L35/L53/L70, cờ pit amber, dòng
  footer `Pit: 21, 43`, bảng stint, scroll ngang mobile.
- Regression test: container có flex + nhãn chứa V21/V43 (plan Montreal 3
  stint) + fallback dạng gọn segment hẹp.

### Changed — Bước 2: retune DEG_CLIFF.H cho đời lốp H thật 43 vòng (`65a58b3`)
- **Nguyên nhân:** 5.0 được grid-search ở v0.6.1 trên đời lốp H 53 (suy từ
  tỉ lệ durability — sai). Đời lốp H thật của save Silverstone 2027 là 43
  (audit v0.6.2 chỉ sửa mapping, không rà lại lives): stint H 35 vòng giờ
  vượt vách 0.6×43 = 25.8 tới 9.2 vòng (chứ không phải 3.2) và cliff bình
  phương theo số vòng vượt — `stintDegPenalty('H', 35, 43)` = 446s thay vì
  ~70s. Optimizer không chọn split đó nên xếp hạng vẫn đúng, nhưng con số
  mòn đã phi thực tế.
- **Hằng số mới: DEG_CLIFF.H = 0.55** (cũ 5.0) — chỉ hằng số này đổi; tune
  lại bằng `scripts/tune-deg-cliff.ts` (giờ là grid 1 chiều trên lives
  thật): H35 deg = **69.7s**, nằm trong dải mục tiêu 50–90s dựa trên số
  thật (stint H35 của Ricciardo chạy ~94.5s/vòng vs H mới ~91.4s ⇒ ~108s
  thiệt hại, trừ pace delta 0.9×35 = 31.5s ⇒ mòn ≈ 77s; 0.55 cho 69.7s).
  `bun scripts/tune-deg-cliff.ts --verify` xanh: Silverstone best S→M→S
  76.0s, S17→H35 = 131.2s ≥ 100s, S→H tốt nhất (optimizer) = 90.9s ≥ 83s
  (thua best 14.9s); Bahrain S→M @ pit 24 = 64.0s; Suzuka S→S→M giữ nguyên.
- **Fixture Silverstone cập nhật theo save thật:** lives S 23 / M 34 /
  H 43 (bộ cũ 23/35/53 — M 35 và H 53 là số suy, sai).
- **Fixture Bahrain cập nhật theo save thật:** lives S 33 / M 46 / H 59
  trên ĐÚNG type đã verify (S=2, M=1, H=0) — bộ cũ gán M/H vào type 3/4
  (= I/W sau khi sửa mapping) nên getCompoundCaps bỏ qua và lives 50/77
  lọt qua đường dẫn xuất durability; đồng thời 3 chặng lịch sử chạy 3
  pit/driver → expectedStops = 3 (meta) đúng mặt bằng save.
- **Test cập nhật theo đời lốp thật** (bài học 0.6.2: test cũ dùng life 53
  nên con số 446s lọt qua): closed form H 35/43, caps {S 23, M 34, H 43},
  dải H35 [50, 90], S17→H35 ≥ 100s với life 43, S→H optimizer ≥ 83s và
  thua best ≥ 7s; Bahrain describe theo lives 33/46/59 (pit 24, ~64.0s).

### Fixed — Bước 3: 4 cosmetic tồn từ review 0.6.0 (`224b577`)
- **Nhãn deg chồng nhau:** nhãn cap trên DegCurveChart giờ LUÔN stagger
  xuống 1 dòng khi cả đường pit lẫn đường cap cùng hiện — ngưỡng 12 vòng
  của bản vá 0.5.3 không đủ (Montreal: pit 21 vs trần đời S 36, cách 15
  vòng, vẫn đè nhau vì nhãn pit tràn sang phải từ insideTopLeft trong khi
  nhãn cap tràn sang trái từ insideTopRight). Silverstone (pit 16 vs cap
  23) hiển thị như cũ.
- **Tick đầu/cuối chart Home bị cắt:** margin ngang của PointsAreaChart +
  GainedBarChart tăng từ right 12 / left −18 lên right 28 / left 0 — với
  `interval={0}`, tick đầu ("Albert Park") và cuối ("Miami") bị cắt nửa
  chữ; giờ đọc đủ.
- **Card Research #5 bị cắt chữ:** text hành động dài (ví dụ đề xuất #5
  Sporting HighEngineLimits nhóm 10: "Đội bạn đã chọn Sporting High Engine
  Limits — theo dõi tally tới deadline") bị cắt mất nửa câu ở clamp 1 dòng.
  Card đề xuất trong Research nhận `actionLines={3}` (clamp là trần — action
  ngắn không đổi, các view khác giữ luật compact 0.6.0).
- **Card expertise chưa nói tổng thấp nhất:** hint của section expertise
  giờ nói rõ CẢ HAI mặt khi save có dạng này — tổng expertise của bạn thấp
  nhất giải ({total}) nhưng bank cao nhất ({bank}) — số tính từ rows của
  save (Miami 2027: tổng 20,435 thấp nhất 11 đội, bank 674.59 duy nhất > 0),
  không hardcode; key i18n mới `research.expertiseHintPlayer` (vi/en);
  bảng 2 cột không đổi.
- **Panel "Plan của game" hiện key i18n thô + 3 console error** (phát hiện
  khi verify trình duyệt ở 0.6.3, tồn từ v0.6.1 bước 3): component dùng
  `tyres.gamePlan.totalTime` / `webFaster` / `webSlower` nhưng 3 key này
  chưa từng có trong vi/en — chip "tổng {time}s mô hình" và dòng so sánh
  WEB vs GAME render nguyên chữ key kèm `IntlError: MISSING_MESSAGE` mỗi
  lần mở Tyre Lab. Đã bổ sung đủ 3 key (vi/en); không đổi layout, không
  đổi số liệu (tổng thời gian mô hình của game plan từ v0.6.1 giữ nguyên).

### Đính chính số liệu 0.6.2 (hệ quả của lives thật — xếp hạng không đổi)
- CHANGELOG 0.6.2 ghi "Silverstone: best S→M→S **75.7s**" — đó là số với
  lives sai (M 35 / H 53). Trên lives thật (23/34/43): best S→M→S =
  **76.0s** (S16/M21/S15, pit V16/V37), game plan 76.2s.
- Backtest Bahrain từ 0.6.1 ghi "S→M **61.1s**, pit 23, **MEDIUM**" — đó
  là số với lives 33/50/77 suy từ tỉ lệ. Trên lives thật (33/46/59) và
  mặt bằng meta thật (3 pit): S→M = **64.0s**, pit **24**, confidence
  **LOW** (delta xếp hạng là hằng số model — không có practice — cộng plan
  1 pit dưới mặt bằng 3 pit, pillar h). Thứ hạng S→M tốt nhất giữ nguyên.
- Cả hai đều là hệ quả của việc lives thật sau khi sửa mapping v0.6.2,
  không phải hồi quy engine mới.

## [0.6.2] — Sửa mapping WeekendTyreType (delta H về đúng +0.89) + 2 lỗi review 0.6.0

Đợt sửa sau khi chủ dự án audit v0.6.1 trên save Silverstone 2027 pre-race:
v0.6.1 đúng 2/3 (vách mòn giết được S→H, confidence tụt LOW với lý do rõ,
delta bị ép lộ mặt giữ raw +0.606) nhưng bước 1 đọc SAI mã hợp chất trong
bảng allocation — delta H xếp hạng thành +16.45s (thời gian Wet trên đường
khô) thay vì +0.89s. Xếp hạng vẫn đúng (S→M→S thắng) nhưng vì lý do sai: H
bị định giá chậm hơn S tới 16s/vòng nên không bao giờ thắng được, kể cả ở
chặng mà H thực sự tốt.

### Fixed — Bước 1: mapping WeekendTyreType `0=H, 1=M, 2=S, 3=I, 4=W` (`5694160`)
- **Nguyên nhân gốc:** comment trong `src/parser/repositories/tyres.repo.ts`
  ghi `0=W, 1=I, 2=S, 3=M, 4=H` — SAI. Kiểm chứng trên save thật
  (Silverstone 2027 pre-race, bảng allocation 440 dòng, chỉ set mới):
  mỗi type đúng 1 giá trị EstimatedLapTime — type 0 = 89.80s, type 1 =
  89.48s, type 2 = 88.91s, type 3 = 95.32s (Inter), type 4 = 105.35s (Wet).
  Nếu 3=M/4=H như comment cũ thì M/H chậm hơn S tới 6.4s/16.4s trên đường
  khô — phi lý; practice BestLapTyre cũng đọc S=2, M=1, H=0; plan của game
  chỉ dùng TyreType 0/1/2.
- Sửa bảng map ở mọi chỗ dùng WeekendTyreType trong `tyre.engine.ts`:
  `getAllocationPace`, `getCompoundCaps` ([[2,'S'],[1,'M'],[0,'H']]),
  `buildWetPlan` (Inter = freshLife(3), Wet = freshLife(4)), wet lives
  trong `buildTyreLab` (inters === 3, wets === 4) và hằng số `ALLOC_TYRE`.
- Viết lại comment sai trong `tyres.repo.ts` (header + field
  `RawTyreSet.weekendTyreType`) kèm nguồn kiểm chứng.
- Fixture test mirror đúng mapping thật: `silverstoneAllocation` giờ mang
  ĐỦ 5 type của save thật (Inter 95.32 / Wet 105.35 cạnh S/M/H) — với
  mapping cũ M sẽ đọc 95.32 và test KHÔNG thể pass; fixture
  `getCompoundCaps` dùng type 1/0 cho M/H; `buildWetPlan` đọc median của
  3 set mỗi type 3/4.
- Regression test khóa GIÁ TRỊ (không chỉ paceSource): `getAllocationPace`
  trả S 88.91 / M +0.57 / H +0.89 kể cả khi có set Inter/Wet; caps
  {S 23, M 35, H 53}; wet lives I 48 / W 62; assumption trích đúng
  "(88.91 / 89.48 / 89.80s)".
- Không đổi median/min, filter set mới, hằng số deg/cliff, công thức xếp
  hạng — chỉ sửa mapping.

### Fixed — Bước 2: 2 lỗi review 0.6.0 + câu "hòa" trên save thật (`ed897db`)
- **B1 (hồi quy 0.6.0):** dòng verdict của chart "Vị trí leo được" trên
  Home hiện nguyên key `wall.charts.gainedVerdict` kèm 2 console error
  `IntlError: FORMATTING_ERROR` — chuỗi i18n cần 4 biến nhưng call chỉ
  truyền 3. Đã thêm `races: sd.racesConsidered`.
- **B2 (có sẵn từ trước):** Tyre Lab trắng trơn khi mở bằng link trực tiếp
  `?view=tyres` không có `&race=` — view tự tìm ra chặng kế tiếp để hiển thị
  nhưng vẫn truyền raceId thô (null) vào `useTyreLab`. Giờ truyền
  `race?.raceId ?? null` (khớp hành vi RaceWeekendView); qua sidebar không
  đổi gì.
- **Wording "hòa":** trên save thật, plan kế tiếp (S→S→M) là hoán vị cùng
  multiset với plan gợi ý, vsBestS đúng 0.0 — why viết "kế hoạch kế tiếp
  (S→S→M) chậm hơn 0.0s". Nay viết "hòa (cùng tổng thời gian mô hình)".
  Logic isTie, tieNote và thứ tự xếp hạng không đổi; unit test tái lập
  đúng hình thế save thật (hoán vị 0.0 ở top, plan khác đầu tiên ≥ 2s).

### Không đổi
- Vách mòn (DEG_CLIFF), confidence pillars, số liệu pace/sim/finance/
  results — nguyên vẹn từ 0.6.1. Backtest Bahrain giữ nguyên thứ hạng
  (S→M tốt nhất); Silverstone: best S→M→S 75.7s, S→H ≥ 100s (nhờ vách mòn,
  không còn nhờ delta sai), confidence LOW.

## [0.6.1] — Engine lốp trung thực: delta bị ép lộ mặt, vách mòn, confidence siết

Đợt sửa engine lốp theo prompt v0.6.1 của chủ dự án, khởi nguồn từ Silverstone
2027 (chặng 10/21, race 199, 52 vòng, save pre-race Day 46579): web gợi ý
S(17)→H(35) 1 pit (69.2s, confidence HIGH), Ricciardo nghe theo → P16→P21,
trung bình 93.60s/vòng, bị quay vòng 2 lần; O'Ward chạy plan của game
S→M→S → P19→P13 (91.72s/vòng). Ba lỗi khác nhau, sửa ở 3 bước, mỗi bước 1
commit; **số đo practice thô không bị sửa** — lỗi nằm ở cách engine xử lý.
Số liệu pace/sim/finance/results không đổi; UI v0.6.0 không vỡ (chỉ thêm
field vào TyreLab, không rename field nào, không sửa layout).

### Added — Bước 1: delta H bị ép phải lộ mặt + cross-check allocation (`5fb9eb0`)
- **Nguyên nhân:** practice Silverstone chỉ có 1 session, mỗi tay đua F1 chỉ
  chạy đúng 1 hợp chất (22 tay đua: S 8 / M 7 / H 7) — vòng H "nhanh nhất"
  (+0.606 thô) là của Russell chạy long-run, không so được với vòng M
  (+0.711). Quy tắc đơn điệu cũ ép H thành +0.861 nhưng vẫn ghi
  `paceSource.H = 'practice'` và evidence viết "H +0.86s (practice)" — một
  con số bịa mang nhãn số đo.
- `getPracticePace` trả thêm `rawDeltas` (trước khi ép) + cờ `clamped`;
  `PaceMeasuredEntry` thêm `rawDelta`.
- Nguồn mới trong `paceSource`: **`'allocation'`** — khi practice cho ra
  H ≤ M, delta xếp hạng H lấy từ allocation `EstimatedLapTime` của game
  (fresh sets, giống nhau mọi xe; Silverstone: S 88.91 / M 89.48 / H 89.80
  → +0.57 / +0.89), kèm assumption ghi rõ cả hai; nếu save không có
  EstimatedLapTime thì giữ giá trị ép nhưng gán nhãn **`'clamped'`**.
  Không xây "same-driver gaps" — dữ liệu không có (mỗi tay đua 1 hợp chất).
- Evidence không bao giờ ghi "(practice)" cho delta đã qua ép; ví dụ:
  `H +0.89s (allocation — practice đo được H nhanh hơn M nên không dùng
  được; giá trị thô +0.606s)`. Warning mới `PACE_DELTA_FORCED`.
- Parser đọc cột `EstimatedLapTime` (schema-adaptive, verified trên probe
  save thật); `TyreAllocation` thêm `estimatedLapTimeS` (additive).
- UI: chip đồng hồ bằng chứng thêm ghi chú "đo được +0.61s — bị ép, xếp
  hạng bằng allocation/model" (additive, không đổi layout).

### Changed — Bước 2: vách mòn (cliff) cho stint dài (`d92786e`)
- **Nguyên nhân:** stint H 35 vòng của Ricciardo chạy ~94.5s/vòng (chậm hơn
  S khoảng 3s/vòng cuối stint) trong khi mô hình tính toàn bộ stint chỉ
  9.2s deg — `DEG_FINAL.H = 1.8` là thấp nhất trong 3 hợp chất và không có
  vách. "Còn sống được" (đời H 53 vòng từ allocation) không có nghĩa là
  "còn nhanh".
- **Cơ chế chung cho cả 3 hợp chất** (như DEG_FINAL): stint vượt
  `DEG_CLIFF_THRESHOLD = 0.6` × đời lốp chịu thêm
  `DEG_CLIFF[c] × (số vòng vượt ngưỡng)²`.
- **Hằng số tune bằng backtest** (`scripts/tune-deg-cliff.ts`, grid 3136
  combo trên 2 save đã verify — không đoán mò):
  `DEG_CLIFF = { S 0.03, M 0.02, H 5.0 }` (mới) và
  `DEG_FINAL.H: 1.8 → 3.0`. Một hằng số cliff duy nhất mâu thuẫn toán học
  với 2 save: stint S23/M34 của Bahrain vượt ngưỡng 3.2/4 vòng mà phải gần
  như miễn phí (S→M 61.1s phải giữ top 1, pit 23), trong khi H35
  Silverstone vượt đúng 3.2 vòng mà phải mất ≥ 31s — chỉ tách hằng số theo
  hợp chất mới giải được. DEG_FINAL.H gánh phần còn lại vì optimizer luôn
  re-split để né vách (20-21 S + 31-32 H vừa dưới 0.6×53).
- Backtest kết quả: Silverstone — deg stint H35 = 66.5s (was 9.2), plan
  S(17)→H(35) = 127.9s ≥ 100, **plan gợi ý = S→M→S (đúng thứ tự plan của
  game) 75.7s, S→H 77.3s không còn được gợi ý**; Bahrain — S→M giữ top 1
  pit 23 (61.7s), S→H 74.5s, S→S→M 66.1s (thứ hạng nguyên vẹn); Suzuka —
  S→S→M vẫn thắng S→H (81.2 vs 102.6, hướng v0.5.1 giữ nguyên).
- Công thức pace delta, pit cost, đời lốp: không đổi. Hook backtest
  `TyreLabOptions.degOverride` chỉ dùng cho script/verify, production
  không set.
- Exact ties giữa các plan hoán vị thứ tự (cùng multiset stint, cùng thời
  gian) nay ưu tiên thứ tự plan của game khi xếp hạng — mô hình không phân
  biệt thứ tự, among equals nên đề xuất cái game đang chạy.

### Changed — Bước 3: confidence siết, luật hòa, bất đồng với game (`96b5f7c`)
- **Nguyên nhân:** HIGH ở Silverstone dựa trên 4 trụ giả tạo: delta bị ép
  vẫn tính là "đo được"; check số pit bỏ qua hoàn toàn khi save không có
  observed/prior (dù engine biết `expectedStops = 2` từ meta); 2 plan đầu
  HÒA 0.0s nhưng why viết như thắng ("kế hoạch kế tiếp chậm hơn 0.0s");
  1 session practice được tính là đủ sâu.
- **Trụ HIGH mới** (thiếu 1 trụ → MEDIUM; thiếu ≥ 2 trụ hoặc có delta bị
  ép → LOW; mọi trụ thiếu được nêu tên trong assumption tóm tắt
  `Confidence …:`):
  (e) không delta nào mang nhãn `clamped`;
  (f) practice ≥ 2 session HOẶC allocation đồng thuận với practice trong
  0.2s (hoàn toàn không có practice thì trụ (b) đã trừ điểm — giúp save
  Bahrain không practice giữ MEDIUM, không bị LOW oan);
  (g) plan tốt nhất hơn plan khác đầu tiên (không tính hoán vị thứ tự của
  cùng multiset stint — đó là hòa tuyệt đối) ≥ 2.0s;
  (h) số pit của plan tốt nhất ≥ mặt bằng tham chiếu
  `observed ?? prior ?? expectedStops` (meta giờ nằm trong chuỗi).
- **Luật hòa:** plan khác đầu tiên chậm < 2.0s → why viết rõ "hai phương
  án đầu chênh nhau <2s — coi như hòa" và ưu tiên plan của game (hoặc,
  không có plan game, plan có stint dài nhất ngắn hơn); plan còn lại vẫn
  hiện làm phương án thay thế.
- **gamePlan thêm `totalTimeS`** (additive): plan của game mô hình bằng
  đúng toán của web (pace + deg gồm cliff + pit), luôn hiện cạnh plan web
  kèm chênh lệch giây — thấy ngay web bất đồng với game bao nhiêu
  (Silverstone: game S→M→S 15/20/17 tốn 76.0s theo mô hình web vs 75.7s
  của split tối ưu cùng thứ tự — chỉ lệch cách chia stint).
- Re-grade trung thực ở fixture cũ (ghi chú ngay trong test): post-race
  lives MEDIUM→LOW (4 trụ thiếu), rule-c MEDIUM→LOW (2 trụ thiếu), prior
  2.5 MEDIUM→LOW (2 trụ thiếu) — các claim cốt lõi của test giữ nguyên;
  Suzuka HIGH gate tái xác minh vẫn HIGH với đủ trụ mới.

### Verified
- Đủ 3 bước: `bun run lint` + `bun run typecheck` + `bun run test`
  (273 tests) xanh sau mỗi bước; backtest verify
  (`bun scripts/tune-deg-cliff.ts --verify`) xanh.
- Chờ chủ dự án chạy lại engine trên save Silverstone pre-race thật:
  S→H phải rớt khỏi vị trí gợi ý và confidence không còn HIGH.

## [0.6.0] — Đại tu dashboard-first: biểu đồ thay văn bản ở 6 view

Đợt đại tu lớn nhất từ Phase 2, theo prompt v0.6.0 của chủ dự án (kiểm chứng
trên save Miami 2027, Day 46524, 6/21 chặng xong). Nguyên tắc: **mọi view mở
đầu bằng số liệu — KPI + biểu đồ; chữ chỉ còn verdict 1 dòng + bằng chứng sau
toggle**; mỗi thẻ recommendation tối đa 2 dòng khi chưa mở toggle (title +
action); mọi số headline đều có biểu đồ/thanh bar đi kèm. **Số liệu của mọi
engine (pace, race pace, sim, lốp, finance, results) không đổi** — chỉ đổi
cách trình bày; ngoại lệ duy nhất là Research (sửa cách đọc phiếu bầu vì dữ
liệu đang đọc sai, đã kiểm chứng ở bước 6). Không thêm dependency mới
(Recharts 2.15.4 có sẵn; heatmap dùng `<canvas>` thuần + devicePixelRatio).

### Added — Bước 1: engine dữ liệu dashboard + vỏ chart dùng chung (`6217988`)
- `buildSeasonSeries(model)` (`src/engines/dashboard.engine.ts`): chuỗi từng
  chặng của mùa hiện tại (cửa sổ 6 chặng, cùng cửa sổ bảng pace): điểm
  constructors tích lũy 11 đội, điểm từng chặng của đội bạn + rival gần nhất
  (đội ngay trên bảng kết quả thực chiến), leo vị trí từng chặng từng đội,
  best finish từng chặng, và **gap pace đỉnh + pace đua từng chặng lấy nguyên
  văn từ `raceDeltasS` của 2 bảng pace — dashboard không tính lại pace**;
  race identity được khôi phục bằng eligibility filter (không đẻ ra số mới).
- **Test khóa số liệu mục 8 (save Miami, 6 chặng)**: tích lũy Red Bull
  25→201 · Mercedes 4→149 · McLaren 33→99 · Ferrari 1→54 · bạn 20→51 ·
  Williams 6→36 · Alpine 10→11; điểm từng chặng bạn [20,0,0,14,5,12] /
  Alpine [10,1,0,0,0,0]; leo vị trí bạn [+29,−5,+10,+18,+14,+15] = +81 /
  Alpine −4; pace đua từng chặng [0.657,0.911,1.113,0.421,0.493,0.443]
  (median 0.575). Fixture riêng `tests/helpers/miami-trend-fixture.ts` tái
  hiện phân bố từng chặng — fixture cũ v0.5.6 (khóa tổng cửa sổ) giữ nguyên.
- Vỏ dùng chung: `ChartCard` (tiêu đề + biểu đồ + 1 dòng kết luận + toggle
  "Xem bằng chứng") và `KpiCard`; định dạng số thống nhất: tiền 2 thập phân
  ("4.28M"), giây 3 chữ số, `formatSigned` cho leo vị trí.

### Changed — Bước 2: Home thành dashboard + thẻ recommendation gọn toàn app (`f181ed1`)
- Home: KPI strip (nay là KpiCard dùng chung) → (a) **area điểm constructors
  tích lũy** (top 5 đội + đội bạn tô nổi bật teal) → (b) **line gap pace từng
  chặng** (pace đỉnh + pace đua, đường 0 của đội nhanh nhất) → (c) **bar vị
  trí leo từng chặng** (xanh khi dương, đỏ khi âm). Không thêm view/route.
- `RecommendationCard` toàn app: chỉ còn title (1 dòng) + action (1 dòng) +
  badge confidence; why/expectedGain/risk/evidence/assumptions chuyển hết
  sau toggle "Xem bằng chứng"; nút 👍/👎 giữ vị trí, thêm tooltip rõ nghĩa
  "Đánh giá gợi ý này (không phải vote trong game)".

### Changed — Bước 3: Race Weekend — biểu đồ lên trước (`00360f6`)
- Section pace: 2 bảng bar thay bằng **line chart gap pace từng chặng** (đội
  bạn vs 2 rival gần nhất theo median, tab chuyển pace đỉnh/pace đua); median
  + gap vs rival vẫn nằm trong verdict 1 dòng. Bảng "Sức mạnh thực chiến"
  (v0.5.6) giữ nguyên vị trí.
- **Canvas pace heatmap** (`PaceHeatmap.tsx`, canvas thuần + devicePixelRatio,
  không thêm lib): lưới 11 đội × 6 chặng tô theo gap pace đua từng chặng
  (xanh lá = nhanh, đỏ = chậm), hàng đội bạn khoanh nổi teal, hover hiện
  tooltip (đội · chặng · gap giây). Số lấy từ `paceGapPerTeam` của
  `buildSeasonSeries` (verbatim từ race board).
- `StintTimeline` nâng thành biểu đồ stint đầy đủ: trục vòng đua (L0→Llaps)
  + vạch pit tô trên thanh stint; label/testid cũ giữ nguyên cho test.

### Changed — Bước 4: Tyre Lab + Car Lab — nhìn là thấy (`de9da42`)
- Tyre Lab: `CompoundCompareChart` (3 panel — đời lốp vòng, delta pace +s,
  deg cuối đời +s/vòng — 3 thang đo riêng, không gộp điểm) + bảng kế hoạch
  pit từng stint (stint/hợp chất/số vòng/phạm vi/pit); giữ DegCurveChart.
- Car Lab: `PartPerformanceChart` (điều kiện trung bình từng nhóm part của
  bạn vs **median giải** — median tính UI-side từ `Parts_Items.TeamID`, không
  đụng engine car) + `DevPointsChart` (design points đã lưu theo nhóm part từ
  hàng chờ phát triển). Không đổi công thức engine lốp/car.

### Changed — Bước 5: Drivers / Season / Strategy — bảng số + sparkline (`c27e234`)
- Drivers: mỗi tay đua có **sparkline điểm từng chặng** (SVG thuần) + leo vị
  trí 6 chặng; panel đối đầu vẽ **bar song đôi** (điểm, vị trí TB về đích,
  số chặng về trước) — cùng số liệu với các dòng cũ, không có metric mới.
- Season: thêm **area điểm tích lũy** (dùng chung series bước 1) qua
  ChartCard; ô lịch từng chặng nay hiển thị best finish + điểm (dải kết quả).
  StandingsBarChart giữ nguyên.
- Strategy: **bar expertise từng nhóm part** (Parts_Expertise) và **bar nhân
  sự theo vai trò** (tay đua/nhân sự/sắp hết hạn) + 1 dòng verdict mỗi mục.
  Không đổi engine personnel/finance.

### Fixed — Bước 6: Research đọc đúng phiếu bầu (GroupID) (`6832026`)
- **Dữ liệu đang sai đã kiểm chứng trên save thật**: `Regulations_TeamVotes`
  có cột (ProposalID, TeamID, **GroupID**) — cột thứ 3 là **nhóm phương án
  đội đó vote cho**, không phải YES/NO. Parser cũ đi tìm cột Vote không tồn
  tại → mọi phiếu đọc thành null → "0 YES / 0 NO / 11 không rõ".
- Parser (`regulations.repo.ts`): đọc GroupID làm phiếu; proposals map thêm
  `TargetSeason` + `VoteDay`; tên nhóm format từ `LocKey`
  (`RearWing_Major_02` → "Rear Wing Major — bản 02"; `HighEngineLimits` →
  "High Engine Limits"); schema Vote cũ (YES/NO) vẫn được giữ cho save cũ.
- Engine (`regulation.engine.ts`): tally theo nhóm + cờ lựa chọn của đội bạn;
  **tên đề xuất lấy từ base của nhóm (không còn "Đề xuất không tên")**;
  recommendation lấy **tối đa 3 đề xuất có TargetSeason >= mùa hiện tại, xếp
  theo VoteDay giảm dần** (trên save này: #7 luật mùa 2028 VoteDay 46482
  Suzuka tỉ số 6–5, rồi #6, #5 — không còn slice(0,3) trả về đề xuất 2026 đã
  quyết xong).
- **Tally chuẩn trên save Miami (test khóa)**: #1: 8 đội chọn Rear Wing Major
  02 vs 3 chọn 01; #4: 8 chọn Airflow Minor 02 vs 3 chọn 01; #5: 7/7 High
  Engine Limits; #6: 9/9 Alt Prize Share; #7: 6 chọn Chassis Redesign 02 vs
  5 chọn 01 (đội bạn vote nhóm 35 = bản 02); #2: 0 phiếu; #3: 1 phiếu (chỉ
  đội bạn, nhóm 6).
- UI Research: mỗi đề xuất 1 **bar ngang tỉ lệ phiếu theo phương án** (lựa
  chọn của bạn đánh dấu ✓); **expertise 2 cột song song** — tổng Expertise vs
  điểm đã bank (NextSeasonExpertise) — vì số liệu thật: tổng expertise đội
  bạn 20,435 (thấp nhất giải) nhưng bank 674.59 (duy nhất có bank); 10 đội
  còn lại tổng ~25,000–27,000 nhưng bank 0. Bank làm tròn 1 chữ số thập phân
  + đơn vị "điểm". Định nghĩa expertise banking không đổi. Nút 👍/👎 bỏ khỏi
  thẻ đề xuất Research (tránh nhầm thành vote trong game).

### Removed
- Không có. Không đụng Gazette, không xóa view/route nào.

### Notes kỹ thuật
- 1 bước = 1 commit Conventional + push, verify hash thật: `6217988` →
  `f181ed1` → `00360f6` → `de9da42` → `c27e234` → `6832026`; lint +
  typecheck + test xanh trước mỗi commit (254 test / 26 file).
- Không thêm dependency mới; không commit .sav hay dữ liệu save thật; engine
  pace/sim/lốp/finance/results không đổi số liệu hay công thức.

## [0.5.6] — Bảng sức mạnh thực chiến cạnh bảng pace

Đợt thêm theo báo cáo số liệu thật của chủ dự án, kiểm chứng trên save Miami
mùa 2027 (6/21 chặng xong): bảng pace đo "pace của xe nhanh nhất mỗi đội" nên
Alpine nhỉnh hơn đội bạn trên giấy (pace đỉnh #7 vs #11, pace đua #4 vs #5),
nhưng **mọi thước đo kết quả đều nói ngược lại** — bạn P5 với **51 điểm** vs
Alpine P7 với **11 điểm**, đối đầu trực tiếp **5–1**, DNF **1 vs 5**, vị trí
leo được **+81 vs −4**. Kết quả mới là cuộc chơi, nên v0.5.6 thêm **bảng
"Sức mạnh thực chiến"** ngay cạnh các bảng pace trong Race Weekend: điểm,
điểm/chặng, median best finish (kèm số mẫu n=), DNF/lượt xuất phát, leo vị
trí, đối đầu vs đội bạn. **Không gộp thành "điểm sức mạnh tổng hợp"** (cấm
trọng số tự chế) — các số liệu thật đặt cạnh nhau, độc lập với số pace. Số
pace không đổi: peak 2.299s #11/11 (Bahrain) và pace đua 0.468s #7/11 vẫn
được test khóa nguyên. 1 bước = 1 commit Conventional, lint + typecheck +
test xanh trước mỗi commit.

### Added — Bước 1: results engine (`1afb399`)
- `buildResultsBoard(model, options)` (`src/engines/results.engine.ts`): cửa
  sổ 6 chặng đã xong gần nhất (cùng cửa sổ `TREND_RACES` với bảng pace); mỗi
  đội một dòng: `points` (tổng `Races_Results.Points`), `pointsPerRace`,
  `medianBestFinish` (median vị trí về đích tốt nhất từng chặng, chỉ đếm
  chặng đội có ít nhất 1 xe về đích — cột `samples` ghi rõ n=), `dnfCount/
  starts`, `positionsGained` (tổng startingPos − finishingPos của xe về đích,
  loại DNF), `headToHead` vs đội bạn từ góc nhìn đội bạn (đội không có xe về
  đích thua; cả 2 cùng không có thì chặng bị loại khỏi đếm).
- Xếp hạng: điểm giảm dần → median best finish tăng dần → leo vị trí giảm
  dần. Confidence: HIGH ≥4 chặng, MEDIUM 2–3, LOW <2. Hai assumption bắt buộc
  hiển thị: thiên vị phân hạng của "leo vị trí" và việc median loại chặng
  không có xe về đích (DNF nằm ở cột riêng, không bị giấu như bảng pace đỉnh).
- **Kiểm chứng (unit test khóa trên bộ số liệu đã đối chiếu của chủ dự án —
  save Miami 6 chặng): Red Bull 201 · Mercedes 149 · McLaren 99 · Ferrari 54
  · CustomTeam 51 · Williams 36 · Alpine 11 · Haas 4 · AlphaTauri 1 · Aston
  Martin 0 · Alfa Romeo 0; median best finish 1.0 / 2.5 / 4.5 / 7.0 / 7.0 /
  7.0 / 11 (n=5) / 14.0 / 12.0 / 14.5 / 16 (n=5); DNF 1/1/1/0/1/1/5/1/2/0/6
  trên 12 lượt; leo vị trí −9/−9/+28/−21/+81/+14/−4/+6/+28/+34/−6; đối đầu
  Alpine 5–1, Williams 4–2, Ferrari 3–3, Haas 4–2, AlphaTauri 4–2, Aston
  Martin 6–0, McLaren 1–5, Mercedes 1–5, Red Bull 0–6**. Fixture tổng hợp
  132 dòng kết quả (tests/helpers/miami-fixture) — mọi số liệu đều do engine
  tính từ dòng dữ liệu, assertion không hardcode. **Lưu ý Alfa Romeo: theo
  đúng quy tắc đối đầu như viết (đội không có xe về đích thua — cùng cách
  Miami vs Alpine được tính thắng), chặng Alfa không có xe về đích là THẮNG
  của bạn → 6–0, không phải 5–0 kèm 1 chặng loại: đội bạn chỉ 1 DNF/12 lượt
  và luôn có xe về đích nên không thể tồn tại chặng "cả 2 đội cùng không có
  xe về đích" — đã ghi rõ trong header test, chờ chủ dự án đối chiếu save
  thật.**
- chore: gitignore `tool-results/`, dọn 2 file tool-output rác lỡ commit từ
  phiên trước (đã kiểm chứng: bản copy tyre.engine.ts, không có dữ liệu save).

### Added — Bước 2: bảng mới cạnh bảng pace + câu đối đầu trong recommendation (`968303d`)
- `ResultsBoardCard` (Race Weekend → Overview, đặt ngay sau các bảng pace,
  không tạo route/tab mới): hạng · đội · điểm · điểm/chặng · median best
  finish (n=samples) · DNF/lượt · leo vị trí · đối đầu vs bạn. Dòng đội bạn
  highlight; assumption + nguồn `Races_Results` trong mục thu gọn. VI/EN đủ.
- `pace.engine`: **cả 2** recommendation pace (đỉnh + đua) thêm 1 câu đối đầu
  với `rivalRef` của nó, viết theo đúng chiều số liệu — "Pace đua (vòng
  trung bình) chậm hơn Alpine 0.105s/vòng, nhưng trên kết quả bạn hơn: đối
  đầu thắng 5–1 (5/6 chặng), hơn 40 điểm (51 vs 11), DNF 1 vs 5." — nếu đội
  đối thủ đang dẫn điểm thì câu tự đổi chiều ("trên kết quả bạn kém…"), không
  bao giờ chỉ hiện khi có lợi cho bạn. Số liệu bảng pace (peak + race) giữ
  nguyên 100%.
- Race Weekend giờ render recommendation của **cả hai** board pace (rec pace
  đua tồn tại từ v0.5.4 nhưng chưa từng được hiển thị — câu đối đầu của nó
  sẽ vô hình nếu không sửa).
- Component test: bảng ra đúng số liệu khóa trên màn hình (51 / 8.5 / +81 vs
  11 / 1.8 / 5–1) và cả 2 câu đối đầu hiển thị trong recommendation.

---

## [0.5.5] — Race sim xếp theo pace đua (vòng trung bình) thay vì fastest-lap

Đợt sửa theo báo cáo số liệu thật của chủ dự án, kiểm chứng trên save Bahrain
mùa 2027 (Day 46507, sim Jeddah chặng 194): sim cũ xếp tay đua theo **median
fastest-lap delta** (pace đỉnh một vòng) nên dự đoán 2 xe vừa về P4/P9 ở
Bahrain (pace đua đội hạng 7/11, leo +18 vị trí) sẽ về **P19/P21** ở chặng
tới — với confidence HIGH. Đợt này đổi metric xếp hạng race sim sang **pace
đua trung bình (`Races_Results.Time / Laps`)** — cùng định nghĩa với board
pace đua v0.5.4 — fastest-lap chỉ còn làm tiebreak. **Quali sim không đổi**
(median vị trí quali là metric đúng cho phân hạng một vòng). Không đụng: số
liệu peak pace 2.299s #11/11, board pace đua 0.468s #7/11 của v0.5.4, engine
lốp/stint/finance/gazette, dependency, CI. `expectedStops` vẫn chỉ hiển thị
(chưa vào công thức xếp hạng — để đợt sau). 1 bước = 1 commit Conventional,
lint + typecheck + test xanh trước mỗi commit.

### Changed — Bước 1: race sim xếp theo pace đua (`4eeaa32`)
- `buildSim` (`src/engines/sim.engine.ts`): mỗi tay đua mỗi chặng có
  `avgLapMs = totalTimeMs / laps` (loại DNF, laps ≤ 0, Time ≤ 0 — cùng quy
  tắc với `buildRacePaceBoard`); gap = avg lap − best trung bình của chặng;
  `DriverAgg.racePaceDeltas` mới song song với `paceDeltas` (fastest-lap
  GIỮ NGUYÊN làm tiebreak).
- Sort race sim: `racePaceDeltaS` tăng dần (null → cuối) → `paceDeltaS`
  (tiebreak) → xuất phát dự kiến. `racePaceDeltaS` là trường mới trên
  `RaceSimRow`; `samples` giờ đếm mẫu pace đua (metric chính); confidence
  theo số mẫu pace đua thay vì fastest-lap.
- Evidence: dòng nguồn `Races_Results.Time / Laps` cho ranking + dòng
  fastest-lap ghi rõ "chỉ dùng làm tiebreak". Assumption sửa thành:
  "Xếp hạng dùng pace đua trung bình (Time/Laps) — vòng trung bình tính cả
  vòng vào/ra pit nên tay đua ít pit hơn có lợi nhẹ; fastest-lap chỉ làm
  tiebreak". Recommendation why trích pace đua làm số chính.
- **Kiểm chứng (unit test khóa trên bộ số liệu đã đối chiếu SQL, sim Jeddah
  trên save Bahrain Day 46507): O'Ward P10 (median +0.493s/vòng, 3 mẫu —
  Suzuka DNF loại), Ricciardo P12 (median +0.573s, 4 mẫu; hòa De Vries
  0.573s, phân định bằng tiebreak fastest-lap) — hết P19/P21; đúng thứ hạng
  pace đua đã kiểm chứng O'Ward #10 / Ricciardo #12 trong 21 tay đua có
  ≥2 mẫu; quali sim không đổi (Ricciardo P17, O'Ward P21)**. Rule tests:
  hòa pace đua → FL quyết định; pace đua thắng FL khi hai metric lệch nhau;
  không có Time/Laps → xếp cuối dù FL tốt nhất.

### Changed — Bước 2: tab Sim nói rõ metric + hiện cả 2 delta + bằng chứng leo vị trí (`15a6824`)
- Tiêu đề panel + heading race sim ghi rõ: "xếp theo pace đua trung bình
  (Time/Laps) · fastest-lap chỉ làm tiebreak" (VI/EN).
- Mỗi dòng race sim hiện cả 2 số: **race-pace delta (số chính, vd
  "+0.49s")** và **fastest-lap delta (số phụ, "FL +2.23s")**; giữ nguyên cột
  xuất phát dự kiến / về đích dự kiến / expected stops. Không thêm view mới,
  không redesign.
- Recommendation sim thêm câu bằng chứng leo vị trí ở chặng gần nhất đã xong
  (startingPos − finishingPos của 2 xe đội, non-DNF, leader trước):
  "Chặng trước leo +18 vị trí (Bahrain: Ricciardo +5, O'Ward +13) — mô hình
  pace đua đã tính tới sức đua đường dài, không chỉ một vòng nhanh nhất."
  Engine tự ghép (components không bịa số), có test khóa + test âm (không
  có gain đo được → không có câu).

---

## [0.5.4] — Pace đua (vòng trung bình) + nhãn pace đỉnh + sửa gap tower xe bị bắt vòng

Đợt sửa theo báo cáo số liệu thật của chủ dự án, kiểm chứng trên save Bahrain
mùa 2027 (Day 46507 — vừa đua xong Bahrain, 4/21 chặng, khô 28°C): đội **hạng
11/11 về pace đỉnh (median 2.299s)** nhưng **hạng 7/11 về pace đua (median
0.468s)** và leo +18 vị trí ở Bahrain — mô hình pace cũ chỉ có MỘT loại pace
và trình bày như phán quyết cuối cùng. Prompt này thêm metric thứ hai, sửa
cách trình bày, và sửa gap timing tower — **không đụng con số peak pace nào**
(2.299s / hạng 11/11 / Alfa Romeo 0.274s giữ nguyên, có test khóa). 1 bước =
1 commit Conventional, lint + typecheck + test xanh trước mỗi commit.

### Added — Bước 1: engine pace đua (vòng trung bình) (`b1b450e`)
- `buildRacePaceBoard` trong `src/engines/pace.engine.ts`: đo **vòng trung
  bình thực sự chạy** (`Races_Results.Time / Laps`) thay vì một vòng push.
  Cùng cấu trúc + logic đối thủ với pace đỉnh qua helper dùng chung
  `assembleTeamBoard` (bài học 0.4.1 — hai board không bao giờ lệch nhau);
  loại DNF / laps ≤ 0 / Time ≤ 0; median gap các chặng; window TREND_RACES;
  confidence trần MEDIUM khi ≥ 3 chặng (proxy, chưa có LapHistory).
- Assumption bắt buộc kèm theo: "Vòng trung bình tính cả vòng vào/ra pit —
  tay đua ít pit hơn có lợi nhẹ; sẽ loại vòng pit khi có dữ liệu theo vòng".
- Kiểm chứng (unit test khóa cả 2 board trên bộ số liệu đã đối chiếu SQL):
  **CustomTeam 0.468s hạng 7/11**, per-race mới-nhất-trước
  [1.113, 0.421, 0.493, 0.443]; Red Bull 0.000 hạng 1; Alfa Romeo 0.871 hạng
  11; **pace đỉnh không đổi: 2.299s hạng 11/11, Alfa Romeo +0.274s**.

### Changed — Bước 2: giao diện nói rõ hai loại pace + bằng chứng ngược (`61fb613`, `2488679`)
- Mọi nhãn "pace" trơ trọi thành **"pace đỉnh (fastest lap)"**: sub KPI Home
  ("Xếp hạng xe #11 — theo pace đỉnh (fastest lap)"), tiêu đề pace section
  Home + Race Weekend, dòng rank.
- Pace đua hiện cạnh pace đỉnh: Home thêm dòng "**Pace đua (vòng trung bình)
  #7/11** · 0.005s/vòng chậm so với Alpine" + dòng vị trí leo được
  ("Bahrain: Daniel Ricciardo +5, Patricio O'Ward +13 · tổng 4 chặng: +54",
  tính từ startingPos − finishingPos của 2 xe đội); Race Weekend hiện cả 2
  board trong cùng section + render pace recommendations.
- Khuyến nghị pace mang theo **bằng chứng ngược** (engine tự ghép, test khóa):
  title "**Pace đỉnh** đang chậm hơn Alfa Romeo 0.274s/vòng (fastest lap)";
  why thêm "... nhưng pace đua (vòng trung bình) hạng 7/11 và leo +18 vị trí
  ở Bahrain (Ricciardo +5, O'Ward +13, 14 điểm) — xe đua đường dài tốt hơn
  một vòng nhanh nhất". Evidence thêm nguồn `Races_Results.Time / Laps`.
- Fix layout nhỏ (`2488679`): hint của PaceBarChart tràn khỏi hộp cao độ cố
  định, đè lên dòng rank/vsRival ngay dưới (xác định bằng browser, kiểm tra
  hình học: hint bottom 1810.5px < rank top 1818.5px sau fix).

### Fixed — Bước 3: gap timing tower sai với xe bị bắt vòng (`b0d2d29`)
- Bug tái hiện trên save thật: gap = Time − winnerTime không trừ số vòng bị
  bắt → **Sainz P8 +7.498s trong khi Ricciardo P4 +63.449s** (P8 gap nhỏ hơn
  P4 là vô lý; Sainz/O'Ward 56 vòng, Ocon/Hulkenberg/Perez/Mini 55 vòng trên
  chặng 57 vòng — tổng thời gian của họ thiếu ~1–2 vòng = ~90–180s).
- Fix dùng chung 2 chỗ tính gap (tower + gazette) qua `src/lib/race-gap.ts`:
  xe bị bắt vòng hiện **"+1 LAP" / "+2 LAPS"** theo quy ước F1 (bản VI giữ
  nguyên chữ LAP); DNF giữ nguyên DNF; xe đủ vòng vẫn gap giây như cũ.
  Gazette rows thêm `lapsDown` (gapS bị ẩn cho xe bị bắt vòng); winner quote
  giữ nguyên hành vi qua raw P2 deficit.
- Kiểm chứng: tower + gazette Bahrain hiện Sainz P8 "+1 LAP", O'Ward P9
  "+1 LAP", Ocon/Hulkenberg/Perez/Mini "+2 LAPS", Ricciardo P4 vẫn
  "+63.449s", Verstappen "người thắng". Unit test cho 1/2 vòng + cùng vòng.

---

## [0.5.3] — Fix Personnel/Gazette/Research + dữ liệu thật thay placeholder + polish UI

Đợt fix theo báo cáo bug của chủ dự án, kiểm chứng từng bước trên save thật
Bahrain mùa 2027 (Day 46495 — sau quali, chưa đua, khô 28°C, CustomTeam hạng
11/11). 4 bug P1 + 3 gap P2 + 6 mục polish, 1 bước = 1 commit Conventional.
Không đụng engine lốp 0.5.1 (same-tier fallback), pace, stint factor, finance
expertise 0.4.1 — số liệu các engine đó giữ nguyên.

### Fixed — Bước 1 (P1): duel lốp so sai người + bịa chênh lệch (`5ba9a01`)
- Duel lốp ở Personnel trước đây lấy 2 tay đua đầu tiên theo thứ tự mã nhân
  viên và ép `null → 0`: trên save thật nó cho **Ricciardo đấu với Fittipaldi
  (dự bị, chưa từng đua)** và bịa "chênh 57.5 vòng/stint" kèm chữ
  "Pietro Fittipaldi null".
- Fix: duel chỉ so giữa các tay đua **thực sự đua cho đội** (có median
  laps/stint đo được + ≥1 chặng hoàn thành không DNF cho đúng đội), ưu tiên 2
  người nhiều chặng nhất; dưới 2 người đủ dữ liệu → bỏ khuyến nghị, thay bằng
  assumption ghi rõ, không bịa số. Không ép null → 0 ở bất kỳ phép so sánh nào
  của personnel (`buildDriverDuel` lược biến chết `tyreA/tyreB`); chuỗi why
  hiển thị `n/a` khi thiếu dữ liệu.
- Kiểm chứng save thật: duel = **Ricciardo 57.5 vs O'Ward 56** (chênh 1.5,
  số median thật từ pit history) — không còn Fittipaldi, không còn chữ "null".

### Fixed — Bước 2 (P1): Gazette ghi sai số chặng với chặng chưa đua (`0ea9a37`)
- `round` trước đây = số chặng **đã xong** (state 2) → Bahrain (chặng 4/21,
  chưa đua) bị ghi "Chặng 3 · Bahrain" / "CHẶNG 3/21" / "TẬP III" trong khi
  Season ghi đúng #4.
- Fix: `round` = vị trí chặng trong lịch mùa (sort day rồi raceId) + 1.
  `seasonRacesUpTo` giữ nguyên cho favorites/dark horse (chúng cần đúng chặng
  đã xong).
- Kiểm chứng save thật: **Bahrain 4/21**, Suzuka 3, Albert Park 1; 2 unit test
  mới (chặng chưa đua + mảng race xáo trộn).

### Fixed — Bước 3 (P1): tên tay đua dạng STRING_LITERAL hiện thành rác (`2565e1e`)
- Save thật lưu tên người chơi nhập dưới dạng
  `[STRING_LITERAL:Value=|Colton|]` (Herta 645, Emerson Fittipaldi Jr. 646,
  Briatore 5) và mã xe `[STRING_LITERAL:Value=|LLO|]` (staffId 600+).
  `cleanStaffName` rơi vào nhánh "giữ đuôi key" (split tại `_` của
  STRING_LITERAL) → hiển thị "LITERAL:Value=|Colton| LITERAL:Value=|Herta|".
- Fix: case STRING_LITERAL xử lý **trước** các case hiện có trong cả
  `cleanStaffName` và `cleanDriverCode`; giá trị giữ nguyên khoảng trắng
  ("Fittipaldi Jr."). Các shape `[StaffName_*]` / `[DriverCode_*]` / text trần
  không đổi.
- Kiểm chứng save thật: **0 tên chứa LITERAL/STRING_LITERAL** trong toàn bộ
  model (drivers, kết quả, quali, standings, staff); "Colton Herta",
  "Emerson Fittipaldi Jr." hiển thị đúng.

### Fixed — Bước 4 (P1): Research vẫn nói "Bank đã trên median" khi cả giải 0 (`9330b7c`)
- `>=` cho 0 ≥ 0 = true → Research ra "Bank đã trên median — không cần đốt
  R&D" trong khi bank 0, median 0, hạng 11/11 — mâu thuẫn với Strategy (đã sửa
  cùng lỗi ở finance.engine 0.4.1).
- Fix: copy y hệt logic 3 trường hợp từ finance (so `>` nghiêm ngặt; hòa +
  all-zero; hòa không all-zero). Title, confidence, evidence giữ nguyên.
- Kiểm chứng save thật: Research và Strategy **cùng một câu** về expertise:
  "Cả giải chưa bank expertise nào (toàn bộ 0) — …" (hạng 11/11).

### Changed — Bước 5 (P2): Car Lab league bỏ khái niệm điểm + resolve tên đề xuất luật (`75e3f79`)
- **5a — league xe (chọn hướng b: bỏ điểm)**: Parts_Designs trên save thật
  **không có cột điểm** (Points/DesignPoints/StatPoints/ResearchPoints/
  CDBPoints đều vắng) và tổng Parts_Designs_StatValues **không so sánh được
  giữa các đội** (số dòng stat lệch nhau 92–122/team, cộng dồn chỉ phản ánh
  khối lượng thiết kế). `CarLeagueRow` bỏ field `score` — league luôn xếp theo
  pace board, ghi rõ ở UI + evidence; không còn `score: null` trá hình. Dev
  queue giữ nguyên (đã trung thực từ 0.4.1).
- **5b — tên đề xuất luật**: group ID giờ được resolve từ chính các bảng nội
  dung trong save — sweeping ("Giảm toàn diện 50%"), giảm theo part
  ("Giảm 70% RearWing" qua Parts_Enum_Type), giảm stat ("Giảm 30% trên 3 chỉ
  số xe"), luật phi kỹ thuật ("quy tắc #2: 139.2M"); nhóm trống ghi rõ "chi
  tiết không có trong save" — không còn "group N" trơ trọi. Title card rơi
  về tên ChangeType của save ("Đề xuất #1 — MajorTechnical").
- Kiểm chứng save thật: 3 card Research phân biệt được (#1 MajorTechnical /
  #2 Sporting / #3 Financial) với nội dung đo được; league pace không còn
  cột điểm null.

### Fixed — Bước 6 (P2 + nhỏ): câu chữ cảnh báo + 5 mục polish giao diện (`22dfd6a`)
- **Cảnh báo đỏ Tyre Lab nói đúng đồng hồ bằng chứng**: câu cũ "Plan đang dùng
  M với delta CHƯA đo được" mâu thuẫn với chip "M đo được" — quy tắc cùng tầng
  0.5.1 cố ý xếp cả M và H bằng hằng số model. Câu mới: "Xếp hạng đang dùng
  hằng số model cho cả M và H vì H chưa đo được (đã đo được: M +0.85s) — coi
  như ước lượng" (dữ liệu từ `paceMeasured`).
- **Nhãn degradation chồng nhau**: khi |pitLap − lifeLap| < 12, nhãn "Trần đời
  lốp S" hạ xuống 1 hàng text — "Pit tối ưu: vòng 23" và "Trần đời lốp S: vòng
  29" không còn đè nhau (verify screenshot trên save thật).
- **Chip "ĐANG ĐUA"**: chỉ hiện khi save mở đúng ngày đua (meta.day = race
  day); state 1 thường dùng "tuần race" như Season, không pulse đỏ.
- **Tên dính chữ**: forename key camelCase tách đủ khoảng trắng
  ("AndreaKimi" → **"Andrea Kimi Antonelli"**); surname chỉ tách trước tiểu từ
  (de/van/der/le/la/da/al/dos/del/della/von/ter/ten) — "deVries" →
  **"Nyck de Vries"**, giữ nguyên MacPherson/DallAra/Vandoorne/O'Ward/
  Ricciardo/Verstappen. Tách surname làm thủ công — regex `/i` làm
  [A-ZÀ-Þ] match cả chữ thường và hỏng DallAra/Leclerc.
- **Cost-per-point định dạng**: dùng formatter tiền chung
  `formatMoneyCompact` (lib/utils) — "Cost-per-point: 3.2M / điểm" khớp
  "CHI/ĐIỂM" ở snapshot Finance.
- **Caption sơ đồ đường đua**: rút gọn "SƠ ĐỒ MINH HỌA — KHÔNG THEO TỈ LỆ" →
  "Sơ đồ minh họa" — không còn ngắt 3 dòng trong card Race Weekend/Home.
- Kiểm chứng bằng browser trên save thật (screenshot Tyre Lab, Home, Strategy,
  Drivers, Research, Gazette).

### Gates
- Mỗi bước: `bun run lint` + `bun run typecheck` + `bun run test` xanh trước
  khi commit (tổng 185 unit tests ở Bước 6); push xác minh bằng hash thật
  (`git log` + `git ls-remote`).
- Ngoại phạm vi như prompt: game plan 2 pit vs web 1 pit ở Bahrain là quyết
  định chiến thuật (không đổi optimizer); LapHistory cần save giữa chặng;
  dọn dependency/.env; Playwright E2E, Lighthouse, PWA, Phase 4.

## [0.5.2] — Fix deploy Vercel: Suspense cho WallSidebar + CI thêm bước build

Deploy Vercel của v0.5.0 (commit `64ed70b`, 2026-11-14) thất bại ở prerender:
`Error occurred prerendering page "/": useSearchParams() should be wrapped in
a suspense boundary`. v0.5.0 bước 1 render `<WallSidebar />` vô điều kiện trong
`page.tsx` — sidebar gọi `useWallNav()` → `useSearchParams()` mà phía trên không
có Suspense nào (chỉ CommandPalette và WallViews được bọc). `next dev` không
prerender nên chạy local bình thường; CI lại không có bước build nên không ai
phát hiện. Đợt này chỉ sửa 2 chỗ đó — không đụng engine/parser/UI (fix lốp
0.5.1 giữ nguyên).

### Fixed (`5a489f6`)
- Bọc `<Suspense fallback={null}>` quanh `<WallSidebar />` trong `src/app/page.tsx`
  — fix chuẩn của Next.js cho `useSearchParams`, giữ trang `/` render **static**.
  Verify local: `bun run build` pass, prerender 4/4 trang, route `/` hiện ○ (Static).

### CI (`aee6447`)
- Workflow thêm step **Build** (`bun run build`) ngay sau Unit tests — cùng script
  từng ngã trên Vercel, giờ chạy trên mọi push/PR vào main.
- Header comment ghi đúng thực tế: CI chạy lint + typecheck + unit tests + build
  (Playwright E2E vẫn để riêng). Trigger, install, layout job không đổi.

Không đổi gì ngoài 2 file trên (cộng CHANGELOG + version cho release).

## [0.5.1] — Fix engine lốp: delta cross-session, lives trung thực, plan của game + đồng hồ bằng chứng

Đợt fix theo báo cáo bug của chủ dự án (Suzuka 2027, engine tái hiện được trên đúng file save): engine từng xếp hằng số model H (+1.05s) cạnh M đo được (+1.09s) và đề xuất S→H / H→S→H vô nghĩa (117.7s trên view sau chặng); lives sụp xuống S12/M18/H22 vì lấy số pit của chính chặng vừa xong làm "độ bền lốp". 3 bước, 1 bước = 1 commit Conventional.

### Fixed — Bước 1 (P0): cấm trộn nguồn số liệu delta (`caf4985`)
- **Quy tắc 1 — đo cross-session**: compound thiếu mẫu trong TỪNG session riêng lẻ nhưng đủ ≥3 driver khác nhau cộng dồn cả tuần lễ được đo cross-session — best toàn cục mỗi loại so với Soft, đánh dấu tier riêng (độ tin cậy thấp hơn). Kiểm chứng trên save thật: H nhanh nhất 92.214s vs S 90.450s → **+1.76s**, khớp chính xác phép tay của chủ dự án; M giữ nguyên đo theo session (median gap 2 session = +1.09).
- **Quy tắc 2 — cùng tầng bằng chứng**: không bao giờ xếp hạng compound đo được với hằng số model — trộn nguồn thì cả M/H dùng hằng số model khi xếp hạng, giá trị đo được vẫn hiện trong evidence kèm nguồn từng loại + assumption + warning `SAME_TIER_PACE_FALLBACK`.
- Fixture số chủ dự án: best **S→S→M 80.9s pit [18,36]**; S→M 85.3s; S→H 97.6s (không còn best ở bất kỳ đâu); test riêng Quy tắc 2: best **S→M 68.2s**, S→H 74.4s.

### Fixed — Bước 2 (P1): độ bền lốp không suy từ số lần pit + confidence trung thực (`d2122fa`)
- Lives = allocation caps khi có tuần lễ active, không thì envelope vật lý (53 vòng → **S27/M40/H48**) — stintFactor KHÔNG còn nhân vào lives (nguyên nhân sụp 12/18/22); durability clamp fresh-set giữ nguyên.
- **Leave-one-out**: `getStintFactor`/`getObservedStops` nhận `excludeRaceId`; engine luôn loại chính chặng đang dự báo khỏi stintFactor. Pit stops quan sát được vẫn là dữ liệu tham chiếu hiển thị (expectedStops, guard rule c) — không còn kênh nào để một chặng "tự dạy" model về lives của chính nó.
- **Confidence trung thực**: HIGH chỉ khi đủ cả 4 trụ — lives từ allocation + M&H đều đo được từ practice + ≥3 mẫu stint-factor + plan không ít pit hơn mặt bằng cả giải; vi phạm thì cap MEDIUM kèm assumption nói rõ lý do. Warning mới `PLAN_BELOW_FIELD_STOPS`.
- Kiểm chứng save sau chặng: lives 27/40/48 (không còn 12/18/22), best S→M 64.7s, expectedStops 2 (track), confidence MEDIUM.

### Added — Bước 3 (P2): plan của game + đồng hồ bằng chứng + hiệu chỉnh theo track (`877d2d6`)
- Parser normalize **`Save_PlayerStrategyStints`** (TyreType 0=H/1=M/2=S xác minh qua TyreDurability: H=1.0, M=0.7845, S=0.5638) → `SaveModel.playerStrategy`; engine decode plan SELECTED (pit từ AverageStartingLap, OptimalPitLap khi >0, cửa sổ PitWindowStart/End) gắn vào chặng đầu chưa đua **của mùa hiện tại** (save thật chứa placeholder lịch các mùa tương lai). Bảng rỗng trước quali/sau chặng → null. LoadoutID→xe chưa xác minh được → hiển thị mức đội + assumption ghi rõ.
- **Đồng hồ bằng chứng** trong Tyre Lab (add-only, không redesign): chip nguồn từng compound (practice / cross-session / model / baseline), nguồn lives, nguồn pit cả giải, cảnh báo đỏ khi plan dùng compound chưa đo, dòng prior local.
- **Bảng hiệu chỉnh theo track, local-only** (IndexedDB `pitwall/track-corrections`, record v1): sau mỗi chặng ghi {trackId, predictedStops, predictedPitLap, fieldAvgStops, playerPitLaps}; quay lại track đó hiện prior và cap MEDIUM tới khi số pit của plan ≥ mặt bằng (`PLAN_BELOW_FIELD_STOPS_PRIOR`). Chỉ warning + confidence — không override optimizer.

### Verified trên save thật save1.sav (F1M24 1.11.0 — sau Suzuka 2027, giữa tuần lễ Bahrain)
- Tyre Lab Suzuka 192 (view sau chặng): H→S→H 117.7s → **S→S→M 78.0s pit [18,37]**; lives 12/18/22 → **27/40/48**; deltas M +1.09s (practice) / H +1.76s (cross-session); confidence HIGH → MEDIUM.
- Game plan Bahrain 193 (sau quali): **S→S→M pit [20,37]** cửa sổ 17–23 · 34–40, 2 xe chọn plan khác nhau (loadoutsAgree=false) — đặt cạnh plan của web.
- lint + typecheck + 169 tests xanh ở cả 3 commit; `next build` không chạy được trong sandbox (hạn chế môi trường đã ghi nhận từ Phase 1) — CI là cổng kiểm build.

## [0.5.0] — Polish UI: pit wall thật — sidebar, biểu đồ, bản sắc đội đua

Đợt polish giao diện v0.4.1 → v0.5.0 theo prompt chủ dự án: **không đổi bất kỳ engine/parser logic số liệu nào** — chỉ nâng cách trình bày (riêng parser *đọc thêm* 2 bảng hiển thị: `Teams_Colours` + decode `DriverCode`, không đụng số liệu). 5 bước, 1 bước = 1 commit Conventional, push sau mỗi bước.

### Added — Bước 1: khung wall (`7e88156`)
- Sidebar trái 240px (desktop ≥lg) nhóm theo mode (RACE WEEKEND / FACTORY·SEASON / TẠP CHÍ), active vạch teal, phím tắt 1–9 khớp Cmd+K, footer hiện save đang mở (tên file · Day · mùa · tiến độ · nút Đổi save). Mobile: bottom tab 5 mục + sheet "Thêm" (4 module còn lại), tôn trọng safe-area.
- Main rộng 1440px/gutters 24px; Home lưới 12 cột: Chặng tới (7) + Nên làm gì tiếp (5); thêm 2 card lấp chỗ trống: **Chặng vừa rồi** (podium + tay đua đội mình + điểm đội) và **Bảng xếp hạng nhanh** (top 5, highlight đội mình).
- Header: bỏ badge Phase (chuyển xuống footer), thêm đồng hồ game "Day {n} · Mùa {y} · x/21" + chip thời tiết chặng tới.
- Toast chuyển **top-center** — không che list dữ liệu nữa.

### Added — Bước 2: biểu đồ thật bằng Recharts (`0388e8d`)
- **Pace bar chart ngang 11 đội** (Home + Race Weekend): chiều thanh = median gap so với đội nhanh nhất (chính `paceDeltaS` của pace.engine trừ min bảng); đội mình teal + viền sáng, rivalRef amber, còn lại xám xanh; tooltip ghi median + số mẫu; giữ 1 dòng kết luận dưới chart, bỏ mũi tên trend mơ hồ.
- **Đường cong degradation S/M/H** (Tyre Lab): mirror đúng công thức đóng của tyre.engine (`deltas[c] + DEG_FINAL[c]·(lap/lives[c])^DEG_EXP`) — vạch pit tối ưu teal, vùng mờ đỏ sau trần đời lốp, line dừng ở cap (không bịa hiệu năng sau trần).
- **Car Lab**: league thành bar chart (designs = điểm thật; pace fallback = vị trí đảo, ghi rõ nguồn) + bars condition 9 nhóm part với vạch ngưỡng WATCH 0.7.
- **Season**: standings bar chart top 8 cạnh 2 bảng; card chặng đã đua hiện điểm đội ghi được, chặng chưa đua hiện countdown Day.
- Mọi chart: token màu, animation ≤400ms, tôn trọng `prefers-reduced-motion`, fallback chữ khi thiếu dữ liệu (không vẽ chart rỗng). +6 test mới.

### Added — Bước 3: bản sắc đội đua (`14d2d22`)
- Parser đọc **`Teams_Colours`** (oracle parity: `Colour >>> 0 & 0xFFFFFF`, ColourID thấp nhất thắng, bảng thiếu → rỗng an toàn) → `Team.colourPrimary`. Chấm màu đội ở mọi standings/list, màu thanh pace + league chart (mình/rival vẫn teal/amber), viền trái + avatar initials trên card tay đua.
- **Timing Tower** (Race Weekend — Overview): P1–P22 từ chặng hoàn thành gần nhất — mã 3 chữ cái, đội, gap (parity `Races_Results.Time`), số pit; cột lốp để "—" trung thực (model không có stint theo vòng); nhãn "kết quả chặng trước — tham khảo".
- **TrackSchematic**: outline SVG đơn giản cho 26 track + fallback có nhãn — vạch xuất phát + mũi tên hướng suy từ đoạn thẳng đầu path; ghi rõ "sơ đồ minh họa — không theo tỉ lệ".
- Decode **`[DriverCode_Ver]` → `Ver`** (loc-key → mã hiển thị, parity `cleanStaffName`). +5 test mới.

### Added — Bước 4: typography, hierarchy & motion (`be4efaa`)
- KPI: số 32px JetBrains Mono `tabular-nums`, label 11px uppercase, dòng delta trung thực dưới KPI xếp hạng — tính từ standings **trước** chặng cuối (dữ liệu lưu sẵn, ví dụ "giữ P3"); không bịa chuyển bậc.
- Kicker mono teal 11px + tiêu đề 15px semibold thống nhất mọi view (namespace `sec`).
- **PitWindowBar**: label pit tối ưu trên thanh, tick 1/25/50, chú giải đầy đủ (cửa sổ tối ưu / sớm–muộn / muộn / ngoài trần đời lốp); chuỗi hardcoded tiếng Việt chuyển sang next-intl.
- RecommendationCard gọn: why clamp 2 dòng (hover xem đủ), nút 👍/👎 thành 1 hàng icon nhỏ có aria-label; skeleton ~180ms khi đổi view (ViewShell, render-phase derived state, reduced-motion bỏ qua); live-pulse chấm teal ở card Chặng tới.

### Added — Bước 5: Gazette dạng báo + mobile (`ef1814e`)
- Bài chính 2 cột (desktop), **drop cap** chữ đầu, **pull quote** là quote tay đua thắng (dời khỏi box awards — không trùng lặp); bảng kết quả thêm chấm màu đội.
- Sidebar phải: **Odds + Dark horse + Trivia** thành các box riêng (collapses khi in/mobile); OddsTable scroll ngang trong hộp — sửa tràn 5px của trang.
- Mobile 390px: stint timeline cuộn ngang, KPI 2×2, **0 tràn ngang ở mọi view**.

### Verified trên save thật (autosave.sav F1M24, browser 1440×900 + 390×844)
- Số engine không đổi qua 5 bước: nhanh hơn Alpine **0.090s/vòng** (pace rank 9/11, +1.731s so với đội dẫn đầu), plan lốp **S(23)→M(33)** 1 pit, standings đội **CustomTeam P3 · 20 pts** (khớp "+20 pts đội" card chặng vừa rồi), tower 22 dòng với gap O'Ward **+25.718s** P4.
- Lỗi phát hiện khi verify: sau khi dịch vụ sandbox restart giữa chừng, working tree bị reset về `9fb113d` — đã `git reset --hard origin/main` phục hồi Bước 1+2 (đã push đầy đủ) và làm lại Bước 3 từ context; không mất dữ liệu trên origin.
- Lighthouse production không đo được trong sandbox (cấm `next build`) — đã đối chiếu bằng self-check `lint + typecheck + test` và verify browser thật.

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
