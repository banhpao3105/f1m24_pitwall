# Changelog

Tất cả thay đổi đáng chú ý của F1 Pit Wall. Format theo [Keep a Changelog](https://keepachangelog.com/), version theo [SemVer](https://semver.org/).

## [0.11.0] — Ba khối what-if gộp thành một workspace + engine tìm plan theo tình huống

Trên Tyre Lab có 3 khối what-if không dính gì tới nhau (slider dời pit,
card SC/VSC, mô phỏng tự do) — mỗi khối 1 state, 1 kết quả, và **không khối
nào tìm plan mới**: tất cả chỉ re-price plan đã cố định. Thêm SC ở simulator
không hiện ở khối SC, gạt slider không động tới draft. Version này sửa cả 3
điểm: **1 workspace, 1 state, 1 thẻ gợi ý** — thêm SC/mưa là app trả lời
"nên chạy plan nào, đổi hay giữ, tiết kiệm bao nhiêu". Engine cũ
(`buildTyreLab`, `evaluateStrategy`, `priceManualPlan`, `whatIfSCVSC*`,
`buildWetPlan`, DEG/SC ratio/VSC midpoint) **không bị đụng** — Step 1 chỉ
THÊM hàm; regression giữ nguyên từng số (Shanghai lead/trail 83.1s, game
104s; B1 100.4 / B3 160.2 / B5 191.6 / B6 353.8, M1 saved 10.9; Vegas
72.2/75.7/73.4; MarinaBay 97.1/103.7; Monza 57.6/75.0; Interlagos 93.2/121.5).

### Bước 1 — `recommendUnderScenario` (`e0206d1`)

- **Tìm kiếm có giới hạn** (không hàm mũ): dry = đúng bộ order
  `buildTyreLab` đang enumerate (~54), mỗi order lấy pit tối ưu khô rồi
  **thử dịch từng pit vào từng cửa sổ** (mỗi pit thử mọi vòng trong cửa sổ,
  phần đầu/đuôi quanh pit được chia lại tối ưu — pit tối ưu khô 19/18/19
  của S→M→S thành S25/M13/S18 dưới SC [25,27]); mưa = biến thể căn mép cửa
  mưa (đúng mép + tràn 1 vòng — cả hai đều được định giá, "để giá tự quyết"),
  hợp chất khô giữ trong vocabulary của plan seed, cộng thêm wet preset
  `buildWetPlan`. Mọi ứng viên được định giá **trên kho đúng xe đó** qua
  đúng đường `priceManualPlan` (validation, `pitCostAtLap`,
  `assignSetsForCar`, `wearCorrection`) — parity khóa bằng test.
- **Kết quả**: `recommendation` + `alternates[0..2]` (khác signature) +
  `currentUnderScenario` (plan seed re-price dưới tình huống; infeasible →
  lỗi engine nguyên văn) + `verdict` 'switch'/'keep' (ngưỡng 0.5s là **quy
  tắc UI** chống nhiễu làm tròn — ghi rõ trong comment, không phải hằng số
  model) + `assumptions` (scRatio / vscMidpoint / wetDegBorrowed).
- Hòa giá tuyệt đối ưu tiên signature của plan đang chạy (Shanghai SC
  [19,21]: S→S→M và S→M→S hòa đúng multiset {S19,S19,M18} — chọn "giữ plan,
  pit dưới SC" thay vì anh em song sinh đổi order).
- Số lock trên fixture Shanghai 2028 (= SQL thật của autosave-5.sav, chủ đã
  verify): SC [25,27] → S→M→S pit 25/38 **80.2s** (−2.9s, switch — plan mà
  card top-6 cũ KHÔNG BAO GIỜ thấy); SC [19,21] → chính plan lead
  **75.8s** (−7.3s, switch); mưa [19,28] → S18/I10/S28 **154.1s**,
  alternates 157.9s + 164.6s, lead infeasible (2 lỗi slick-trong-mưa) →
  switch bắt buộc; không tình huống → `null`. 13 test mới; `probe-v110-rec.ts`
  in cả bộ DoD. 553 → 566 test xanh.

### Bước 2 — Một workspace "Tình huống" (`ed9e454`)

- **Xóa hẳn** 2 section cũ `tyre-whatif` + `tyre-whatif-sc` (section, state
  `pitShift/rainOn/whatIfOpen/scOn/scMode/scStart/scLaps`, i18n key, test) —
  không để lại section ẩn hay code chết.
- **Thẻ gợi ý** `tyre-scenario-recommendation` trên cùng workspace, chỉ hiện
  khi có ≥1 event hoặc cửa mưa: chip tóm tắt (`SC V25–27` / `Mưa V19–28`),
  câu verdict 3 dạng (`Đổi sang… — tiết kiệm Ns` / `Giữ plan, pit ở Vx dưới
  SC/VSC — tiết kiệm Ns` / `Plan hiện tại không chạy được dưới tình huống
  này — phải đổi sang…`), số thời gian + chip delta so với giá green của
  plan lead, nút **"Áp dụng plan này"** viết thẳng plan gợi ý vào editor,
  2 alternates mỗi dòng 1 nút "Áp dụng" riêng, giả định nằm sau toggle
  "Xem bằng chứng" — không bao giờ trình bày số giả định như số đo.
- **Tìm kiếm chạy trên tình huống đã CHỐT**: nút bấm commit khi click,
  ô số commit khi blur/Enter — không bao giờ chạy theo từng keystroke, và
  (Step 3) không bao giờ chạy theo từng pointermove.
- Slider dời pit cũ sống lại làm control **"Dịch toàn bộ pit ±N vòng"**
  trong workspace: mọi pit lap dịch cùng delta, clamp mọi stint ≥ 4 vòng
  trong [1, laps]; áp lũy tiến theo vị trí slider, mọi edit khác reset về 0;
  thẻ gợi ý KHÔNG phụ thuộc draft nên slider không chạy search.
- `sim-reset` ("Về plan lead") cũng xóa tình huống đã chốt (thẻ gợi ý biến
  mất); thumb của Radix slider có tên a11y (`thumbLabel`).
- Test: card Shanghai lock số DoD (80.2s/−2.9s/"Đổi sang S→M→S, pit V25/V38"
  → áp dụng = editor 25/13/18 hero 80.2s; mưa → 154.1s + câu infeasible +
  alternates 157.9/164.6 → áp alt 0 = 18/11/27 hero 157.9s; slider +2 → pit
  V21/V40); MarinaBay card 87.9s/−9.2s + VSC 92.5s (midpoint 16.1) thay test
  card cũ; phase2 assert testid cũ biến mất khỏi DOM. 566 → 572 xanh. Live
  browser: card + áp dụng + slider chạy đúng trên save thật, 0 console error.

### Bước 3 — Kéo-thả trên timeline (`4cefd07` + live-fix `e9b15ea`)

- **Pointer Events thuần** (không framer-motion `drag`, không lib DnD): cờ
  pit thành **handle kéo biên** (role slider, focus ring, aria-valuetext)
  — snap vòng nguyên, clamp stint ≥ 4 (4/34/18 và 34/4/18 trên draft
  Shanghai — vi phạm đời bộ vẫn là lỗi engine trung thực, không clamp UI);
  band SC/VSC + mưa có **thân kéo dời** (giữ grab offset) + **2 mép
  resize** (clamp `startLap ≤ totalLaps − laps + 1`); `touch-action: none`.
- **Bàn phím ngang hàng**: mũi tên ±1, Shift ±5, Home/End tới clamp — mọi
  handle focus được, có `aria-label`, có focus ring.
- **Live mỗi pointermove**: draft + giá re-price theo từng bước kéo (thẻ
  gợi ý vẫn chờ commit — luật Step 2); tooltip khi kéo có chữ
  (`V19 → V25`, resize `V19–V21 → V19–V38`); ô số + stepper ở lại và đồng
  bộ 2 chiều ngay.
- Testid cũ `sim-timeline-pit-{lap}` sống lại **bên trong** handle (đường
  amber chính là cờ). Số lock: kéo biên V19→V25 = 25/13/18 90.2s +7.1s;
  biên 2 38→30 = 19/11/26 90.0s, bàn phím tới V44 = 19/25/12 87.4s; band SC
  [19,21]→[25,27] trả về 83.1s, resize [19,38] = 68.6s (2 pit trong cửa
  sổ); band mưa End tới [47,56] gọn còn đúng 1 lỗi "stint M vòng 39–56 chạy
  slick trong mưa (cửa sổ 47–56)". 572 → 581 xanh. Live-fix `e9b15ea`: handle
  thiếu `left` style (jsdom không hit-test nên test không bắt được) — kéo
  chuột thật đã verify: tooltip hiện, draft + giá + editor đồng bộ, 0
  console error.

## [0.10.0] — Simulator xài ui-ux-pro-max (mặt tiền + ergonomics + điểm nhấn cyber tiết chế)

v0.9.9 sửa xong tính thân thiện nhưng nhìn vẫn "trần": editor là dãy
`<select>` + `<input>` trần, kết quả là bảng text, không hình, không chuyển
động. Version này **CHỈ hoá mỹ section Mô phỏng tự do trong Tyre Lab —
không đụng engine (`tyre.engine.ts`), không đổi token/palette/font, không
thêm dependency** (chỉ `framer-motion` + `lucide-react` có sẵn). Skill
`ui-ux-pro-max`: chấp nhận `cyberpunk-ui` dùng tiết chế (glow chỉ ở số hero,
texture grid chỉ ở header panel), BÁC BỎ Brutalism (mâu thuẫn hướng cyber
pit-wall teal của app); motion theo luật skill qua Framer Motion (không port
GSAP).

### Bước 1 — Timeline thành mặt tiền (`b360111`)

- **SimTimeline** (mở rộng `StintTimeline.tsx`, tái dùng math + màu): draft
  đang sửa vẽ trên trục vòng thật 0 → tổng vòng — segment màu hợp chất rộng
  đúng tỉ lệ (19/56 ≈ 33.9%), cờ pit ở mọi biên stint, band amber nét đứt
  cho từng SC/VSC, band xanh cho từng cửa sổ mưa. Segment là nút bấm được:
  click → scroll tới + focus dòng stint tương ứng (ring teal 1.5s rồi tắt,
  tôn trọng reduced motion); hover/focus → **tooltip có chữ** (hợp chất ·
  khoảng vòng · bộ lốp · mòn) — không bao giờ chỉ màu. Draft lỗi chưa price
  được → tooltip chỉ hiện hình học (không bịa số bộ từ plan cũ).
- **Hero row** trong kết quả: số tổng thời gian `text-3xl` mono chạy
  `NumberTween` (spring < 300ms, render ngay khi reduced motion) + glow teal
  nhẹ (`text-shadow` — chỗ duy nhất có glow); chip vs-best tô màu theo dấu:
  nhanh hơn best → `--color-good`, hòa → `--color-teal`, chậm hơn →
  `--color-danger`.
- **Sửa lỗi thật trong NumberTween**: reduced motion trước giờ vẫn tween —
  `mv.jump()` chỉ nhảy nguồn, spring gắn vào vẫn animate qua
  `attachSpring`. Nay nhảy cả spring → reduced motion render ngay, đúng
  docs/06 §6.4.
- Test: 7 case mới (geometry, tooltip, click-through với fake timers, band,
  màu chip, segment theo draft live, tooltip geometry-only khi lỗi);
  matchMedia stub khớp đúng query `"(prefers-reduced-motion)"` của
  motion-dom; 543/543 xanh.

### Bước 2 — Editor hết "trần" (`b10d429`)

- **Compound segmented control** thay `<select>`: 5 nút S/M/H/I/W màu theo
  hợp chất, nút đang chọn nền màu hợp chất 20% + viền inset màu hợp chất +
  chữ đậm. `data-testid="sim-stint-{i}-compound"` dời lên GROUP (nút mang
  `aria-pressed` + `aria-label`).
- **Laps stepper**: nút −/+ (Lucide `Minus`/`Plus`) hai bên input, mỗi nút
  **≥ 44×44px**; `−` chặn sỉn tại `MIN_STINT_LAPS = 4` của engine. Nút ×
  xóa dòng (stint/event/mưa) cũng ≥ 44×44px + `aria-label`. Mọi input
  height 44px cho touch.
- **Lỗi inline từng field** (skill: error near field + validate on change):
  tổng lệch → mỗi ô laps nhận `aria-invalid` + ring đỏ + dòng lỗi ngay dưới
  ô (`sim-stint-{i}-error`, "stint này làm tổng lệch {delta} vòng"); hết
  lệch → biến mất ngay lúc gõ.
- **Error summary có link**: `role="alert"` ở đầu editor liệt kê lỗi engine
  nguyên văn + link "tới stint 1" focus vào ô stint 1 **chỉ khi bấm**
  (không tự nhảy lúc đang gõ).
- **Xe 1/Xe 2** thành segmented control đúng nghĩa (cell đang chọn teal 15%
  + viền teal + glow inset nhẹ).
- **Motion đúng luật skill**: thêm/xóa dòng chạy `AnimatePresence` — enter
  spring ~250ms, **exit 150ms (luôn nhanh hơn enter)**, chỉ `opacity` +
  `transform`; dòng mang **id ổn định** ('seed-{i}' / row đếm) để exit đúng
  dòng (engine nhận input đã strip id); kết quả mới fade/slide-in 200ms
  khi mount; kết quả stale fade về 0.6 qua motion (class giữ cho test).
  Mọi motion tôn trọng `useReducedMotion`.
- Test: 8 case mới (segmented + màu, stepper + sàn 4, aria-invalid + lỗi
  từng dòng, link summary focus, target 44px + aria-label,
  AnimatePresence thêm/xóa, car segmented, chip xanh khi NHANH hơn best —
  75.8s / −7.3s); 551/551 xanh.

### Bước 3 — Điểm nhấn cyber tiết chế + release

- **Texture grid mờ** trên panel simulator (CSS gradient 1px, không ảnh,
  không SVG) + viền teal khi `focus-within`; **stint row mang viền trái
  3px màu hợp chất đang chọn**; band SC/VSC/mưa có **label chữ** (SC · VSC
  · MƯA) khi đủ rộng (≥ 8% bar) — không truyền nghĩa bằng màu riêng lẻ.
- **Hover state** đầy đủ 150–300ms trên mọi nút trong section (add/reset/
  car/compound/segment/stepper/link).
- **Mobile 375px**: editor xếp dọc (segmented wrap, stepper không tràn),
  timeline scroll nội bộ (`pitwall-scroll`), trang không scroll ngang
  (verify live `scrollWidth <= innerWidth`).
- Release: version 0.10.0, SW cache `pitwall-v0.10.0`, 553/553 test xanh,
  lint + tsc + build sạch. Engine hồi quy: không đổi số nào — toàn bộ số
  DoD v0.9.7/v0.9.9 (Shanghai 83.1/100.4/160.2/93.2…, Vegas
  72.2/75.7/73.4, MarinaBay 97.1/103.7, Monza 57.6/75.0, Interlagos
  93.2/121.5, multi-SC 10.9s) vẫn được khoá bằng test engine
  (`tyre.sim.test.ts`, `tyre.scvsc-multi.test.ts`…) chạy xanh trong suite.

## [0.9.9] — UI What-if / Mô phỏng tự do thân thiện + drive-by nhiệt độ

v0.9.7 đã verify PASS về engine (mọi số DoD khớp trên save thật) nhưng UI
"Mô phỏng tự do" bị chê "chả thân thiện tí nào". Version này **CHỈ sửa UI —
không động vào engine (`tyre.engine.ts`), không đổi `vsBestS`, không đổi DEG
constants**. Các section what-if cũ vẫn giữ nguyên, chỉ thu gọn — chưa xóa
(pit-shift dời plan tối ưu, card SC/VSC xếp hạng top 6 dưới 1 cửa sổ, toggle
mưa xem nhanh plan ướt — mỗi cái vẫn làm 1 việc mà simulator không làm).

### Bước 1 — Bug hiển thị −0.0s (`1d846e5`)

- Plan hòa với best từng render `"−0.0s so với best"` (ternary
  `vsBestS > 0 ? '+' : '−'` rơi nhánh trừ khi đúng 0). Nay `|vsBestS| <
  0.05` — đúng band trung tính ±0.05 mà chip pit-shift đã dùng, không bịa
  ngưỡng mới — hiển thị `"bằng best"` (`whatif.simVsBestTie`); ngoài band
  giữ nguyên format có dấu.
- Kiểm tra các chỗ render dấu khác trong cùng file, **không đổi gì**: chip
  mòn (summary + per-stint) — theo luật v0.9.4 `wearS` ABSENT khi 0
  (`corr.totalS !== 0 ? { wearS } : {}`) và `wearCorrection` round từng
  stint 0.1 trước khi cộng, nên giá render được không bao giờ là 0 hay
  làm tròn thành 0.0; delta pit-shift render `"0.0s"` không dấu khi 0
  (đúng, trung tính).

### Bước 2 — Editor của simulator (`1e3a895`)

- **Nhãn + phạm vi vòng live** trên từng dòng: stint hiện `#1 [S] [19]
  vòng V1–19` (phạm vi cộng dồn từ draft — derived, không thêm state);
  dòng SC/VSC có `từ vòng` / `dài … vòng`; dòng mưa có `mưa từ vòng` /
  `dài … vòng` (không dùng placeholder — nó biến mất khi có giá trị).
- **Tiêu đề cho 2 list** ("Sự kiện SC/VSC" / "Cửa sổ mưa") + dòng gợi ý
  khi rỗng — lần đầu mở lên biết chỗ này để làm gì.
- **Tổng số vòng live**: `"Tổng: 47/56 vòng"` cập nhật theo từng phím gõ —
  neutral khi đủ, đỏ khi thiếu/thừa, kèm đúng câu lỗi của engine (dùng
  chung chuỗi, không viết câu khác).
- **Lỗi không nuốt mất kết quả**: draft lỗi hiển thị banner đỏ trên đầu +
  kết quả hợp lệ gần nhất còn trên màn hình (mờ, opacity-60, kèm chú
  `simStaleResult`) — hành vi cũ (lỗi thay thế toàn bộ result) bị xóa.
  `lastGoodSim` dùng pattern React "adjust state when a value changes"
  (setState during render — react-hooks lint cấm cả đọc ref trong render
  lẫn setState trong effect, và variant effect đã loop vì seed-copy khi
  chưa-seed đổi identity mỗi render; seed slices giờ memoize + mảng rỗng
  module-level để identity `simResult` ổn định).
- **Mặc định hợp lý**: "Thêm SC/VSC" → bắt đầu ở **vòng pit đầu tiên của
  draft** (fallback `⌈laps/2⌉` khi draft không pit — cũ: vòng 1, không pit
  nào ở đó, tưởng nút hỏng), dài 3 vòng; "Thêm cửa sổ mưa" → vòng pit đầu
  tiên, dài 10 vòng (cũ: [1,5] phá plan mặc định ngay) + gợi ý
  `simRainHint` dưới list mưa.
- **Nút "Về plan lead"** cạnh "Load plan mưa": re-seed draft
  (`{seedKey:'', stints:[], events:[], rain:[]}`) để cơ chế seed tự nạp lại
  plan lead — không viết lại cơ chế seed.
- **Nới cap cửa sổ mưa**: `max={20}` → `max={số vòng của chặng}` (cap 20
  vòng là giới hạn UI tự đặt, engine không hề chặn); cap SC/VSC giữ 20.
- i18n `whatif` thêm 13 key: `simVsBestTie`, `simTotalLaps`,
  `simStaleResult`, `simRainHint`, `simReset`, `simEventsTitle`,
  `simRainTitle`, `simEventsEmpty`, `simRainEmpty`, `simFromLap`,
  `simRainFromLap` (1 key ngoài danh sách, để render đúng nhãn "mưa từ
  vòng"), `simLapsLong`, `simLapsUnit`. Key cũ giữ nguyên hết.

### Bước 3 — Gọn trang + drive-by + script audit

- **Section pit-shift thu gọn được**: nút chevron ở header, mặc định ĐÓNG
  khi `pitShift === 0 && !rainOn` (giá trị khởi tạo chính là điều kiện
  idle); bấm header mở/đóng (`aria-expanded` + `aria-controls`); khi đóng,
  header vẫn hiện tóm tắt `"Dời pit: {shift} · Mưa: {on|tắt}"`
  (`whatifSummary` — ICU select cho bật/tắt). KHÔNG xóa section cũ —
  xem dòng mở đầu.
- **Subtitle cho simulator**: `"Tự ráp chiến thuật, chèn SC/VSC và mưa —
  chỉ so với plan tốt nhất, không đổi lead/trail."` (`simSubtitle`).
- **Nhiệt độ header 1 số lẻ** (pattern `GazetteView.tsx` đã có): header
  wall `page.tsx`, `RaceWeekendView`, `SeasonView` — `raceTempC.toFixed(1)`
  thay vì float thô `"24.166248321533203°C"`.
- **Script audit v0.9.7 chọn đúng race** (`scripts/audit-v097-dod.ts`):
  lọc pending theo **mùa hiện tại** (`seasonId === meta.seasonId`) + ưu
  tiên `state === 1` trước khi fallback pending đầu tiên của mùa. Trước
  đây lọc pending trên MỌI mùa nên save Shanghai 2028 vớ phải race 128
  Shanghai mùa cũ (state 0) và in `"lab NOT ready"`. Chứng minh trên save
  thật local (season 2027): cũ in `race 127 AlbertPark … lab NOT ready`,
  mới in `race 193 Bahrain (state 1)` + baseline thật (best 64.0s S→M ·
  trail 64.0s M→S · game 66.9s); filter không khớp season nào thì báo
  `"no pending race matching … in season …"` thay vì lụm race mùa cũ.
- Release: version `0.9.9`, SW cache `pitwall-v0.9.9`.

### DoD

- Component test simulator (fixture Shanghai 2028 — mirror số SQL đã lock
  của `autosave-5.sav`): mặc định hiện `"bằng best"`, không có `"−0.0s"`
  nào trong section; B1 vẫn `"+17.3s so với best"`; mỗi dòng stint hiện
  đúng phạm vi (`V1–19`/`V20–38`/`V39–56`, live 10/19/18 →
  `V1–10`/`V11–29`/`V30–47`); tổng `"56/56 vòng"` → sửa stint 1 → 10 thành
  `"47/56 vòng"` đỏ + banner `"tổng số vòng 47 ≠ 56 vòng của chặng"` +
  kết quả cũ 83.1s còn trên màn hình (mờ + simStaleResult); "Thêm SC/VSC"
  → [19, 3]; "Thêm cửa sổ mưa" → [19, 10], `max=56`, nhập 30 không bị
  chặn về 20; "Về plan lead" → S19/S19/M18, list rỗng, 83.1s; subtitle
  hiện đúng câu.
- Phase2 test what-if: đóng mặc định — summary `"Dời pit: 0 · Mưa: tắt"`
  hiện, slider + rain toggle unmount; bấm header mở → slider + toggle về
  lại; đóng lại → summary còn.
- Suite: **536/536** (52 file test); lint + tsc + build sạch. Số giữ
  nguyên như sau bước 2 vì phase2 gộp assertion mới vào test có sẵn.
- Hồi quy (không đụng engine): toàn bộ số lock trong vitest giữ nguyên —
  MarinaBay lead/trail **97.1s** game **103.7s** · Monza **57.6s** game
  **75.0s** · Interlagos lead/trail **93.2s** game **121.5s** · Vegas lead
  **72.2s** trail **75.7s** game **73.4s** · Shanghai lead/trail **83.1s**
  game **104s** · builder B1 **100.4s** / B3 **160.2s** / B5 **191.6s** /
  B6 **353.8s** · multi-SC M1 tiết kiệm **10.9s**.

## [0.9.8] — Kho save thành tab riêng: mở lại, tải xuống, xóa nhiều

Thư viện save rời đáy wall shell thành tab full-page **`/?view=saves`**
(nhóm mới "DỮ LIỆU" trong sidebar + palette, không chiếm số 1–9) và —
theo yêu cầu tường minh của user — **từ v0.9.8, bytes gốc của file .sav
được lưu trong IndexedDB trên máy user cùng model đã parse**. Trước đây
chỉ model được lưu (header cũ ghi "raw .sav is NEVER persisted"), nên
"tải xuống lại file save" là bất khả thi — model đã chuẩn hóa không thể
tái tạo thành file GVAS+SQLite.

**Ranh giới quyền riêng tư không đổi:** bytes gốc chỉ nằm trong IndexedDB
trên máy user, KHÔNG bao giờ rời khỏi thiết bị (nút tải xuống trả đúng
những bytes đó lại cho chính user đó); xóa record là xóa cả model lẫn
bytes gốc. Key vẫn là SHA-256, dedupe không đổi, handle/F5 không đụng
tới, không có network call mới.

### Bước 1 — Storage (`cd5c8c1`)

- `StoredSave.raw?: Blob` (idb-keyval structured-clone Blob — không
  serialize tay); `putSave(model, fileLastModified?, raw?)` ghi raw khi
  caller đưa vào, không có raw → record như cũ (legacy model-only).
- `parse-controller` truyền `file` (File IS a Blob) vào putSave — nằm
  trong try/catch best-effort đã có: lỗi lưu raw (quota/private mode)
  không bao giờ làm fail parse. Re-upload cùng file → cùng key →
  overwrite model + raw + savedAt (hành vi putSave giữ nguyên).
- `getSave` / `listSaves` / `deleteSave` giữ nguyên signature và hành vi
  (cascade handle v0.8.1 không đụng tới).

### Bước 2 — Tab Kho save (`845fccf`)

- Routing: `WallView` thêm `'saves'`; WallViews case mới; page.tsx bỏ
  library ở đáy wall shell và render tab này trong **idle branch** (view
  duy nhất dùng được khi CHƯA mở save nào — các view idle khác giữ
  dropzone). KHÔNG thêm phím tắt số: Cmd+K 1–9 giữ nguyên cho 9 view cũ
  (saves nằm cuối MODULES, không chạm handler `n-1`); vào bằng
  sidebar/sheet mobile/palette. Badge shortcut rỗng không render (guard
  ở cả sidebar lẫn palette).
- Sidebar: group mode `S` (accent `text-info` — màu trung tính, khác
  teal/amber/gold của 3 nhóm cũ), icon Database; mobile: thêm vào sheet
  "thêm", KHÔNG vào 5 tab chính.
- Tab: header với subtitle chính sách lưu trữ mới + dòng thống kê
  "N save · tổng X MB" (MiB 1 số lẻ; 8,831,556 B → "8.4 MB"); mỗi dòng
  giữ nguyên field cũ + size + badge file gốc ("có file gốc" / mờ "chỉ
  model") + checkbox (aria-label "Chọn {fileName}").
- Actions: **Mở** (setReady + setLastActiveSaveId + về ngay wall view) ·
  **Tải xuống** từng dòng (chỉ enable khi có raw; objectURL → anchor
  click → revoke ngay; không có raw → disabled + title giải thích) ·
  **Xoá 1** (window.confirm — pattern cũ giữ nguyên: destructive action,
  keyboard-safe) · **Xoá nhiều**: checkbox chọn tất cả (indeterminate khi
  chọn 1 phần) + thanh bulk "Đã chọn N" → confirm
  `"Xoá {count} save đã chọn khỏi trình duyệt?"` → deleteSave tuần tự →
  nếu save đang mở nằm trong số đã xóa → setLastActiveSaveId(null) 1 lần
  → refresh + clear selection. Xóa save đang mở chỉ xóa khỏi storage +
  clear auto-restore; model trong memory của session giữ đến reload
  (hành vự cũ giữ nguyên).
- i18n: library thêm download/downloadNoRaw/hasRaw/modelOnly/selectAll/
  selectRow/selectedCount/deleteSelected/confirmDeleteMany/totalSize +
  subtitle mới; wall thêm nav.saves ("Kho save" / "Save library") + modeS.

### DoD

- save-db test (mock idb): raw 64KB roundtrip **byte-for-byte** (không chỉ
  so size); record legacy đọc lại raw === undefined; xóa record xóa cả
  model lẫn bytes; toàn bộ test cascade v0.8.1 pass không đổi.
- Component test SaveLibrary (mock save-db): dòng có raw → nút tải enable
  + badge "có file gốc"; dòng legacy → nút disabled + badge "chỉ model"
  + title `downloadNoRaw`; tick 2 checkbox → "Đã chọn 2" → confirm →
  deleteSave gọi đúng 2 id, list còn 1 dòng, selection clear; declined
  confirm không xóa gì; "chọn tất cả" chọn hết 3; Mở → setReady đúng
  model + router.replace('/') về wall; xóa 1 giữ hành vi cũ.
- Nav test: /?view=saves resolve qua WallViews; view khác không render
  library; palette 10 module — 9 view cũ giữ shortcut 1–9, saves cuối
  KHÔNG có shortcut.
- Suite: **531/531** (518 cũ + 13 mới); lint + tsc + build sạch.
- Live (Agent Browser): /?view=saves idle renders tab; sidebar hiện
  "Kho save" trong nhóm DỮ LIỆU; Cmd+K có "Kho save"; record ghi qua
  IndexedDB thật hiện size + badge + nút tải enable; click tải xuống,
  chọn tất cả, xóa nhiều + confirm, — 0 console errors.
- Hồi quy không đổi số nào (không đụng engine): MarinaBay lead/trail
  **97.1s** game **103.7s** · Monza **57.6s** game **75.0s** · Interlagos
  lead/trail **93.2s** game **121.5s** (4-stint 96.2) · Vegas lead
  **72.2s** trail **75.7s** game **73.4s** · Shanghai lead/trail **83.1s**
  game **104s**; F5 re-read handle + auto-restore hành vi không đổi.

**Lưu ý dữ liệu cũ:** save nạp trước v0.9.8 chỉ có model, không tải xuống
được — nạp lại file để bật tải xuống.

## [0.9.7] — Mô phỏng tự do: Strategy Builder + multi-SC/VSC timeline + Inter/rain

Ba món trong một section mới của Tyre Lab ("Mô phỏng tự do", đặt SAU 3
section what-if cũ — additive only, sandbox riêng không đụng lead/trail/
best/game). Phát hiện nền tảng (đo trên save thật, không phải giả định):
**game CÓ pace lốp mưa** — `Save_CarTyreAllocation.EstimatedLapTime` của
các bộ Inter/Wet fresh mang pace trên đường ướt theo game, nên KHÔNG cần
slider "Inter chậm hơn Soft bao nhiêu" do user nhập:

- Shanghai 2028 (`autosave-5.sav`): S fresh ELT trung vị **94.24s** (n=38)
  · I **101.57s** (n=110) → **I +7.33s** · W **112.33s** (n=66) →
  **W +18.10s** · đời I 84 / W 109. Kho lốp mưa mỗi xe: I #12–#16 fresh
  đời 82 ×5, W #17–#19 fresh đời 107 ×3, tất cả `AvailabilityState = 0`.
- Vegas 2027 (`save1.sav`): S **97.86s** (n=39) · I **106.49s** (n=110) →
  **I +8.63s** · W **118.21s** (n=44) → **W +20.35s** · đời I 99 / W 128.
  Vegas: I #13–#17 fresh đời 91 ×5, W #18–#19 fresh đời 118 ×2.
- Trong 1 save, mọi bộ cùng compound có ELT giống hệt nhau (kể cả bộ đã
  dùng: Shanghai S #1 đã dùng ELT 94.24 = đúng trung vị fresh; M #7 đã
  dùng ELT 94.63 = đúng trung vị fresh) — phần pace của wear correction
  bằng 0 với các bộ này.

Cơ sở engine dùng lại, không viết lại: `assignSetsForCar` (v0.9.1, generic
trên S/M/H/I/W) · `wearCorrection` (v0.9.4) · cap theo xe (`priceOn`
v0.9.4). `evaluateStrategy`, `buildTyreLab`, lead/trail/best/game, DEG
constants, `whatIfSCVSC` và 8 test của nó — không đổi một dòng.

### Bước 1 — Strategy Builder + Inter/rain (`f4729d1`)

- `priceManualPlan(model, raceId, carIndex, stints, opts?)`: định giá plan
  user tự lắp trên **chính kho lốp của xe đó** (cap xe = cơ sở execution y
  hệt `priceOn`; I/W không có per-car cap → đời trung vị fresh toàn
  trường). Validate thu thập TẤT CẢ lỗi cùng lúc (tổng vòng ≠ chặng, stint
  < 4, slick trong mưa, thiếu cột SC/pit, thiếu allocation mưa) rồi mới
  chạy set assignment (lỗi assignment trả riêng 1 diagnostic).
- `priceFixedStints`: định giá stint CỐ ĐỊNH (không tối ưu lại split —
  khác `evaluateStrategy`); plan 1 stint (no-stop) và plan toàn I/W hợp
  lệ (dry rule không áp dụng).
- `pitCostAtLap(lap, green, trackCols, events)`: giá pit dưới timeline sự
  kiện — **cheapest covering window wins** (chồng lấn không cộng dồn,
  assumption gán nhãn khi thực sự xảy ra); tỉ lệ y hệt v0.9.2: SC = green
  × clamp(SC/Pit, 0, 1), VSC = trung điểm green↔SC.
- `wetPace(model)`: trung vị ELT fresh I/W toàn trường (cùng luật fresh
  với `getAllocationPace`) — pace mưa của game, không bịa số; save thiếu
  allocation mưa → Inter tắt với lỗi rõ ràng.
- `SIM_DEG`: deg I/W **mượn curve của M** (save không có hằng số deg cho
  lốp mưa — giả định gán nhãn, engine trả assumption nguyên văn); KHÔNG
  bịa hằng số deg riêng, KHÔNG slider pace.
- Type accommodation, pricing law byte-identical: `DegConstants` /
  `AllocationPace` thêm slot I/W optional; `stintDegPenaltyWith` nhận I/W
  (`?? 0` giữ nguyên đường oracle); `wearCorrection` nhận stint I/W.

**DoD Bước 1 — 11 case, tất cả khớp số đo trên save thật:**

| Case | Kết quả |
|---|---|
| B1 Shanghai Xe 1: S19/M18/M19 | **100.4s, wear −0.4, vsBest +17.3**, pits [19,37], base 100.8; sets S19=#3f w−0.8, M18=#7u w+0.5, M19=#9f w−0.1 |
| B2 M13/S13/M13/M17 | INFEASIBLE: `cần 3 stint M nhưng xe chỉ có 2 bộ M khả dụng` |
| B3 S28/I11/S17 + rain [29,39] | **160.2s, wear −0.9, vsBest +77.1**, base 161.1; đúng 2 assumptions (pace ELT + deg M-curve) |
| B4 S19/M18/S19 + rain [29,39] | INFEASIBLE, đúng 2 lỗi slick-trong-mưa (stint M 20–37, stint S 38–56) |
| B5 S19/I18/S19 (không mưa) | **191.6s, wear −1.6, vsBest +108.5**, base 193.2; đúng 3 assumptions (thêm cận-dưới-khô) |
| B6 H56 (no-stop) | **353.8s, wear ABSENT (0), vsBest +270.7**, pits []; set H56=#10f |
| B7 S19/M18 | INFEASIBLE: `tổng số vòng 37 ≠ 56 vòng của chặng` |
| B8 B1 + SC [19,21] | **93.2s, vsBest +10.1** (pit 19 hưởng SC cost 13.455s) |
| V1 Vegas Xe 2: M24/S13/S13 | **75.7s, wear +0.2, vsBest +3.0, base 75.5 — BẰNG ĐÚNG card trail**; sets M24=#8f, S13=#0u w+0.1, S13=#3u w+0.1 |
| V2 S19/M15/S16 | INFEASIBLE: `stint S dài nhất 19 vòng vượt đời bộ S thứ 1 (18 vòng)` |
| V3 M19/I10/M21 + rain [20,29] | **155.9s, wear ABSENT, vsBest +83.2**, pits [19,29]; sets M19=#9f, I10=#13f, M21=#8f |

### Bước 2 — Multi SC/VSC timeline (`dac6aa5`)

- `whatIfSCVSCMulti(model, raceId, scenarios)`: tổng quát hóa v0.9.2 thành
  danh sách cửa sổ, dùng lại `pitCostAtLap` (cheapest-wins). Re-price đúng
  top 6 plan, sort theo `scenarioTimeS`; discount từng pit cộng chưa-làm-
  tròn rồi mới làm tròn tổng (M1: 7.245 + 3.6225 = **10.9**, không phải
  7.2 + 3.6 = 10.8). Assumptions: `scRatio` chỉ khi có ≥1 SC; `vscMidpoint`
  chỉ khi có ≥1 VSC; `repricedOnly` + `userWindows {count}` luôn có.
- **`whatIfSCVSC` (single-window, v0.9.2) giữ nguyên 100%** — function,
  type, và cả 8 test không động vào; multi với đúng 1 cửa sổ cho rows
  identical (M3) — chứng minh đây là tổng quát hóa thuần túy.

**DoD Bước 2:** Shanghai SC cost **13.5s** (20.7 × 13/20), VSC **17.1s**
(20.7 × 0.825); MarinaBay SC 11.4s, VSC 16.1s (như v0.9.2).

| Case | Kết quả |
|---|---|
| M1 Shanghai SC[17,19] + VSC[37,39] | SSM/SMS/MSS **72.2** (saved **10.9**, 2 stops); SSH/SHS/HSS **72.6** (10.9, 2) |
| M2 SC[17,19] + VSC[18,20] (chồng lấn) | mọi row saved **7.2** (pit 19 lấy giá SC rẻ nhất, không cộng dồn); SSM family 75.9, SSH family 76.3 |
| M3 Shanghai multi [SC 17,19] | rows **identical** với `whatIfSCVSC` single: [75.9×3, 76.3×3] |
| MB1 MarinaBay single SC[17,19] (hàm cũ) | Lead **87.8s** — không đổi so với v0.9.2 |
| MB2 MarinaBay multi [SC 17,19] | rows identical với MB1 |
| MB3 SC[17,19] + VSC[27,44] | SSM **83.2** (13.9, 2) · SMS **83.2** (13.9, 2) · MSS **87.8** (9.3, 2 — CẢ 2 pit nằm trong cửa sổ VSC 27–44: 2 × 4.6397 = 9.2793) · SSMS **92.9** (4.6, 1) · SMSS **92.9** (4.6, 1) · SMH **97.3** (4.6, 1) |

### Bước 3 — UI "Mô phỏng tự do" (`555b1ed`)

- Section mới `data-testid="tyre-simulator"` sau 3 what-if cũ; sandbox
  riêng: state local (không persist), kết quả không chạm lead/trail/best/
  game, chỉ so vsBest.
- Controls: chọn xe (label từ kho, seat verified hiện tên tay đua), stint
  editor (compound S/M/H/I/W + số vòng, tối đa 4 stint, 1 stint = no-stop
  hợp lệ), events SC/VSC (mode + vòng bắt đầu + độ dài ≤ 20), rain
  windows, preset 1 click "Load plan mưa (I→W)" từ `buildWetPlan` (thiếu
  allocation → nút tắt + `simNoWetData`).
- Mặc định: xe = Xe 1, stints = copy của lead plan (user sửa từ plan được
  đề xuất), events/rain rỗng — seed bằng derivation, không dùng effect
  (draft mang seed key nó được sửa dưới, đổi chặng/plan tự re-seed).
- Result card: dòng plan `"S(19) → M(18) → M(19) — 2 pit (V19, V37)"`,
  tổng thời gian, wear (chỉ khi có), vsBest, bảng stint với label bộ
  (`setFresh`/`setUsed` tái dùng) + wear từng stint, assumptions nguyên
  văn. Lỗi engine nguyên văn — UI không dịch lại, cả 2 locale.
- i18n: 11 key mới dưới `whatif` (vi + en).
- Live UI (Agent Browser): app shell + Tyre Lab tải 0 console error; card
  trail Vegas SMS 75.7s không đổi (suite khóa); builder Vegas Xe 2
  M24/S13/S13 → 75.7s (khớp card trail) — locked bởi component test;
  save thật Shanghai/Vegas không có trên cây build (như các vòng verify
  trước) — audit script in đúng số khi chạy trên máy có save.

### Tests + hồi quy

- Suite: **518/518** (482 cũ + 21 sim + 10 multi-SC + 5 UI simulator);
  lint + tsc + build sạch.
- Fixture mới `tests/helpers/shanghai-2028-fixture.ts` (owner-verified
  autosave-5.sav): race 212, 56 vòng, pit 20 / green 18 / SC 13 / chance
  1.00, lives S27/M41/H60, deltas M +1.21 / H +1.25, kho 2 xe đúng bảng
  §1.5, game plan M→H pit 27 = **104s** (wear −0.4); baseline lab khớp
  v0.9.6: lead SSM 83.1 (wear −1.7), trail MSS 83.1 diff-compound, tie.
  Vegas fixture thêm đúng kho mưa thật (I 91 ×5 / W 118 ×2 mỗi xe, AI
  99/128 → trung vị trường 99/128, n=110/44 đúng §0).
- Hồi quy không đổi số nào: MarinaBay lead/trail **97.1s** game **103.7s**
  · Monza **57.6s** game **75.0s** · Interlagos lead/trail **93.2s** game
  **121.5s** (4-stint 96.2) · Vegas lead **72.2s** trail **75.7s** game
  **73.4s** · Shanghai lead/trail **83.1s** game **104s**.
- Một assertion v094 được scope lại vào 2 card per-car: sandbox của
  simulator seed bảng stint riêng từ lead plan nên #1 xuất hiện HỢP LỆ ở
  đó — guarantee "khoá S #1 không bao giờ hiện" thuộc về card per-car.

## [0.9.6] — Luật trail pit-gap: 3 vòng → không trùng vòng

Quyết định của user (2026-11-16) sau câu hỏi ở Shanghai 2028 (save
`autosave-5.sav`, Day 46831, race 212, 56 laps): vì sao xe 2 không được chạy
M→S→S (83.1s, hòa lead) mà phải chạy H→S (88.9s). Câu trả lời cũ: luật split
v0.7.0 bắt mọi vòng pit của trail phải cách mọi vòng pit của lead ≥ 3 vòng
(`TRAIL_PIT_GAP = 3`) — MSS pit 18,37 chỉ cách lead (19,38) có 1 vòng nên bị
loại.

**Luật mới: chỉ pit chung 1 vòng mới là double-stack; pit cách nhau 1 vòng
đã là 2 lần pit riêng biệt.** Trail chỉ bị cấm khi có vòng pit TRÙNG với
lead (gap = 0); gap ≥ 1 vòng là được. Đây là bỏ đi một đệm bịa (3 vòng) chứ
không phải thêm hằng số mới — vẫn CẤM bịa hằng số phạt double-stack, không
có queue-time constant nào được thêm vào.

### Engine (`a47720e`)

- `TRAIL_PIT_GAP` 3 → 1 — thay đổi logic duy nhất, hằng số vẫn chỉ dùng ở
  đúng 2 chỗ: `gapOk` (mọi vòng pit của trail phải cách mọi vòng pit của
  lead) và ngưỡng chấp nhận của fallback pit-shift. **Thứ tự thử shift
  `[3, -3, 4, -4, 5, -5, 2, -2, 1, -1]` giữ nguyên** — khi phải shift vẫn
  ưu tiên tách xa nhất trước, chỉ nới ngưỡng chấp nhận từ 3 xuống 1.
- Giữ nguyên: lead selection, diff-compound preference, tie band 2.0s,
  `sameTierFallback`, wear/pricing (v0.9.4), per-car feasibility (v0.9.1).
- Text đi theo luật: spec comment, comment v0.9.4 ("pits never share a lap
  on the candidate path"), comment fallback ("never reach ≥1"), assumption
  đổi seat ("2 xe không pit chung vòng nên đổi được") và i18n `reasonPitGap`
  (vi/en) — không để chữ cũ nói sai luật mới.

### Số trên save thật (đo trên cây gap = 1, trước khi hoàn nguyên)

**Shanghai 2028 — `autosave-5.sav` (Day 46831, race 212, 56 laps):**

- LEAD không đổi: S→S→M (S19/S19/M18) pit 19,38 · **83.1s**.
- TRAIL mới: **M→S→S (M18/S19/S19) pit 18,37 · 83.1s · wear −1.7 · reason
  'diff-compound' · vsBestS 0** — đúng plan user hỏi. Sets: M18=#9 mới đời
  42, S19=#3 mới đời 28, S19=#5 mới đời 28. (wear −1.7: các bộ fresh đời
  28/42 dài hơn cap 27/41 nên deg thật thấp hơn giá cap — per-stint
  [−0.1, −0.8, −0.8].)
- S→M→S (S19/M18/S19) pit 19,37 **vẫn bị loại** — trùng vòng pit 19 với
  lead: đây chính là trường hợp double-stack mà luật mới vẫn cấm.
- Note hòa xuất hiện trong assumptions: "Hai plan hòa nhau về tổng thời gian
  thực thi — tách để tránh dẫm chân + hedge, không phải vì nhanh hơn".
- Game plan không đổi: M→H pit 27 · **104s**.

**Vegas — `save1.sav` (Day 46712, race 208, 50 laps):**

- LEAD/BEST/Game không đổi (72.2s / 72.7s · −2.8 / 73.4s).
- TRAIL đổi (cùng thời gian, khác plan): **S→M→S (S13/M24/S13) pit 13,37 ·
  75.7s · wear +0.2 · reason 'pit-gap' · vsBestS +3.5**. Lý do: SMS xếp
  trước MSS trong ranked list (cùng 72.7s trên cap đội); sau khi re-base lên
  giá xe 2, vsBestS = +3.5 > 2.0 nên không vào diện diff-compound, lấy
  `candidates[0]`. Pit 13 chỉ cách pit 14 của lead đúng 1 vòng — đúng luật
  mới; pit 37 cách 28 là 9 vòng. Sets không đổi (#0/#3 đã dùng đời 18, #8
  mới đời 31).

**Hồi quy — không đổi số nào:** MarinaBay lead/trail 97.1s · game 103.7s;
Monza 57.6s · game 75.0s; Interlagos 93.2s · game 121.5s.

### Tests

- Đúng 3 test rớt trên cây gap = 1 (479/482 → sửa đúng 3) + 3 assertion
  khóa luật cũ đổi `>= 3` → `>= 1` (khóa LUẬT, không khóa fixture):
  Vegas TRAIL engine, v094 trail card title, shift-fallback synthetic.
- Shift-fallback fixture làm lại với **race 18 vòng**: 20 vòng không còn
  khóa được luật mới (MSS pit 8,14 lọt gap 1 — min gap 2), còn 18 vòng thì
  mọi plan 2-pit đều (6,6,6) pit **[6,12]** — trùng hệt lead → tất cả rớt
  vì gap 0 → shift fallback chạy thật. Số đo bằng engine: lead S→S→M
  53.3s · wearS undefined; trail shift −3 → S5/S4/M9 pit **[5,9]** · 59.6s
  · reason 'shifted', mang đúng kho xe 2 (#0 fresh 8, #2 worn 6, #1 fresh
  9), wear +4.0 (bộ worn chạy 4 vòng: pace +0.8×4 = +3.2, deg +0.8).
- Suite: **482/482**; lint + tsc + build sạch.

## [0.9.5] — Fixture Interlagos về số thật + giá trị bị clamp không còn hiện như số đo

Hai việc độc lập trong một release, cả hai là hậu kiểm của v0.9.3/v0.9.4 —
engine không đổi một dòng (`src/` untouched).

### (A) Fixture Interlagos về số thật: 4-stint về lại 96.2s (`c414f3d`)

Quyết định (a) của Nguyen (2026-11-16): sửa fixture, không giữ số
fixture-only. Audit hồi quy v0.9.4 phát hiện plan 4-stint SSMS/SMSS ở
Interlagos priced **+0.4s trên fixture** so với **96.2s trên save thật**
(`save2.sav`, Day 46698).

**Nguyên nhân — lỗi fixture, không phải engine:**
`tests/helpers/interlagos-fixture.ts` hardcode 2 bộ S fresh **đời 26** mà
trên save thật **không tồn tại**. Số thật (đã đo trên `save2.sav`): Xe 1 có
4 bộ S mới **#0/#2/#3/#4 tất cả đời 27**, Xe 2 có 3 bộ S mới tất cả đời 27;
ELT S mới 70.30s. Stint S thứ 3 của plan 4-stint chạy bộ đời 27 = cap 27 →
deg đúng 96.2s, **wear 0**.

- Fixture: mọi đời 26 → 27; ID bộ S của xe 1 về đúng **#0/#2/#3/#4** — chính
  là ID mà assignment §4 tên (S20 = #0, S20 = #2). Lưu ý cơ chế: với cả 4 bộ
  cùng đời 27, nếu pool còn giữ ID #1 (fixture cũ) thì greedy stable sort sẽ
  giao stint 2 cho #1 và phá invariant khóa "S20 = #0/#2" — ID thật là thứ
  giữ assignment không đổi một cách tự nhiên. Cặp H dời #4/#5 → **#6/#7**
  (S chiếm #0–#4 rồi, ID trùng trong 1 xe sẽ làm `wearCorrection` tra nhầm
  bộ — game plan 121.5s sẽ nổ). M (#8 khóa / #9 mới) giữ nguyên.
- Test top-6: `timeS [93.2, 93.2, 93.2, 96.2, 96.2, 105.6]`, `vsBestS
  [0, 0, 0, 3.0, 3.0, 12.4]`, `strategies[3].wearS` undefined (correction 0
  → field không tồn tại, giống SSH). Tên test bỏ "(wear +0.4)", comment v0.9.4
  giải thích +0.4 (sai tiền đề) thay bằng note sửa.
- Mục v0.9.4 dưới đây được sửa lại (đoạn "hiệu chỉnh HONEST +0.4s" sai tiền
  đề) — gỡ mâu thuẫn nội bộ CHANGELOG (mục 0.9.3 ghi 96.2, mục 0.9.4 ghi
  con số khác). Grep con số đó trên toàn repo → 0 match.
- Không đổi engine, không đổi số nào khác (lead/trail/game/SSH giữ nguyên).

### (B) Giá trị bị clamp không còn hiện như số đo (`1259d45`)

Verify v0.9.3 trên Interlagos: engine PASS sạch (lead 93.2, trail 93.2,
SSH 105.6 hạng #6, game plan 121.5, deltas model +0.55/+1.05, assumption
clamp đúng chữ) — nhưng **2 mặt luôn hiện trên trang vẫn nói sai**, cùng 1
mặt thứ 3 chưa đo được live:

1. **Chip delta (evidence clock):** H hiện `đo được +1.12s — xếp hạng bằng
   model`. +1.12 là giá trị **bị clamp** (M + 0.15), chưa bao giờ được đo;
   số đo thật **+0.384s** nằm trong `paceMeasured.H.rawDelta` từ v0.6.1 —
   view không đọc.
2. **Dòng cảnh báo dưới bảng:** "…vì — chưa đo được ở track này (đã đo được:
   M +0.97s, H +1.12s)…" — 3 lỗi một câu: dùng cụm cấm cho ca clamp, slot
   trống gãy ngữ pháp, liệt kê clamp như số đo.
3. **Bản nháp practice** (chưa có save mid-practice để đo live): chip draft
   render `paceMeasured.delta` trực tiếp → pre-quali có clamp sẽ hiện
   "+1.12s PRACTICE".

**Root cause:** `paceMeasured[c].delta` là giá SAU clamp ("the ranking
delta" thời v0.7.1). Sau v0.9.3, khi fallback kích hoạt thì ranking delta
là hằng số model — `paceMeasured.delta` không còn là ranking delta, cũng
không phải số đo thô; nó là giá trị đã bị loại, nhưng view vẫn render với
nhãn "đo được".

**Fix — view-only, một luật duy nhất** (`displayMeasured`): entry có
`rawDelta` → hiện **giá trị thô** kèm dấu "bị loại"; entry không clamp →
hiện `delta` như cũ (delta lúc đó CHÍNH là số đo).

- Chip: key mới `clock.measuredButDiscarded` — H hiện `đo được +0.38s — bị
  loại vì nhiễu, xếp hạng bằng model`; headline `+1.05s MODEL` không đổi;
  chip M giữ nguyên (`đo được +0.97s — xếp hạng bằng model`).
- Dòng cảnh báo: tách 2 nhóm trong các compound đang xếp hạng bằng model —
  bị clamp (`H (+0.38s)`, rawDelta toFixed(2)) vs đo được thật (`M +0.97s`).
  Có clamp → key mới `clock.clampedWarn`: *"Xếp hạng đang dùng hằng số model
  cho cả M và H vì H (+0.38s) đo được nhưng bị loại vì nhiễu — đã đo được:
  M +0.97s."* Không clamp → `unmeasuredWarn` cũ **nguyên văn** (MarinaBay:
  cả hai thật sự chưa đo — câu cũ đúng). Nhãn "nhiễu" là nhãn chung; lý do
  chính xác theo từng phía chỉ nằm trong engine assumption sau nút "Xem
  bằng chứng" — không bịa lý do mới.
- Draft: giá trị thô + hậu tố "(bị loại)" / "(discarded)" — kiểm bằng
  component test (không có save mid-practice thật).
- Khóa dữ liệu: test fixture Interlagos assert `paceMeasured.H = { delta:
  1.12, rawDelta: 0.384 }` — engine không được đổi ngầm field mà view dựa vào.
- Giữ nguyên: nhánh `measuredButForced` (dead code từ v0.9.3 — dọn là việc
  khác), text `unmeasuredWarn`, behavior khi không có clamp, định dạng
  toFixed(2) ở view vs toFixed(3) trong assumption (cố ý).

### Số liệu / hồi quy

- Interlagos (save2.sav): chip H "+0.38s … bị loại", dòng warn đúng câu DoD;
  chuỗi "1.12" **0 match** trên toàn trang (kể cả sau "Xem bằng chứng");
  "chưa đo được ở track này" biến mất khỏi trang Interlagos; số engine
  không đổi (93.2 / 93.2 / 121.5 / SSH 105.6 hạng #6).
- Monza: không có dòng warn (cả hai practice), chip không có dòng phụ.
- MarinaBay: dòng warn giữ nguyên văn bản cũ (unmeasuredWarn) — khóa bằng
  component test assert chuỗi nguyên văn.
- 8 component test mới (ma trận: clamp 1 bên / cả hai / 1 usable + 1 chưa
  đo / cả hai chưa đo / cả hai usable → không warn; draft; vi/en). 482/482.

## [0.9.4] — Bộ lốp đúng xe + nhãn mới/đã dùng + giá theo độ mòn

Lỗi do Nguyen bắt trên save Vegas thật (`save1.sav`, Day 46712, chặng 208,
50 vòng, pre-race). Xe 2 (CarID 21) **không còn bộ S mới nào** — S dùng được
là #0 (mòn 0.888, đời 18), #2 (0.778, đời 16), #3 (0.887, đời 18), #1 đang
khóa (AvailabilityState 2) — nhưng web v0.9.1 hiển thị thẻ trail là
`S17=#0 "mới đời 20" + S17=#1 "mới đời 20"`: đó là bộ của **xe 1** (CarID 20),
trong đó #1 còn là bộ xe 2 không được dùng. Lead thì đúng.

### Root cause — 2 lỗi chồng nhau (đã đọc code xác minh)

1. **Gán nhầm xe.** Engine gán `assigns[0]` (bộ của cars[0] = xe 1) cho mọi
   ranked plan ở cấp đội; `priceOn` chỉ gán lại khi `carOfDriver` tìm được xe
   có `seatVerified` — mà trên mọi save thật cả 2 xe đều `seatVerified: false`
   (mapping CarID→driver chưa giải được; team 32 có 12 driver do
   Staff_Contracts type-0 lịch sử) → thẻ trail giữ bộ của xe 1.
2. **Nhãn "mới" chết.** Cả 2 chỗ render chọn nhãn bằng `!s.setUsed.spare`,
   mà `spare` bị hardcode `false` ở cả 2 chỗ gán — không chỗ nào set `true`;
   `setUsed.fresh` (đúng theo từng bộ, FrontLeftWear ≥ 0.99) không bao giờ
   được đọc → nhãn "đã dùng" không bao giờ render. Live v0.9.1: cả trang
   6 nhãn "mới", 0 nhãn "đã dùng".

**Lỗi mô hình (điểm thứ 2):** giá stint tính bằng pace lốp mới + deg trên
cap hợp chất, bất kể bộ được gán mòn bao nhiêu. Game tự định giá từng bộ qua
`Save_CarTyreAllocation.EstimatedLapTime` (đã xác minh trên save này: S mới
97.86; xe 2 #0 mòn 0.888 → 97.87 (+0.01s/vòng), #2 mòn 0.778 → 98.05
(+0.19); M #10 mòn 0.394 → 100.34 so với mới 98.24 = +2.10s/vòng; H #12
mòn 0.504 → 100.18 so với mới 98.68 = +1.50). Ở save này sai số nhỏ (trail
+0.2s) vì assignment chọn bộ tốt nhất, nhưng nguyên tắc sai và không bị
chặn trên: một bộ mòn nặng được gán sẽ lệch hàng giây mỗi stint mà không ai
thấy.

### Fixed — thẻ plan là briefing theo XE (`03f0d9b`)

- **`garageFor(driverId, cardIndex)`**: ghế verified thì dùng `carOfDriver`
  như cũ; ghế chưa xác minh thì lấy `inventory.cars[cardIndex]` — lead ← Xe 1
  (cap riêng `{...lives, ...perCarMaxStint[carId]}` + sets riêng), trail ← Xe 2.
  **Không đoán driver nào ngồi xe nào** — assumption ghi rõ: *"Ghế lái chưa
  xác minh — plan Xe 1 / Xe 2 theo thứ tự xe trong kho, không theo tên tay
  đua; nếu tay đua xếp trên của bạn ngồi xe 2, đổi 2 plan cho nhau (pit đã
  tách ≥ 3 vòng nên đổi được)"*.
- `CarPlan.carLabel` mới — nhãn kho của thẻ; view render `{car}` đầu dòng
  card: "Xe 1 — O'Ward (P10)" / "Xe 2 — Ricciardo (P19): …".
- **Nhãn bộ đọc `fresh`** (per-set truth); field `spare` bị xóa khỏi type
  `PlannedStint.setUsed` và cả 2 chỗ gán — typecheck bắt hết sót.
- **Trail fallback (pit-shift) gán bộ thật**: plan dịch pit nay mang
  `setUsed` từng stint từ kho xe trail + wear tương ứng; không gán được bộ
  nào → bỏ (giữ shape feasibility cũ).
- **Tie = giá thực thi**: `|trail.timeS − lead.timeS| < 2.0`; nhánh
  `planKey` (multiset) bị bỏ — cùng multiset vẫn có thể lệch giá trên 2 kho
  khác nhau. `diff-compound` chỉ khi plan đi qua băng hòa ≤ 2.0s; candidate
  fallback chỉ nhờ tách pit → `pit-gap` (dù compound xuất phát khác).
- **Game plan định giá lại trên kho Xe 1** (cùng cơ sở với thẻ lead — nguyên
  tắc same-basis từ v0.7.1); không gán được trên Xe 1 thì giữ total cap đội
  + assumption.

### Added — luật mòn→giá `wearCorrection`

Mỗi plan được định giá lại trên **bộ vật lý nó chạy**:
`pace = (EstimatedLapTime của bộ − median bộ mới theo hợp chất) × stintLaps`
(số của game, không hằng số bịa) + `deg = deg(laps, đời bộ được gán) −
deg(laps, đời đã định giá)`. Làm tròn từng stint 0.1s trước, tổng = tổng
các số đã làm tròn — dòng stint cộng đúng thành dòng plan. Áp dụng ở 4 mức:
ranked list (cơ sở Xe 1, thứ hạng KHÔNG đổi — chỉ giá/vsBest đổi), `priceOn`
(giá gốc = giá CHƯA hiệu chỉnh; correction của xe này THAY số cũ; correction
= 0 → không ghi `wearS`), trail shift-fallback, game plan. Candidate trail
re-base `vsBestS` trên giá thực thi thẻ lead trước bộ lọc tie-band.
`wearS` (plan + từng stint) là field mới; UI hiện dòng "mòn lốp: +0.2s"
dưới tổng thời gian của thẻ (wear 0 → không hiện dòng).

### Changed — UI

- Hero = thẻ lead ở MỌI chỗ hiển thị đề xuất; `tyre.data.best` chỉ còn ở
  (a) bảng xếp hạng — có dòng cơ sở mới "Bảng xếp hạng tính trên cap đội
  với kho Xe 1 (đã hiệu chỉnh mòn bộ được gán)" — và (b) hàng WEB của so
  sánh GAME/WEB. Trước fix lead ≡ best (priceOn là no-op trên save thật);
  sau fix lead re-split trên cap xe riêng nên 2 số khác nhau.
- Đường cong deg đánh dấu pit đầu của plan ĐỀ XUẤT (thẻ lead), không còn
  của ranked best.
- `split.tieNote` đổi thành "tổng thời gian thực thi" (khớp định nghĩa tie
  mới); assumption tie của engine cũng vậy.

### Số liệu khóa trên save Vegas (save1.sav, Day 46712 — fixture mirror)

- **LEAD (Xe 1): S→S→M (S14/S14/M22) pit 14,28 · 72.2s · wear 0** — sets
  `S14=#0 mới đời 20, S14=#1 mới đời 20, M22=#8 mới đời 31` (toàn bộ mới,
  đúng kho xe 1).
- **TRAIL (Xe 2): M→S→S (M24/S13/S13) pit 24,37 · 75.7s · wear +0.2 ·
  reason pit-gap** — sets `M24=#8 mới đời 31, S13=#0 đã dùng đời 18,
  S13=#3 đã dùng đời 18`. **Không còn #1 khóa, không còn nhãn "mới" trên bộ
  S đã dùng.** Trail cũ SSH 120.5s biến mất vì lead re-split sang pit 14,28
  (MSS pit 24,37 tách đủ ≥ 3 vòng: |24−28| = 4).
- **BEST (ranked[0]): S→S→M (S13/S13/M24) pit 13,26 · 72.7s · wear −2.8.**
- **Top 6 ranked:** SSM 72.7 / SMS 72.7 / MSS 72.7 / SSMS 82.6 / SMSS 82.6 /
  SSH 113.9 (wear −2.8 / −2.8 / −2.8 / −2.4 / −2.4 / −6.6; vsBest
  0 / 0 / 0 / 9.9 / 9.9 / 41.2).
- **Game plan: S→S→M pit 13,26 · 73.4s · wear −2.5.** Lead nhanh hơn game
  1.2s (73.4 − 72.2); hàng GAME/WEB: 73.4 vs 72.7 ("web nhanh hơn 0.7s").
- **Không còn tie note** (gap lead–trail 3.5s > 2.0). Cả 2 assumption mới
  (ghế chưa xác minh + lead re-price) đều có mặt.
- **Live UI (Tyre Lab, 0 console error):** thẻ trail hiện đúng
  "bộ #0 · đã dùng · đời 18" + "bộ #3 · đã dùng · đời 18"; cả 2 thẻ cộng lại
  4 nhãn "mới" (lead 3 + trail M #8); thẻ lead "Xe 1 — O'Ward (P10)", thẻ
  trail "Xe 2 — Ricciardo (P19)"; dòng "mòn lốp: +0.2s" trên thẻ trail.

### Hồi quy — không đổi số nào ở cấp xe

- **MarinaBay** (`autosave-4.sav`): lead/trail **97.1s / 97.1s**, game plan
  **103.7s** — wear 0 khắp nơi (toàn bộ mới, đời = cap).
- **Monza** (`save4.sav`): lead/trail **57.6s / 57.6s**, game plan **75.0s**.
- **Interlagos** (`save2.sav`): lead **SSM S20/S20/M31 · 93.2s** của v0.9.3
  giữ nguyên; trail 93.2 tie; game plan 121.5s; SSMS/SMSS **96.2s** (wear 0).
  [Sửa v0.9.5] Phát hiện khi audit hồi quy: fixture v0.9.4 hardcode 2 bộ S
  fresh **đời 26 không tồn tại trên save thật** (mọi bộ S mới đều đời 27 = cap)
  → engine priced 4-stint +0.4s trên số fixture-only. Sửa fixture về số
  thật — engine không đổi, số về lại 96.2 như mục v0.9.3 đã ghi (chi tiết ở
  v0.9.5, Bước 1).

### Out of scope (không làm trong bản này)

- Sửa `resolveCarDrivers` / mapping ghế thật (12 driver team 32).
- SC/VSC what-if (v0.9.0), rain what-if (v0.9.2), mixed-tier (v0.9.3 đã
  merge trước — v0.9.4 rebase lên đầu đó).
- Per-track pit cost — pit vẫn flat 20.7s. Wet plan không đổi.

## [0.9.3] — Delta bị clamp = chưa đo: hết trộn tier khi xếp hạng

Lỗi do Nguyen bắt trên đường đua thật: Interlagos 2027 (chặng 207, 71
vòng, save `save2.sav` Day 46698 post-quali). Web v0.9.1/v0.9.2 đề xuất
lead **S→S→H (S19/S19/H33) pit 19,38 · 94.8s**; Nguyen chạy S→M→S cho
O'Ward (pit 20,48) trong game → **P14→P10, +1 điểm** (Ricciardo giữ SSH →
P16, 0 điểm). Chặng có 3 SC nên kết quả chặng không dùng để chứng minh —
nhưng model sai đã kiểm chứng bằng code + số.

### Root cause — xếp hạng trộn hai thước đo

Practice Interlagos đo được **M +0.97s** (1 session) và **H thô +0.384s**.
H thô nhanh hơn M → luật đơn điệu v0.6.1 kích hoạt (`deltas.H = M + 0.15`
= 1.12, `clamped.H = true`). Luật cùng-tier v0.5.1 chỉ kiểm tra
"đã đo hay chưa" (`paceMeasured != null`) — H "đã đo" (dù giá trị bị loại
vì nhiễu) nên fallback không kích hoạt: **M giữ practice +0.97, H rơi vào
nhánh hForced và xếp hạng bằng allocation +0.71** (ước tính fresh-set của
game). SSH thắng SMS đúng 10.0s chỉ nhờ khoảng chênh đó.

Đối chứng bằng cùng engine, chỉ đổi tier: cả hai model constants (M +0.55
/ H +1.05) → SMS thắng 12.4s (86.5 vs 98.9); cả hai allocation → SMS
thắng 10.5s. **Chỉ bản trộn mới ra SSH** — tier trộn là root cause.

### Changed — luật khả dụng mới (`ccbf866`)

- **Usable = measured && !clamped**: giá trị bị clamp là ý kiến của model,
  không phải số đo — không được xuất hiện trong delta xếp hạng ở bất cứ đâu,
  kể cả khi nó là giá trị duy nhất còn lại.
- `sameTierFallback` tính trên usable: đúng một bên usable → **cả hai về
  hằng số model** (nhánh fallback v0.5.1 hiện có, không viết nhánh mới).
  Ma trận: usable+usable → practice/practice (Monza +0.03/+1.32 không
  đổi); usable+clamped hoặc clamped+usable hoặc cả hai clamped → model
  /model (Interlagos +0.55/+1.05 — ca này); cả hai chưa đo → model/model
  (MarinaBay không đổi).
- **Allocation không bao giờ là delta xếp hạng nữa** — nhánh hForced/
  allocation bị xóa khỏi đường xếp hạng; giá trị allocation và giá trị thô
  vẫn hiển thị làm bằng chứng trong `fallbackValue` của assumption (quy
  tắc v0.7.1).
- Văn bản assumption cho ca clamp nói đúng sự thật: *"Practice đo được H
  (+0.384s) nhanh hơn M nên không dùng được (nhiễu…) — dùng hằng số model
  cho cả M và H"* + fallbackValue ghi giá trị thô và allocation. Câu "Delta
  H chưa được đo ở track này" chỉ còn cho ca CHƯA đo thật; câu "xếp hạng H
  bằng ước tính allocation của game" biến mất khỏi UI.
- `PACE_DELTA_FORCED` / `hForced` / "delta H bị ép" bị xóa — trạng thái
  "delta bị ép" không còn tồn tại trên đường xếp hạng; cùng tình huống nay
  nổi lên qua 2 pillar pace + consistency. Phương án "cả hai allocation"
  đã cân nhắc và HOÃN (giữ fallback model constants v0.5.1, giảm hồi quy).

### Số liệu khóa trên save Interlagos (save2.sav, Day 46698 — fixture mirror)

- **Lead mới: S→S→M (S20/S20/M31), pit 20,40 · 93.2s** (model 86.5s);
  bộ gán: S20 = #0 mới đời 27, S20 = #2 mới đời 27, M31 = #9 mới đời 42.
- **Trail: M→S→S (M31/S20/S20), pit 31,51 · 93.2s** — hòa tuyệt đối (cùng
  multiset); pit cách lead 11 và 11 vòng.
- **S→M→S** (thứ tự Nguyen đã chạy) cũng 93.2s — cùng multiset, model
  không phân biệt thứ tự; lead giữ theo thứ tự liệt kê (S→S→M đầu nhóm hòa).
- **SSH cũ tụt xuống 105.6s (+12.4, hạng #6)**. Top 6: S→S→M 93.2 /
  M→S→S 93.2 / S→M→S 93.2 / S→S→M→S 96.2 / S→M→S→S 96.2 / S→S→H 105.6.
- Note loại plan: *"Bỏ phương án nhanh hơn theo model vì kho không chạy
  được: S→M→M — cần 2 stint M (27 + 26 vòng) nhưng mỗi xe chỉ có 1 bộ M
  khả dụng (đời 42)"*.
- Confidence vẫn **LOW**, đúng 2 lý do §4: delta xếp hạng chưa đủ cả M và
  H từ practice; practice chỉ 1 session đo được delta và allocation lệch
  quá 0.2s so với practice.
- **Game plan S→S→H pit 19,33: 108.3s → 121.5s** (H 39 vòng giá theo công
  thức engine, +1.05 thay vì +0.71 — công thức không đổi).
- Inputs (save thật): lives S30/M45/H64; cap S27/M42/H58; pit 20.7s;
  practice M +0.97 (1 session), H thô +0.384 (clamped); allocation S
  70.30 / M 70.58 / H 71.01s; kho mỗi xe S mới ×4/×3 (đời 27), M mới ×1
  (đời 42), H mới ×2 (đời 58).

### Hồi quy — KHÔNG ĐỔI

- **MarinaBay** (autosave-4.sav): lead S→S→M 97.1s + trail M→S→S 97.1s,
  deltas M +0.55 / H +1.05 — fixture v0.9.1 chạy lại xanh.
- **Monza** (save4.sav): lead S(19)→M(34) 57.6s + trail M(34)→S(19) 57.6s,
  deltas M +0.03 / H +1.32 (cả hai practice — usable) — không đổi.
- Silverstone (ca clamp gốc của v0.6.1): giờ cũng cả hai về model constants
  — xếp hạng giống hệt khi bỏ EstimatedLapTime (allocation không còn vai
  trò xếp hạng); các test allocation-H cũ được viết lại theo luật mới.

### Tests

- 17 test mới (tổng 450/450 xanh): ma trận tier đủ 5 dòng của §3 + "không
  bao giờ 'allocation'/'clamped' làm nguồn xếp hạng" + toàn bộ DoD
  Interlagos trên fixture `tests/helpers/interlagos-fixture.ts` (số thật
  §4 — không bịa). Test Silverstone allocation-H cũ viết lại theo luật mới.

## [0.9.2] — What-if SC/VSC: re-price chi phí pit bằng cột thật của track

Hoàn thành phần việc v0.9 (§2.2.3) còn dang dở — prompt v0.9.0 gốc bị bỏ
dở dang ở bước probe (`2be48ca`), phần feature chưa từng được commit; release
này đóng nó lại như phiên bản 0.9.2 (0.9.1 đã phát hành trước đó). Câu hỏi
người dùng: *"Nếu Safety Car/VSC ra ở vòng X thì nên pit không, plan nào
rẻ nhất?"* — trả lời bằng số thật, không bịa.

### Added — parser: 4 cột SC/pit từ Races_Tracks vào model (D1)

- `Races_Tracks` mang sẵn chi phí pit theo điều kiện của từng track:
  `PitLaneTimeLoss` (green), `GreenFlagTimeLoss`, `SafetyCarTimeLoss` (SC)
  và `SafetyCarChance` (0..1). Probe đã xác nhận trên save thật: Pit − Green
  = đúng 2.0s trên cả 26 track; MarinaBay = 29/27/16 · chance 2/3.
- `getRaces` (soft-select — schema cũ thiếu cột → `undefined`, không vỡ
  parse), `SaveModel.races[]` thêm `trackSafetyCarChance`,
  `trackPitLaneTimeLossS`, `trackGreenFlagTimeLossS`, `trackSafetyCarTimeLossS`
  (đơn vị GIÂY — hằng số chi phí engine, precedent `estimatedLapTimeS`).
- `scripts/audit-sc-v092.ts` in các cột này từ SaveModel trên save thật
  (23 track đều khớp probe, Pit−Green 2.0) + lịch sử SC/VSC mùa.

### Added — engine `whatIfSCVSC` (D2)

- Re-price mọi plan khả thi của lab dưới kịch bản SC/VSC do người dùng
  chọn (vòng bắt đầu + độ dài cửa sổ — save KHÔNG lưu lịch sử SC theo vòng,
  cửa sổ là input, engine chỉ cung cấp giá hợp lý).
- **Giá pit trong SC = chi phí pit green của model × (SafetyCarTimeLoss /
  PitLaneTimeLoss) của track** — MarinaBay: 20.7 × 16/29 = 11.4s. Chi phí
  green giữ nguyên hằng số đã backtest (20.7s), KHÔNG thay bằng 29s thô của
  game. VSC không có cột riêng → trung điểm green↔SC = 16.1s, gán nhãn
  giả định rõ ràng.
- Chỉ re-price chi phí pit trong cửa sổ; deg/delta/bộ lốp giữ nguyên — mọi
  row đều là plan đã qua luật khả thi số bộ của từng xe (v0.9.1), không plan
  mới xuất hiện. Rows xếp lại theo thời gian kịch bản; mỗi row hiển thị
  green → scenario, số giây tiết kiệm, số pit trong cửa sổ.
- Lưu ý có cấu trúc (key + params, UI dịch): `scRatio`, `vscMidpoint`,
  `repricedOnly`, `userWindow`.

### Added — UI Tyre Lab: card "What-if SC/VSC" (D3)

- Card riêng dưới card What-if: toggle bật/tắt, chọn SC/VSC, slider vòng
  bắt đầu (mặc định = pit đầu tiên của plan lead) + độ dài cửa sổ.
- Dòng ngữ cảnh: khả năng SC của track (%), cột game pit/green/SC (giây),
  lịch sử mùa từ Races_Results (20/44 chặng có SC · 12/44 có VSC trên save
  thật).
- Save thiếu cột → card báo "what-if SC/VSC tắt, không bịa số" thay vì
  đoán. i18n vi/en đầy đủ.

### Số liệu khóa trên save MarinaBay (fixture mirror autosave-4.sav)

- SC, cửa sổ [17,19] (mặc định = pit đầu lead): lead S→S→M
  **97.1s → 87.8s (−9.3s, 1 pit trong cửa sổ)**; trail M→S→S giữ 97.1s.
- SC, cửa sổ [27,44] phủ cả 2 pit trail: M→S→S
  **97.1s → 78.5s (−18.6s)** — hòa green 97.1/97.1 bị phá, plan 2-stop
  hedge thành nhanh nhất dưới SC.
- VSC [17,19]: lead 97.1 → 92.5s (−4.6s).

### Tests

- 13 test mới (tổng 433/433 xanh): 9 engine (giá SC/VSC đúng tỉ lệ cột
  thật, tiết kiệm từng row, cửa sổ trượt → không đổi, không hồi sinh plan
  2-M, assumptions có cấu trúc, null khi thiếu cột) + 4 component (context
  line số thật, rows re-price, hero green không đổi, i18n vi/en).
- Audit script trên save thật chứng minh D1 end-to-end (láb pre-weekend →
  what-if tắt trung thực, phần giá khóa bằng fixture).

## [0.9.1] — Chiến thuật lốp phải chạy được trên đúng số bộ còn dùng được

Minor bump theo prompt v0.9.1 (sửa lỗi logic nghiêm trọng, không phải patch).
Lỗi do Nguyen phát hiện và assistant kiểm chứng 2026-11-15 trên save
MarinaBay pre-race `autosave-4.sav` (Day 46663, race 204, 62 vòng,
post-quali): web v0.8.1 đề xuất **lead S→M→M (94.0s)** trong khi mỗi xe chỉ
có đúng **1 bộ M dùng được** (bộ mới #8, đời 31 vòng) — 2 bộ M còn lại bị
khóa (`AvailabilityState = 2`). Plan của game (S→M→H, 103.7s) mới là hình
dạng đúng. Kho khả dụng mỗi xe: S [21,21,21,19,19] · M [31] · H [48].

### Root cause

`buildTyreInventory` chỉ tính **cap theo bộ tốt nhất** mỗi hợp chất
(`maxStint[C] = min(modelLife, best set life)`), không đếm **số bộ**;
`evaluateStrategy` chỉ kẹp mỗi stint ≤ cap nên một plan lặp M ở 2 stint
(23 ≤ 31, 23 ≤ 31) đều qua — như thể một bộ M mới chạy được 2 lần. Block
"count stints per compound" cũ chỉ đếm **tổng cả đội** (M cần 2, cả đội có
2 → không flag) và chỉ đẩy một assumption rồi vẫn đề xuất plan.

### Changed — luật khả thi mới, một định nghĩa dùng khắp nơi (`c91c162`)

- **Greedy set assignment theo từng xe** (`assignSetsForCar`,
  `isPlanFeasibleForCar`): với mỗi hợp chất, stint xếp giảm dần theo độ dài
  đối chiếu bộ khả dụng của ĐÚNG xe đó (`AvailabilityState = 0`,
  `lifeRemaining > 0`) giảm dần theo đời — stint thứ k phải vừa bộ tốt thứ
  k. Cấm cộng dồn kho 2 xe: bộ của xe 1 không chạy được cho xe 2.
- `buildTyreLab`: sau khi re-split theo cap, mọi plan phải gán được bộ trên
  **cả 2 xe**; không gán được → loại khỏi xếp hạng với note đúng định dạng:
  *"Bỏ phương án nhanh hơn theo model vì kho không chạy được: S→M→M — cần
  2 stint M (23 + 23 vòng) nhưng mỗi xe chỉ có 1 bộ M khả dụng (đời 31)"*.
  Block "tạm giả định dùng lại bộ tốt nhất" đã bị xóa (tiền đề không còn).
- **`setUsed` lấy từ phép gán thật** (thêm `tyreSetId`): stint dài nhất ↔ bộ
  đời dài nhất — không còn chọn độc lập khiến 2 stint trỏ chung một bộ.
- **`vsBestS` re-base sau lọc**: so với plan khả thi tốt nhất (lead = +0.0s)
  thay vì model best 90.7s đã bị loại; `modelTimeS` giữ nguyên để tham chiếu.
- `priceOn` (lead/trail) tính trên kho đúng xe đó và trả `null` khi plan
  không gán được; `whatIfPitShift` nhận thêm kho xe đang xét — dời pit làm
  stint vượt đời bộ → `shifted: null, clamped: true`; `buildWetPlan` áp cùng
  luật cho I/W (Inter 5 bộ mới/xe, Wet 2 bộ mới/xe) khi có inventory.

### Added — UI hiện bộ lốp gán cho từng stint (`976c9e6`)

- Bảng stint của plan lead **và** xe dưới hiện đúng bộ được gán:
  *"bộ #8 · mới · đời 31"* (vi) / *"set #8 · fresh · life 31"* (en) — số
  từ `setUsed.tyreSetId` của engine, view không tự suy lại.
- Toggle mưa: wet plan chạy qua cùng luật bộ; không gán được → state
  "thiếu dữ liệu" như cũ.

### Số liệu khóa trên save MarinaBay (autosave-4.sav, Day 46663)

- **Sau fix — lead: S→S→M (S17/S18/M27), pit 17,35 · 97.1s, 2 stops**;
  stint M 27 vòng chạy bộ mới #8 (đời 31).
- **Trail: M→S→S (M27/S17/S18), pit 27,44 · 97.1s** — hòa tuyệt đối với
  lead (cùng multiset S/S/M) → tách để tránh dẫm chân + hedge; pit cách
  nhau ≥ 3 vòng (27/17 = 10, 44/35 = 9).
- **Không plan 2-M và không plan 2-H nào** xuất hiện; tổng số plan khả thi
  **22/52** sau sanity filter. S→M→H tốt nhất của engine: S15/M23/H24 ·
  101.9s (thứ 6) — game plan giữ nguyên 103.7s (pit 19,38).
- Lead `vsBestS` = **+0.0s** (không phải +6.4s so với model best 90.7s bị
  loại). Mọi số đã đối chiếu bằng `scripts/compute-marina-feasible.ts`
  (mirror đúng pipeline engine, để lại trong repo).
- **Hồi quy Monza** (save4.sav Day 46635): lead S(19)→M(34) 57.6s + trail
  M(34)→S(19) 57.6s không đổi. (Plan 2-pit M→S→M 54.5s cũ của Monza cũng
  bị loại đúng luật — mỗi xe chỉ có 1 bộ M.)

### Tests

- 24 test mới (tổng 420/420 xanh): luật greedy (đủ bộ / thiếu bộ / đủ số
  nhưng bộ ngắn / vừa đúng đời / state 2 không tính / 2 xe khác kho / I+W),
  buildTyreLab trên fixture MarinaBay (lead/trail/note/vsBestS/game plan/
  22-of-52), what-if set gate, wet set gate, component test bộ gán (#8)
  trên cả vi + en.

## [0.8.1] — F5 đọc lại ĐÚNG file save trên đĩa (không cần bấm Đổi save + nạp lại)

Patch bump theo prompt v0.8.1. Yêu cầu của Nguyen 2026-11-15: đang chơi game
ghi đè file save sau mỗi chặng, nhưng web chỉ hiện bản parse cached trong
IndexedDB — muốn dữ liệu mới phải bấm "Đổi save" rồi chọn lại file nhiều
lần trong một buổi. Giờ **F5 là đủ**: nếu file trên đĩa đã đổi, app tự đọc
lại và parse lại; file chưa đổi thì giữ nguyên bản cache (không tốn công
parse vô ích).

### Added — giữ FileSystemFileHandle lúc chọn file (`3ce1914`)

- Đường click (dropzone + nút Đổi save) trên **Chromium** dùng
  `showOpenFilePicker` thay cho `<input type=file>` → giữ lại
  `FileSystemFileHandle` của đúng file đã chọn, lưu vào cùng store IndexedDB
  `pitwall-db` (key `pitwall:last-active-handle`, cạnh `pitwall:last-active`).
  Handle chỉ nằm trên máy người dùng; file .sav thô VẪN KHÔNG BAO GIỜ được
  lưu/upload (hợp đồng local-first giữ nguyên). Firefox/Safari không có API
  này → mọi đường đều fallback về hành vi cũ, không vỡ gì.
- Record handle gắn `saveId` (SHA của save lúc capture): mở save khác bằng
  kéo-thả (không có handle) KHÔNG bao giờ ghi đè/xóa handle cũ — và boot
  bỏ qua handle không thuộc save đang mở (không bao giờ nạp nhầm file khác).
- `StoredSave` thêm `fileLastModified` (tương thích ngược — record cũ coi
  như "không rõ", so sánh rơi về tên + kích thước).
- Người dùng bấm hủy hộp chọn file (`AbortError`) → im lặng hoàn toàn.

### Added — F5 đọc lại + UI trạng thái trung thực (`4449257`)

- Boot (`SaveAutoRestore`) chỉ gọi `queryPermission` — KHÔNG BAO GIỜ gọi
  `requestPermission` lúc boot (cần thao tác người dùng) và không tự mở
  picker dưới mọi hình thức:
  - quyền `granted` + file **đổi** (`lastModified`/size/tên) → parse lại
    từ đĩa qua đúng luồng cũ (progress → ghi đè cache → entry SHA cũ vẫn
    nằm trong thư viện) + toast "Save đã được đọc lại (Day …)";
  - `granted` + file **chưa đổi** → khôi phục cache như cũ, `parsedAt`
    giữ nguyên (không parse lại vô ích);
  - `prompt`/`denied`/không có API → khôi phục cache + sidebar hiện nút
    một-click **"Cho phép đọc lại file save"** (gọi `requestPermission`
    từ cú click — đúng 1 click thay vì chọn lại file; từ chối thì mọi
    thứ vẫn như cũ);
  - file bị xóa/dời (`NotFoundError`) → khôi phục cache + toast "Không
    tìm thấy file save ở vị trí cũ…" + xóa handle cũ (không thử lại mãi).
- Footer sidebar có 3 trạng thái trung thực (không hứa quá): "Tự động đọc
  lại khi F5" khi handle hoạt động; nút một-click khi cần cấp lại quyền;
  dòng "Trình duyệt này không hỗ trợ đọc lại tự động — dùng Đổi save như
  trước" trên trình duyệt khác Chromium.
- **Giới hạn đã nói thẳng:** quyền đọc lại theo origin và có thể bị thu
  hồi — Chrome thường giữ sau F5, nhưng khi hết quyền thì vẫn còn nút
  một-click. Handle trỏ đúng **file đã chọn** (vd `save4.sav`), không
  phải "file mới nhất trong thư mục" — game tạo file tên khác thì vẫn
  phải chọn lần đầu.

### Tests

- 29 test mới (tổng 396/396 xanh): matrix outcome boot (granted đổi/chưa
  đổi, prompt, NotFoundError, không API), luồng một-click (đọc lại, từ
  chối, chưa đổi, file mất, handle ngoại lai), tương thích record cũ
  không `fileLastModified`, cascade xóa handle (deleteSave /
  clear last-active), sidebar render đúng 3 trạng thái + click.

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
