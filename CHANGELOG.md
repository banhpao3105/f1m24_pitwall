# Changelog

Tất cả thay đổi đáng chú ý của F1 Pit Wall. Format theo [Keep a Changelog](https://keepachangelog.com/), version theo [SemVer](https://semver.org/).

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
