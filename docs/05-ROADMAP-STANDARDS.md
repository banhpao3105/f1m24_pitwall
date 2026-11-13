> Gộp từ các file cũ: 08-ROADMAP.md, 09-ENGINEERING-STANDARDS.md — nội dung giữ nguyên, chỉ gộp file, không cắt ý.


---

<!-- Nguồn: 08-ROADMAP.md -->

# 08 — Roadmap: từ scaffold tới v2

> Ước lượng: 1 người làm part-time, mỗi phase 1–2 tuần nếu tập trung. Không cam kết ngày cụ thể — đây là thứ tự ưu tiên, không phải deadline.
> Mỗi phase kết thúc bằng demo được trên save thật. Không phase nào chỉ “xong code mà chưa chạy được”.

## Phase 0 — Foundation (P0, làm trước, không bỏ qua)

**Mục tiêu:** Có khung chạy được, parser chạy được, biết schema thật.

- [ ] Scaffold Next.js 15 + TS strict + Tailwind v4 + shadcn/ui + next-intl (VI/EN).
- [ ] Cài ui-ux-pro-max, sinh design system, khóa token (file 06).
- [ ] Trích GVAS + sql.js từ file HTML cũ → `src/parser/`, chạy trong Web Worker, có progress + cancel.
- [ ] Script `introspect-save`: dump schema từ 2–3 save thật → `tests/fixtures/schema/`.
- [ ] Normalized Model v0 + `SaveMeta` + error codes.
- [ ] Upload + Library tối giản: nạp save → thấy metadata (team, season, day).
- [ ] CI: lint + typecheck + unit test chạy được.

**Definition of Done:** Nạp save F1M 24 thật, thấy được team/season/day, không crash khi thiếu bảng optional.

## Phase 1 — Pit Wall MVP (P0)

**Mục tiêu:** Người chơi nạp save → thấy khuyến nghị đầu tiên trong 10 giây.

- [ ] Pit Wall Home: KPI strip + alerts + next race + 3 khuyến nghị hàng đầu.
- [ ] Tyre Engine v1 + Tyre Lab tối giản: recommended strategy + confidence + evidence.
- [ ] Pace Engine v1: pace board vs rival + gap.
- [ ] Race Weekend page: overview + pit window.
- [ ] Zustand store + routing `/wall/*` + deep-link.
- [ ] i18n VI/EN cho các màn hình MVP.
- [ ] Test: tyre + pace engine với fixture, E2E nạp save → xem khuyến nghị.

**Definition of Done:** 5 người chơi thử, 4/5 hiểu được chiến thuật lốp cho chặng tới trong 60 giây mà không cần hướng dẫn.

## Phase 2 — Car + Strategy + Research (P1)

- [ ] Car Lab: part grid, league table, durability/failure risk, dev queue (points-per-budget).
- [ ] Race Sim: quali sim + race sim (kế thừa logic cũ, viết lại UI).
- [ ] Strategy page: finance snapshot, personnel, loadout.
- [ ] Research page: regulation vote + impact + expertise banking.
- [ ] Drivers page: cards + duel + form.
- [ ] Season page: calendar + standings + race data table + export CSV.
- [ ] What-if cho Tyre Lab (slider pit sớm/muộn, toggle mưa).
- [ ] Feedback 👍/👎 cho recommendation (local).

**Definition of Done:** Mọi module P1 đều có recommendation + confidence + evidence. Không module nào chỉ hiện bảng mà không nói “nên làm gì”.

## Phase 3 — Gazette + Polish (P1/P2)

- [ ] Gazette route: tách narrative từ bản cũ thành component, giữ awards/transfers/highlights.
- [ ] Command palette (Cmd+K), keyboard shortcuts.
- [ ] PWA offline, persist save vào IndexedDB, mở lại không cần nạp lại.
- [ ] Export báo cáo: PDF/print cho Gazette + CSV cho Season.
- [ ] Polish motion: number tween, skeleton, stagger, live pulse — theo file 06.
- [ ] Accessibility audit + responsive audit 375/768/1024/1440.
- [ ] Performance audit: LCP, parse time, bundle size.

**Definition of Done:** Lighthouse ≥ 90 (desktop), parse save thường < 10s tới khuyến nghị đầu tiên, không lỗi a11y nghiêm trọng.

## Phase 4 — v2 (P2, sau khi v1 ổn định)

- [ ] Hỗ trợ F1M 25 (schema adapter mới, test với save 25 thật).
- [ ] So sánh 2 save (cùng đội, 2 mùa khác nhau / 2 chiến thuật khác nhau).
- [ ] Share link báo cáo (chỉ số đã xử lý, không share file save).
- [ ] “What-if” sâu hơn: đổi part, đổi driver, đổi supplier → xem pace/điểm dự kiến.
- [ ] Track map SVG chi tiết hơn + sector pace.
- [ ] Multi-language mở rộng (nếu có nhu cầu).

**Không làm ở v2 nếu chưa có bằng chứng người dùng cần:** Cloud sync, tài khoản, AI chatbot, mobile app native, sửa save.

## Rủi ro & cách giảm

| Rủi ro | Giảm bằng |
|---|---|
| Schema F1M 23/24 khác nhau | Introspect save thật ở Phase 0, adapter theo version, test fixture 2 version |
| Công thức tính điểm sai 1 điểm | Test đối chiếu standings tự tính vs standings trong save |
| Tyre model sai vì thiếu history | Luôn ghi confidence LOW + assumption, không đưa số đẹp giả |
| WASM load nặng / worker lỗi | Lazy-load, self-host WASM, retry, progress rõ ràng |
| Scope creep (muốn thêm mọi thứ) | JTBD top 10 (file 01) làm bộ lọc — không phục vụ JTBD thì xuống P2/P3 |
| UI cyber quá đà, khó đọc số | Design system khóa token + checklist (file 06), test với người chơi thật ở Phase 1 |

## Milestone demo (gợi ý)

| Milestone | Demo cho ai xem |
|---|---|
| Phase 0 xong | Tự demo: nạp save → thấy metadata |
| Phase 1 xong | 5 người chơi F1 Manager: “Hiểu chiến thuật lốp trong 60s không?” |
| Phase 2 xong | Cùng 5 người: “Biết nâng cấp gì, ký ai, vote gì không?” |
| Phase 3 xong | Public demo: deploy Vercel, share link, thu feedback |


---

<!-- Nguồn: 09-ENGINEERING-STANDARDS.md -->

# 09 — Engineering Standards: code, test, hiệu năng, i18n, privacy

## 9.1. Code standards

- **TypeScript strict:** `strict: true`, không `any` trừ khi parse dữ liệu ngoài (và phải có comment + zod validate nếu cần). `noUncheckedIndexedAccess` bật nếu được.
- **ESLint + Prettier:** Chạy trong CI, fail nếu lỗi. Không commit code chưa format.
- **Component:** 1 file 1 component chính, props có type rõ, không prop drilling quá 2 tầng (dùng store/context).
- **Engine:** Hàm thuần, không import React, không đọc localStorage/IndexedDB. Có JSDoc ghi công thức + nguồn.
- **Parser:** Không import UI. Lỗi có mã, không throw string trần.
- **Naming:** File kebab-case (`tyre.engine.ts`, `stint-timeline.tsx`), type PascalCase, hàm camelCase.
- **Không hard-code:** Màu, spacing, font — dùng token. String UI — dùng `locales/*.json`. Số model (0.28, 0.51…) — dùng constant có tên + comment nguồn.
- **Dead code:** Chạy `knip` mỗi release, xóa code không dùng.

## 9.2. Testing

| Tầng | Tool | Yêu cầu |
|---|---|---|
| Unit — engine | Vitest | Mỗi engine có test: input fixture → output kỳ vọng. Tyre + Pace + Standings bắt buộc 100% case chính. |
| Unit — normalize | Vitest | Thiếu bảng optional không throw. Standings tự tính khớp save. |
| Component | Testing Library | RecommendationCard, KpiStrip, StintTimeline render đúng + confidence badge hiện. |
| E2E | Playwright | Flow: mở app → nạp save mẫu → thấy Pit Wall Home → vào Tyre Lab → thấy recommendation. |
| Visual | Playwright screenshot (P2) | So sánh Pit Wall Home ở 1440px, không vỡ layout. |
| Fixture | Save mẫu versioned | `tests/fixtures/` có README ghi save nào, game nào, mùa nào, anonymized chưa. |

**Test oracle:** File HTML cũ là oracle — cùng 1 save mẫu, output mới (standings, tyre rec, pace) phải khớp output cũ trong sai số cho phép, hoặc ghi rõ lý do khác (công thức đã sửa).

## 9.3. Performance budgets (v1)

| Chỉ số | Budget |
|---|---|
| LCP (Pit Wall Home, đã có save) | < 2,5s |
| Parse save thường → khuyến nghị đầu tiên | < 10s (bao gồm WASM load lần đầu) |
| Bundle JS ban đầu | < 300 KB gzip (không tính WASM) |
| Engine tính lại khi đổi filter | < 100ms (memo, không tính lại toàn bộ) |
| Chart render | Không animation khi > 200 điểm |
| Lighthouse (desktop) | ≥ 90 |

**Cách đạt:** Lazy-load WASM + route, memo engine, virtualize table dài (nếu > 100 row), `next/image` cho ảnh (nếu có), không import ECharts khi chỉ cần Recharts.

## 9.4. i18n — VI/EN

- **Tool:** next-intl, routing `/vi/*`, `/en/*`. Mặc định theo trình duyệt, nhớ lựa chọn.
- **File:** `locales/vi.json`, `locales/en.json` — trích từ `UI[lang]` trong file cũ, không viết lại từ đầu.
- **Quy tắc:** Không string trần trong component. Key có namespace (`tyre.recommendation.title`). Số, ngày, tiền format theo locale (`Intl.NumberFormat`, `Intl.DateTimeFormat`).
- **Thuật ngữ:** Giữ thuật ngữ F1 tiếng Anh trong cả 2 ngôn ngữ (`Pit Window, Stint, Undercut, Degradation`) + tooltip giải thích tiếng Việt. Không dịch word-by-word gây khó hiểu.
- **Test:** Mở từng màn hình bằng cả 2 ngôn ngữ, kiểm tra tràn text (tiếng Việt thường dài hơn tiếng Anh).

## 9.5. Privacy & Security

- **Local-first:** Save không rời máy. Không upload, không gửi save lên server. Ghi rõ trong UI: “Generated locally — no data leaves your device” (giữ câu này từ bản cũ).
- **Không tracking:** Không analytics gửi nội dung save. Nếu dùng analytics sản phẩm thì opt-in, chỉ đếm lượt dùng tính năng, không gửi dữ liệu save.
- **XSS:** Không dùng `dangerouslySetInnerHTML` với dữ liệu từ save (tên driver/team custom có thể chứa HTML). Dùng React escape mặc định. Nếu cần render HTML (Gazette quote) thì sanitize.
- **File:** Chỉ chấp nhận `.sav`, kiểm tra header trước khi parse. Giới hạn kích thước file (vd: 500 MB) + thông báo rõ.
- **Xóa dữ liệu:** Nút “Xóa save khỏi trình duyệt” xóa IndexedDB + Zustand. Không giữ bản sao.
- **Không sửa save:** App chỉ đọc. Không ghi ngược vào file .sav. Ghi rõ trong UI để người chơi yên tâm.

## 9.6. Git & Release

- **Branch:** `main` (stable), `feat/<tên>` cho từng phase. PR có mô tả + screenshot (nếu UI) + test.
- **Commit:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`).
- **Release:** Tag `v0.1.0` (Phase 0), `v1.0.0` (Phase 2 xong), ghi rõ hỗ trợ F1M version nào trong release notes.
- **Changelog:** Ghi thay đổi công thức engine (vd: “Tyre: đổi Soft life từ X sang Y vì…”) — người chơi cần biết khi số thay đổi.
