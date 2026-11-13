> Gộp từ các file cũ: 00-README.md, 01-VISION-PITWALL.md — nội dung giữ nguyên, chỉ gộp file, không cắt ý.


---

<!-- Nguồn: 00-README.md -->

# F1 Pit Wall — Bộ hoạch định đập đi xây lại

> **Mục tiêu:** Biến file `F1_Manager_Circuit_Gazette.html` (1 file, 21.426 dòng, 2,3 MB) thành **F1 Pit Wall** — một dashboard manager kiểu pit wall thật, chạy bằng **Next.js full**, đọc trực tiếp file save F1 Manager 23/24, phân tích và **khuyến nghị hành động** cho người chơi, thay vì chỉ “kể lại” kết quả.
>
> **Nguyên tắc vàng:** Mọi con số đều truy vết được về save. Không đoán. Không bịa. Không gửi dữ liệu ra khỏi máy người chơi.

## Đọc bộ này như thế nào — bộ mới chỉ còn 8 file

> Đã rút gọn từ 13 file cũ (00–10 + SYSTEM-PROMPT + A1) xuống còn 8 file ngày 2026-11-13.
> Nội dung giữ nguyên, chỉ gộp file theo nhóm logic. Không cắt ý.

| # | File mới | Gồm file cũ | Đọc khi |
|---|----------|-------------|---------|
| 00 | `00-README-VISION.md` | 00-README + 01-VISION | Muốn hiểu tổng quan + “pit wall thật là gì”, phục vụ ai |
| 01 | `01-AUDIT-DATA.md` | 02-AUDIT + 04-DATA-MODEL + A1-SQL-INVENTORY | Làm việc với file cũ / save — giữ gì, bảng nào, model nào |
| 02 | `02-ARCHITECTURE.md` | 03-ARCHITECTURE | Bắt tay code — stack, thư mục, luồng dữ liệu, parse save |
| 03 | `03-ANALYTICS-ENGINES.md` | 05-ANALYTICS-ENGINES | Làm engine — Pace, Tyre, Strategy, Car, Research, Race Sim |
| 04 | `04-UX-UI-ROUTES.md` | 06-UX-UI-DESIGN-SYSTEM + 07-ROUTES-PAGES-IA | Làm giao diện + màn hình — design system cyber, IA, route, wireframe |
| 05 | `05-ROADMAP-STANDARDS.md` | 08-ROADMAP + 09-ENGINEERING-STANDARDS | Lên lịch + chuẩn code, test, hiệu năng, i18n, privacy |
| 06 | `06-DECISIONS.md` | 10-DECISIONS | Quyết định còn treo — cần Nguyen chốt trước khi code |
| 07 | `07-SYSTEM-PROMPT.md` | SYSTEM-PROMPT | Ép AI làm theo bộ này + check và push commit GitHub sau mỗi bước |

**Lưu ý khi đọc các file đã gộp:** bên trong mỗi file, tham chiếu kiểu “file 03”, “file 06”, “file 08” là số thứ tự của bộ cũ. Đối chiếu bằng bảng trên: file 03 cũ = `02-ARCHITECTURE.md`, file 06 cũ = phần đầu của `04-UX-UI-ROUTES.md`, file 08 cũ = phần đầu của `05-ROADMAP-STANDARDS.md`, file 10 cũ = `06-DECISIONS.md`.

## Tóm tắt 1 trang

**Vấn đề của bản cũ:**
- 1 file HTML khổng lồ, CSS + sql.js WASM + GVAS parser + UI strings VI/EN + logic phân tích trộn lẫn. Sửa 1 chỗ sợ vỡ 10 chỗ. Không test được, không tái dùng được, không mở rộng được.
- Chỉ đọc được sau khi đua xong (gazette / báo cáo). Người chơi cần quyết định **trước và trong lúc đua**: lốp nào, pit lúc nào, nâng cấp gì, ký ai, bỏ phiếu luật nào.
- Không có “khuyến nghị có độ tin cậy + lý do + nguồn dữ liệu”. Người chơi phải tự suy luận từ bảng.

**Hướng đi mới — Pit Wall:**
1. **Live-first, không phải report-first.** Màn hình chính là “wall” trong race weekend: tình trạng xe, lốp, pace, thời tiết, đối thủ, cửa sổ pit — cập nhật theo từng save người chơi nạp vào.
2. **Decision-first.** Mỗi module kết thúc bằng 1 khuyến nghị: *Làm gì / Vì sao / Rủi ro gì / Dữ liệu nào chứng minh / Độ tin cậy bao nhiêu*. Không có khuyến nghị = chưa xong module.
3. **Local-first, privacy-first.** Parse `.sav` hoàn toàn trên máy (Web Worker + sql.js WASM, như bản cũ). Không upload, không server lưu save. Có thể chạy offline, deploy tĩnh.
4. **Next.js App Router + TypeScript + Tailwind + shadcn/ui + Framer Motion + Recharts/ECharts.** Tách rõ: `parser → normalized model → analytics engines → UI`. Engine thuần TypeScript, test được bằng unit test với save mẫu.
5. **Cyber pit-wall UI từ ui-ux-pro-max.** Không phải “dark mode cho có”. Là design system có token, có motion có chủ đích, có trạng thái live, có hierarchy cho mắt quét nhanh trong 3 giây — như kỹ sư pit wall thật.

## 3 quyết định kiến trúc lớn nhất (đọc kỹ trong file 03)

1. **Parser chạy trong Web Worker, không chạy trên main thread.** File save lớn, SQL nặng — UI không được đơ khi parse.
2. **Normalized Model là “hợp đồng” duy nhất giữa parser và UI.** UI không bao giờ query SQL trực tiếp. Parser đổi (F1M 25, schema mới) thì chỉ sửa parser + adapter, UI và engine không vỡ.
3. **Engine trả về `{ value, confidence, evidence[], assumptions[] }`, không trả về số trần.** Đây là điểm khác biệt giữa “bảng số liệu” và “cố vấn chiến thuật”.

## Nguồn tham chiếu đã kiểm chứng

- **File gốc:** `workspace/user/files/F1_Manager_Circuit_Gazette.html` — 21.426 dòng, 2.335.278 bytes. Tabs: `kpi, strategy, cars, tyres, research, drivers, teams, season, gazette`. Ngôn ngữ VI/EN. Parser: GVAS (UESaveTool) → SQLite → sql.js WASM. Core tables: `Races, Races_Tracks, Races_Results, Teams, Staff_BasicData`.
- **ui-ux-pro-max skill:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill — 148.715 stars (tại thời điểm tra 13/11/2026), MIT, v2.0. Có 80 UI style (51 active), 192 palette, 74 font pairing, 25 loại chart, 192 reasoning rule theo ngành, 120 UX guideline, hỗ trợ Next.js / React / shadcn/ui. Cài bằng `npm i -g ui-ux-pro-max-cli` + `uipro init`, sinh design system bằng `python3 scripts/search.py "<brief>" --design-system`. Xem chi tiết trong file 06.
- **Pit wall thật (tham chiếu tư duy, không copy thương hiệu):** F1 pit wall = nhiều màn hình song song — timing tower, tyre/life, fuel/ERS, weather radar, pit window, radio — mỗi màn hình trả lời 1 câu hỏi trong < 3 giây, có cảnh báo đỏ/vàng, có người chịu trách nhiệm cho từng quyết định.

## Quy ước trong bộ tài liệu

- **Ngôn ngữ:** Tài liệu viết bằng tiếng Việt, thuật ngữ chuyên môn giữ tiếng Anh (`Pit Window, Stint, Degradation, Undercut`).
- **Mức độ ưu tiên:** `P0 = không có thì không gọi là Pit Wall`, `P1 = cần cho v1`, `P2 = v2`, `P3 = nice-to-have`.
- **Độ tin cậy (confidence):** `HIGH` = đo trực tiếp từ save, `MEDIUM` = suy ra từ trung bình lịch sử trong save, `LOW` = dùng hằng số model khi save thiếu dữ liệu — luôn phải ghi rõ nguồn trong UI.
- **Tên dự án tạm:** `f1-pitwall`. Chưa chốt tên thương mại — xem file 10.

## Bước tiếp theo (sau khi đọc xong)

1. Nguyen chốt 5 câu hỏi ở file 06-DECISIONS.md (đặc biệt: F1M 25 có hỗ trợ không? Deploy ở đâu? Có cần multi-save / so sánh 2 save không?).
2. Chạy lệnh sinh design system từ ui-ux-pro-max (file 04-UX-UI-ROUTES.md, phần Design System, mục 2) và khóa token.
3. Bắt đầu Phase 0–1 trong file 05-ROADMAP-STANDARDS.md, phần Roadmap: scaffold Next.js + parser worker + Normalized Model + 1 màn hình Pit Wall MVP.


---

<!-- Nguồn: 01-VISION-PITWALL.md -->

# 01 — Vision: Pit Wall thật là gì, và sản phẩm này phải trở thành gì

## 1.1. Câu chuyện 1 dòng

> Người chơi F1 Manager mở save lên, **trong 10 giây biết mình đang ở đâu, và trong 30 giây biết mình nên làm gì tiếp theo** — như một race engineer nhìn vào pit wall.

Bản Gazette cũ trả lời: *“Chuyện gì đã xảy ra?”*
Pit Wall mới phải trả lời thêm: *“Chuyện gì sắp xảy ra, và tôi nên làm gì với nó?”*

## 1.2. Pit wall thật hoạt động ra sao (mô hình tư duy)

Không cần mô phỏng y hệt F1 thật. Cần học **nguyên lý tổ chức thông tin** của nó:

| Nguyên lý | Pit wall thật | Áp dụng vào F1 Pit Wall |
|---|---|---|
| **Mỗi màn hình = 1 câu hỏi** | Timing, Tyre, Weather, Pit — không nhồi tất cả vào 1 màn | Mỗi route/module trả lời đúng 1 quyết định (file 07) |
| **Quét trong 3 giây** | Số lớn, màu ngữ nghĩa, đỏ = hành động ngay | KPI strip, delta chip, trạng thái RAG (đỏ/vàng/xanh) — không bắt đọc bảng dài để hiểu |
| **Cảnh báo trước, không báo cáo sau** | “Pit window mở trong 3 vòng”, “mưa trong 8 phút” | Dự báo + countdown + trigger, không chỉ lịch sử |
| **Mọi khuyến nghị có người chịu trách nhiệm** | Race engineer nói rõ “Box now, vì…” | Mỗi recommendation ghi: lý do, bằng chứng, độ tin cậy, rủi ro nếu làm ngược lại |
| **Dữ liệu có nguồn** | Telemetry có timestamp, có sensor | Mọi số có provenance: bảng nào trong save, mùa nào, chặng nào |
| **Chế độ “đang đua” vs “giữa chặng” khác nhau** | Race mode ≠ factory mode | 2 mode UI rõ rệt: `Race Weekend` (quyết định nhanh) và `Factory / Season` (quyết định dài hạn) |

## 1.3. Người dùng — ai, chơi như thế nào

### Persona chính: “Team Principal kiêm Race Engineer”

- Chơi F1 Manager 23/24 (có thể mở rộng 25 sau), 1 save dài nhiều mùa, đội tự chọn (thường là đội giữa/cuối bảng để “rebuild”).
- Nạp save sau mỗi race weekend hoặc trước mỗi chặng để lên kế hoạch.
- Không có thời gian đọc hết bảng. Muốn biết: **lốp, pit, pace, nâng cấp, tiền, nhân sự, luật**.
- Chơi bằng tiếng Việt hoặc tiếng Anh — cần i18n VI/EN ngay từ đầu, như bản cũ đã có.

### Persona phụ

| Persona | Nhu cầu khác biệt |
|---|---|
| Người chơi “storyteller” | Muốn Gazette — bản tin, awards, transfers, narrative. Đây là tính năng giữ chân, không phải core decision. Giữ lại, nhưng tách thành module riêng, không trộn vào Pit Wall. |
| Người chơi “min-maxer” | Muốn số thô, export CSV, so sánh part, tính điểm/budget. Cần bảng chi tiết + export + provenance đầy đủ. |
| Người mới | Muốn giải thích “vì sao”. Cần tooltip giải thích thuật ngữ, và chế độ “Giải thích như tôi mới chơi”. |

### Jobs To Be Done (JTBD) — top 10

1. Trước chặng: chọn chiến thuật lốp + số pit tối ưu cho đường đua này, với xe và tay đua của tôi.
2. Trước chặng: biết pace của tôi so với đối thủ trực tiếp (không phải so với Red Bull khi tôi đang đua với Haas).
3. Trong mùa: biết part nào đáng nâng cấp tiếp theo theo điểm/budget, và part nào đang xuống cấp gây lỗi.
4. Trong mùa: biết khi nào nên thay động cơ/hộp số/ERS để không dính phạt lưới.
5. Trước kỳ chuyển nhượng: biết tay đua/nhân sự nào đáng ký, lương neo bao nhiêu, ngưỡng chấp nhận ra sao.
6. Trước bỏ phiếu luật: biết luật nào có lợi/hại cho tôi, tác động bao nhiêu điểm/budget.
7. Sau chặng: biết mình mất điểm ở đâu — pace, pit, chiến thuật, hay lỗi tay đua.
8. So sánh 2 tay đua cùng đội: ai nhanh hơn, ai giữ lốp tốt hơn, ai xứng đáng ưu tiên nâng cấp.
9. Quản tiền: ngân sách còn bao nhiêu, chi gì thì sinh điểm, chi gì thì đốt tiền.
10. Lưu lại lịch sử: xem 1 tay đua / 1 part / 1 đường đua tiến triển qua các mùa.

**Quy tắc:** Một tính năng không phục vụ JTBD nào trong 10 cái trên thì xuống P2/P3.

## 1.4. Định vị sản phẩm

- **Không phải:** Wiki F1, game thay thế, tool cheat/hack save, app xem kết quả F1 thật.
- **Là:** *Companion phân tích save* — đọc save người chơi đã tạo ra, biến dữ liệu thô thành quyết định.
- **Khác biệt với bản cũ:** Từ “báo cáo sau chặng” → “trợ lý trước chặng + trong mùa”.
- **Khác biệt với spreadsheet/Reddit:** Mọi số đều từ **save của chính người chơi**, không phải số trung bình cộng đồng. Có provenance, có confidence, có ngữ cảnh đội của họ.

## 1.5. Nguyên tắc sản phẩm (product principles — dùng để cãi nhau khi thiết kế)

1. **Decision > Data.** Không hiển thị số mà không nói “số này nghĩa là gì, nên làm gì”.
2. **Traceable > Clever.** Thà nói “không đủ dữ liệu, dùng trung bình save” còn hơn đưa số đẹp nhưng không rõ nguồn.
3. **3-second scan.** Màn hình chính phải hiểu được khi liếc. Chi tiết nằm ở tầng 2 (click để drill-down).
4. **Local-first.** Save không rời máy. Không tài khoản bắt buộc. Không tracking hành vi.
5. **Graceful degradation.** Save thiếu bảng → module đó nói rõ thiếu gì, dùng fallback gì, không crash, không hiện số 0 giả.
6. **Bilingual from day 0.** VI/EN là tính năng, không phải việc dịch sau.
7. **Motion có lý do.** Animation chỉ để: (a) hướng mắt tới thay đổi, (b) cho thấy trạng thái live/đang tính, (c) phản hồi thao tác. Không animation trang trí làm chậm việc đọc số.

## 1.6. Thành công đo bằng gì

| Chỉ số | Mục tiêu v1 | Cách đo |
|---|---|---|
| Time-to-insight | Nạp save → thấy khuyến nghị đầu tiên < 10s (save thường) | Đo parse + render, log local |
| Time-to-decision | Từ màn hình chính → hiểu chiến thuật lốp cho chặng tới < 60s | Test với 5 người chơi thật |
| Recommendation coverage | ≥ 80% chặng có khuyến nghị lốp/pit với confidence ≥ MEDIUM | Đếm trên save mẫu |
| Trust | Người chơi bấm “đồng ý / hữu ích” cho khuyến nghị ≥ 70% | Nút feedback local, không gửi server |
| No-crash rate | Save F1M 23/24 hợp lệ parse được ≥ 98%, thiếu bảng không crash | Test suite với save mẫu + save lỗi |
| Performance | LCP < 2,5s, parse save 50–150MB không block UI | Lighthouse + đo worker |

## 1.7. Phạm vi — làm / không làm (v1)

**Làm (v1):** Parse .sav 23/24 local, 9 module cũ được tái cấu trúc thành Pit Wall, Tyre Lab + Race Sim + Strategy + Car + Research, multi-save library, VI/EN, export báo cáo.

**Không làm (v1):** Không sửa save / ghi ngược vào game (chỉ đọc), không live telemetry trong lúc game đang chạy (F1 Manager không expose API live), không tài khoản/cloud sync, không mobile app native (web responsive trước), không AI chatbot chung chung (khuyến nghị phải rule-based + có evidence, không hallucinate).

**Cân nhắc v2:** Hỗ trợ F1M 25, so sánh 2 save, share link báo cáo (chỉ số đã xử lý, không share file save), “what-if” simulator sâu hơn, PWA offline.
