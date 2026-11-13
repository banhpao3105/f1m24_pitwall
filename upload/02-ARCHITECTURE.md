> Gộp từ các file cũ: 03-ARCHITECTURE-NEXTJS.md — nội dung giữ nguyên, chỉ gộp file, không cắt ý.


---

<!-- Nguồn: 03-ARCHITECTURE-NEXTJS.md -->

# 03 — Kiến trúc Next.js (full)

## 3.1. Stack chốt cho v1

| Lớp | Lựa chọn | Vì sao |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript (strict)** | SSG/SSR cho landing + docs, CSR cho dashboard nặng. App Router cho routing + layout lồng nhau đúng kiểu pit wall. |
| Styling | **Tailwind CSS v4 + shadcn/ui + CSS variables (design token)** | Token-first, đổi theme không sửa component. shadcn/ui cho table, dialog, tabs, slider, tooltip — đúng nhu cầu dashboard. |
| Motion | **Framer Motion (Motion) + CSS transitions** | Animation có chủ đích: number tween, stagger, live pulse. Tôn trọng `prefers-reduced-motion`. |
| Charts | **Recharts (chính) + ECharts (khi cần chart nặng: pace trace, tyre deg curve)** | Recharts đủ cho bar/line/area/sparkline. ECharts cho scatter/heatmap lớn. Không dùng 2 thư viện cho cùng 1 loại chart. |
| i18n | **next-intl** | VI/EN, routing `/vi/...` và `/en/...`, message file tách riêng. |
| State | **Zustand (UI + session state) + TanStack Query (derived data cache, nếu cần)** | Không Redux — quá nặng. Zustand đủ cho save session, filters, compare. |
| Data / Parse | **sql.js (WASM) + GVAS parser (mang từ bản cũ) trong Web Worker** | Không block UI. Xem 3.3. |
| Storage local | **IndexedDB (idb-keyval) + OPFS (khi cần lưu save lớn)** | Lưu save đã parse (normalized model, không lưu file .sav thô trừ khi user cho phép), lưu lịch sử, lưu preference. Không dùng localStorage cho dữ liệu lớn. |
| Test | **Vitest + Testing Library + Playwright** | Unit cho engine, component test cho UI, E2E cho flow nạp save → xem khuyến nghị. |
| Lint/Format | **ESLint + Prettier + TypeScript strict + knip (dead code)** | Bắt buộc chạy trong CI. |
| Deploy | **Vercel (khuyến nghị) hoặc static export + Cloudflare Pages** | App này local-first, không cần server. Static export là đủ cho v1 nếu không dùng Server Action. Xem 3.6. |

**Không dùng ở v1:** Backend DB (Postgres/Supabase), auth, tRPC/GraphQL, AI LLM server-side. Mọi phân tích chạy client-side. Nếu sau này cần share/compare cloud thì thêm API riêng, không nhét vào v1.

## 3.2. Cấu trúc thư mục (khung sườn)

```
f1-pitwall/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx                 # Root layout: font, theme, providers, topbar
│   │   ├── page.tsx                   # Landing / Upload (chưa có save → onboarding)
│   │   ├── (wall)/                    # Nhóm route cần save đã nạp
│   │   │   ├── layout.tsx             # Pit Wall shell: sidebar + command bar + live status
│   │   │   ├── page.tsx               # / — Pit Wall home (KPI + next race + alerts)
│   │   │   ├── race/[raceId]/page.tsx # Race Weekend: strategy + tyre + quali/race sim
│   │   │   ├── tyres/page.tsx         # Tyre Lab
│   │   │   ├── cars/page.tsx          # Car Lab: pace, parts, durability
│   │   │   ├── drivers/page.tsx       # Drivers + duel
│   │   │   ├── teams/page.tsx         # Teams comparison
│   │   │   ├── season/page.tsx        # Season data + calendar
│   │   │   ├── strategy/page.tsx      # Strategy + finance + personnel
│   │   │   ├── research/page.tsx      # Regulations + R&D queue
│   │   │   └── gazette/[raceId]/page.tsx # Gazette (narrative)
│   │   └── library/page.tsx           # Save Library: nhiều save, so sánh
│   ├── api/                           # Chỉ dùng nếu cần (health, version). Không parse save ở server.
│   └── globals.css                    # Tailwind + design token (file 06)
├── src/
│   ├── parser/                        # P0 — trái tim
│   │   ├── gvas/                      # GVAS parser (port từ bản cũ, TS hóa)
│   │   ├── sqlite/                    # sql.js loader + worker client
│   │   ├── schema.ts                  # CORE_TABLES, hasTable, columns, version detect
│   │   ├── repositories/              # Query SQL → raw rows (1 file / 1 domain)
│   │   │   ├── races.repo.ts
│   │   │   ├── drivers.repo.ts
│   │   │   ├── teams.repo.ts
│   │   │   ├── tyres.repo.ts
│   │   │   ├── parts.repo.ts
│   │   │   └── …
│   │   ├── normalize/                 # Raw rows → Normalized Model (file 04)
│   │   └── worker/
│   │       ├── parse.worker.ts        # Worker entry: nhận ArrayBuffer → trả Normalized Model
│   │       └── parse-client.ts        # API gọi worker: progress, cancel, error
│   ├── domain/                        # Type + model thuần, không import React
│   │   ├── types.ts                   # Save, Season, Race, Driver, Team, Part, Tyre…
│   │   ├── constants.ts               # Points system, tyre compounds, track list
│   │   └── provenance.ts              # Evidence, Confidence, Assumption types
│   ├── engines/                       # P0/P1 — logic phân tích, thuần TS, test được
│   │   ├── pace.engine.ts             # Pace board, gap, quali/race sim
│   │   ├── tyre.engine.ts             # Compound life, stint optimizer, pit window
│   │   ├── strategy.engine.ts         # Undercut/overcut, safety car, weather
│   │   ├── car.engine.ts              # Part score, durability, failure risk
│   │   ├── finance.engine.ts          # Budget, cost-per-point, expertise banking
│   │   ├── personnel.engine.ts        # Contract, morale, FA intel
│   │   ├── regulation.engine.ts       # Vote impact, R&D queue
│   │   └── recommend/                 # Recommendation builder: { action, why, evidence, confidence, risk }
│   ├── store/
│   │   ├── save.store.ts              # Zustand: current save, parse status, errors
│   │   ├── filters.store.ts           # Season, race, driver, team selection
│   │   └── ui.store.ts                # Sidebar, command palette, theme, locale
│   ├── components/
│   │   ├── ui/                        # shadcn/ui (button, table, tabs, slider…)
│   │   ├── pitwall/                   # KpiStrip, AlertBanner, RaceClock, TimingTower…
│   │   ├── charts/                    # PaceChart, TyreDegChart, Sparkline…
│   │   ├── tyres/                     # StintTimeline, CompoundBadge, PitWindow…
│   │   ├── recommendations/           # RecommendationCard, EvidenceList, ConfidenceBadge
│   │   └── gazette/                   # Narrative components (giữ phong cách báo)
│   ├── lib/
│   │   ├── format.ts                  # Lap time, gap, currency, date
│   │   ├── i18n/                      # next-intl config
│   │   └── utils.ts                   # cn(), etc.
│   └── design-system/                 # Token + doc sinh từ ui-ux-pro-max (file 06)
│       ├── tokens.css
│       ├── tokens.ts
│       └── DESIGN_SYSTEM.md           # Output của uipro --design-system (khóa lại)
├── public/
│   ├── sql-wasm/                      # sql-wasm.wasm + sql-wasm.js (self-host, không CDN)
│   ├── tracks/                        # Track map SVG (tự vẽ tối giản, không dùng ảnh game)
│   └── locales/                       # vi.json, en.json (nếu không để trong src)
├── tests/
│   ├── fixtures/                      # Save mẫu (nhỏ, anonymized) + expected JSON
│   │   ├── f1m24-sample.sav
│   │   └── expected-normalized.json
│   └── engines/                       # tyre.engine.test.ts, pace.engine.test.ts…
├── docs/                              # Bộ .md này (copy vào repo)
└── .github/workflows/ci.yml
```

**Quy tắc import (bắt buộc):**
- `components/*` không import `parser/*` trực tiếp. Chỉ import `domain/*`, `engines/*`, `store/*`.
- `engines/*` không import React, không đọc IndexedDB, không fetch. Input là Normalized Model, output là kết quả + evidence.
- `parser/*` không import UI. Parser trả về model hoặc lỗi có mã (`NOT_A_SQLITE_DB`, `UNSUPPORTED_SAVE_FORMAT`, `MISSING_CORE_TABLES`, `NO_COMPLETED_RACES`).

## 3.3. Luồng dữ liệu — từ file .sav tới khuyến nghị

```
[User kéo-thả .sav]
      ↓ (File → ArrayBuffer, không đọc bằng FileReader trên main thread quá lâu)
[parse.worker.ts] — Web Worker
      ├─ 1. GVAS parse → tách SQLite bytes (kiểm tra header "SQLite format 3")
      ├─ 2. sql.js init (WASM lazy-load, cache 1 lần)
      ├─ 3. Schema detect: version, tables, columns
      ├─ 4. Repositories query → raw rows
      └─ 5. Normalize → Normalized Model (JSON serializable)
      ↓ postMessage (progress: 10% → 40% → 70% → 100%)
[Main thread: save.store]
      ├─ Lưu model vào Zustand (in-memory) + IndexedDB (persist, key = save hash)
      ├─ Lưu metadata: team, season, day, file name, hash, parsedAt
      └─ Invalidate derived cache
[Engines — chạy sync, nhanh, có memo]
      ├─ pace / tyre / car / strategy / finance / personnel / regulation
      └─ Mỗi engine trả Recommendation[] + ChartData + Evidence
[UI — App Router]
      ├─ Pit Wall home đọc engines cần thiết (không tính lại toàn bộ mỗi lần đổi tab)
      └─ Drill-down: click 1 KPI → route chi tiết với filter đã set
```

**Hiệu năng:**
- Parse trong worker, có `progress` + `cancel` (AbortController / worker.terminate).
- Normalized Model phải JSON-serializable để postMessage không cần structured clone phức tạp.
- Engine memo bằng `useMemo` + key `(saveHash, seasonId, raceId, filters)`. Không tính lại khi chỉ đổi tab UI.
- Chart data nên tính ở engine, không tính trong render.
- Lazy-load route: Tyre Lab, Car Lab, Gazette chỉ load khi vào.

## 3.4. State & Routing

- **URL là source of truth cho view:** `/[locale]/race/12?tab=tyres&driver=44` — share được, back được.
- **Zustand là source of truth cho session:** save hiện tại, season/race đang chọn, filters.
- **Không lưu file .sav thô lên server.** IndexedDB chỉ lưu model đã parse + metadata. Có nút “Xóa save khỏi trình duyệt” rõ ràng.
- **Multi-save:** Library cho phép nhiều save, mỗi save có `id = hash(file)`. So sánh 2 save ở v2 (không làm v1).

## 3.5. Lỗi & trạng thái (phải thiết kế trước, không để trắng trang)

| Trạng thái | UI |
|---|---|
| Chưa có save | Onboarding: dropzone lớn, giải thích privacy, save mẫu để thử |
| Đang parse | Progress bar + bước đang làm (“Đang tách SQLite…”, “Đang đọc Races_Results…”), có Cancel |
| Save không phải F1M | Lỗi `NOT_A_SQLITE_DB` / `UNSUPPORTED_SAVE_FORMAT` + hướng dẫn file đúng |
| Thiếu bảng core | Liệt kê bảng thiếu, không crash, gợi ý save khác |
| Không có race hoàn thành | Trạng thái trống có hướng dẫn, vẫn cho xem Factory/Season |
| Thiếu bảng mở rộng | Module đó hiện “Thiếu dữ liệu — dùng trung bình save” + confidence LOW |
| Worker lỗi / WASM lỗi | Retry + “Tải lại WASM”, log lỗi local |

## 3.6. Deploy & vận hành

- **Khuyến nghị v1:** Vercel (Next.js native) hoặc `output: 'export'` → Cloudflare Pages / Netlify. Vì app local-first, static export là đủ và rẻ nhất, offline tốt nhất.
- **WASM self-host:** Copy `sql-wasm.wasm` vào `public/sql-wasm/`, không load từ CDN (tránh CORS + version drift).
- **PWA (P1):** `next-pwa` hoặc manual service worker — cho phép mở lại save đã parse khi offline.
- **Không có backend, không có DB, không có auth ở v1.** Nếu cần analytics sản phẩm thì dùng privacy-friendly, opt-in, không gửi nội dung save.
- **Versioning:** Mỗi release ghi rõ hỗ trợ F1M version nào, schema nào. `Settings → About` hiện parser version + engine version.
