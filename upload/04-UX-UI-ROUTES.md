> Gộp từ các file cũ: 06-UX-UI-DESIGN-SYSTEM.md, 07-ROUTES-PAGES-IA.md — nội dung giữ nguyên, chỉ gộp file, không cắt ý.


---

<!-- Nguồn: 06-UX-UI-DESIGN-SYSTEM.md -->

# 06 — UX/UI Design System: Cyber Pit Wall với ui-ux-pro-max

> Nguồn: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill — MIT, v2.0, 148.715 stars (13/11/2026).
> Skill này **không phải thư viện component**. Nó là **design intelligence**: reasoning engine sinh design system từ brief, với 80 UI style (51 active), 192 palette, 74 font pairing, 25 loại chart, 192 reasoning rule theo ngành, 120 UX guideline, hỗ trợ Next.js / React / shadcn/ui / Tailwind.
>
> Cách dùng đúng: **dùng skill để sinh + khóa design system, rồi implement bằng Tailwind + shadcn/ui + Framer Motion**. Không copy code mẫu của skill rồi dán vào mà không hiểu token.

## 6.1. Cài skill và sinh design system (làm 1 lần, khóa lại)

```bash
# Cài CLI (khuyến nghị)
npm install -g ui-ux-pro-max-cli

# Cài skill cho project
cd f1-pitwall
uipro init --ai claude
# (hoặc --ai cursor / --ai codex / --ai universal tùy tool đang dùng)

# Sinh design system cho Pit Wall — chạy 2–3 brief để so sánh
python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "F1 pit wall operations dashboard cyber dark telemetry" \
  --design-system -p "F1 Pit Wall" -f markdown

python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
  "motorsport race strategy analytics dashboard" \
  --design-system --density 8 --motion 3 --variance 4
```

**Lưu output vào:** `src/design-system/DESIGN_SYSTEM.md` (master) + `src/design-system/overrides.md` (chỉnh tay sau này).
**Quy tắc Master + Overrides (theo skill):** Master là output gốc của skill, không sửa tay. Mọi chỉnh sửa nằm ở overrides. Khi sinh lại, chỉ thay master, overrides giữ nguyên.

**Domain search bổ sung (nên chạy):**

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "dashboard" --domain chart
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "glassmorphism dark" --domain style
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "error summary validation" --domain ux
```

## 6.2. Định hướng style đã chọn (đề xuất — chốt sau khi chạy lệnh trên)

| Quyết định | Lựa chọn đề xuất | Vì sao |
|---|---|---|
| **Style chính** | Dark Mode + Bento Grid + Glassmorphism (nhẹ) + Data-dense dashboard | Pit wall = nhiều panel song song, mật độ cao, nền tối để mắt không mỏi, số nổi bật |
| **Style phụ** | Cyber / Telemetry / HUD — scanline, grid, mono, glow có kiểm soát | “Cyber” như Nguyen muốn, nhưng phải kiềm chế: glow chỉ cho trạng thái live/cảnh báo, không glow mọi thứ |
| **Pattern** | Dashboard-first (không phải landing Hero-centric) | Người dùng vào là để quyết định, không phải để đọc marketing |
| **Density** | 8/10 (cao) | Kỹ sư pit wall cần nhiều số trên 1 màn, nhưng phải có hierarchy rõ |
| **Motion** | 3/10 (vừa, có chủ đích) | Số thay đổi thì tween, cảnh báo thì pulse, chuyển tab thì fade/slide ngắn. Không parallax, không hero animation dài |

**Anti-patterns (theo skill + tự rút ra — cấm):**
- ❌ Gradient tím/hồng kiểu “AI generic” — không hợp pit wall, không hợp F1.
- ❌ Emoji làm icon — dùng Lucide / Heroicons SVG.
- ❌ Màu chỉ để trang trí — mỗi màu phải có nghĩa (xem 6.3).
- ❌ Animation làm chậm việc đọc số — mọi motion < 300ms, có thể tắt.
- ❌ Text bị cắt ở màn hẹp, chip tràn, badge chỉ dùng màu mà không có text/icon.

## 6.3. Design token — kế thừa palette bản cũ, chuẩn hóa lại

Palette gốc từ Gazette v2.2 (giữ tinh thần, chuẩn hóa thành token):

```css
/* src/design-system/tokens.css — Tailwind v4 @theme */
@theme {
  /* Nền */
  --color-void: #070b11;        /* page bg */
  --color-surface: #0d131b;     /* sheet / topbar */
  --color-panel: #121a24;       /* card */
  --color-raised: #182230;      /* chip / control */
  --color-line: #223041;        /* hairline */
  --color-line-strong: #2f4056; /* structural */

  /* Text */
  --color-ink: #e6edf3;
  --color-ink-soft: #92a3b7;
  --color-ink-faint: #5c6b7d;

  /* Accent — giữ từ bản cũ */
  --color-teal: #2ee6c8;        /* PRIMARY — steel */
  --color-red: #ff5c6c;         /* danger / DNF / pit now */
  --color-amber: #ffb02e;       /* warning / player team */
  --color-gold: #ffc94d;        /* leader / favourite */
  --color-green: #3ddc97;       /* good / gain */
  --color-blue: #4cc3ff;        /* info / wet / next race */

  /* Ngữ nghĩa RAG */
  --color-success: var(--color-green);
  --color-warning: var(--color-amber);
  --color-danger: var(--color-red);
}
```

**Quy tắc màu ngữ nghĩa (bắt buộc, không phá):**
- Teal = primary action / live / đang chọn.
- Đỏ = hành động ngay / mất điểm / DNF / risk cao.
- Vàng/amber = cảnh báo / đội người chơi (highlight row).
- Xanh lá = tốt lên / gain / confidence HIGH.
- Xanh dương = thông tin / ướt / chặng tới.
- **Không dùng màu đơn độc để truyền nghĩa:** Badge luôn có text + icon, không chỉ chấm màu.

**Typography (đề xuất, chốt sau khi chạy skill):**
- **Display / số lớn:** `JetBrains Mono` hoặc `IBM Plex Mono` cho số, lap time, gap — mono giúp số thẳng hàng, đọc nhanh.
- **Heading:** `Inter` / `Space Grotesk` — hiện đại, kỹ thuật.
- **Body:** `Inter` — dễ đọc, hỗ trợ tiếng Việt tốt (kiểm tra subset Vietnamese trước khi chốt font).
- **Kiểm tra:** Font phải có Vietnamese subset, không lỗi dấu tiếng Việt. Đây là lỗi hay gặp — test ngay với chuỗi “Đường đua, Chiến thuật, Khuyến nghị”.

**Spacing / Radius / Shadow:**
- Radius: card 8px, chip 999px, button 6px — giữ như bản cũ, không bo tròn quá mức.
- Grid nền: `34px` grid mờ như bản cũ, chỉ dùng ở hero/shell, không dùng trong card dữ liệu (gây nhiễu).
- Shadow: chỉ dùng cho topbar / modal / dropdown. Card dùng border, không dùng shadow nặng.

## 6.4. Motion & hiệu ứng cyber (có chủ đích, không lạm dụng)

| Hiệu ứng | Dùng ở đâu | Cách làm | Lưu ý |
|---|---|---|---|
| **Number tween** | KPI, gap, lap time thay đổi | Framer Motion `animate` / `useSpring` | Chỉ tween khi giá trị đổi do filter/save mới, không tween liên tục |
| **Live pulse** | Chấm “LIVE / Đang phân tích”, pit window mở | CSS `pulse` + dot teal/red | Tắt khi `prefers-reduced-motion` |
| **Scanline / HUD frame** | Header Pit Wall, border card quan trọng | Pseudo-element, gradient mỏng, opacity thấp | Chỉ 1–2 chỗ, không áp cho mọi card |
| **Stint timeline animation** | Tyre Lab: stint chạy dọc timeline | Framer Motion layout + width animate | Có thể pause, có tooltip từng stint |
| **Chart draw** | Pace / deg curve khi vào trang | Recharts animation, duration 400ms | Tắt animation khi data lớn (>200 điểm) |
| **Stagger** | List driver/team cards | `staggerChildren: 0.04` | Chỉ lần đầu load, không stagger mỗi lần filter |
| **Skeleton** | Đang parse / đang tính engine | Skeleton card, shimmer nhẹ | Không dùng spinner xoay toàn màn hình |
| **Command palette** | `Cmd+K`: nhảy tới race/driver/module | cmdk + shadcn | Phải có — pit wall cần nhảy nhanh |

**Hiệu ứng KHÔNG dùng:** Parallax hero, particle background nặng, tilt 3D card, marquee chữ chạy, glow toàn màn hình. Chúng làm chậm và làm nhiễu việc đọc số.

**Performance budget cho motion:** Tổng JS animation không làm drop frame trên laptop tầm trung; `prefers-reduced-motion: reduce` → tắt toàn bộ motion không cần thiết.

## 6.5. Component inventory (Pit Wall Design System)

### Primitives (shadcn/ui + token)
Button, Badge, Card, Tabs, Table, Slider, Select, Dialog, Tooltip, Progress, Skeleton, Input, Switch, Command.

### Pit Wall components (tự xây, có trong `src/components/pitwall/`)

| Component | Vai trò |
|---|---|
| `KpiStrip` | Dãy KPI: số lớn + delta + sparkline + click drill-down |
| `RecommendationCard` | Khuyến nghị: action + why + confidence + evidence + risk + 👍/👎 |
| `ConfidenceBadge` | HIGH/MEDIUM/LOW + tooltip giải thích nguồn |
| `TimingTower` | Bảng xếp hạng kiểu timing: pos, driver, team colour, gap, tyre, pit |
| `StintTimeline` | Timeline stint lốp: compound, laps, pit window |
| `CompoundBadge` | Chấm lốp S/M/H/I/W với màu chuẩn F1 (đỏ/vàng/trắng/xanh lá/xanh dương) |
| `PitWindowBar` | Thanh cửa sổ pit: optimal / early / late |
| `PaceChart` / `TyreDegChart` | Line/area chart, có league average line |
| `AlertBanner` | Cảnh báo đỏ/vàng: part sắp hỏng, hợp đồng sắp hết, luật hại |
| `EvidenceList` | Liệt kê nguồn: bảng, mùa, chặng, giá trị |
| `DriverDuel` | So sánh 2 tay đua head-to-head |
| `TrackMap` | SVG tối giản của track + sector + DRS (tự vẽ, không dùng asset game) |
| `SaveDropzone` | Kéo-thả save, progress, lỗi có mã |
| `CommandBar` | Topbar: save selector, season/race selector, locale, Cmd+K |

### Layout

- **Shell:** Sidebar trái (modules) + Topbar (save/season/race) + Content. Sidebar thu gọn được, nhớ trạng thái.
- **Bento grid:** Pit Wall home dùng bento 12 cột: KPI strip full-width, Tyre + Pace 2/3, Alerts + Next Race 1/3.
- **Responsive:** 1440px (desktop chính) → 1024px (2 cột) → 768px (1 cột, sidebar thành drawer) → 375px (KPI xếp dọc, table thành card list). Test 4 breakpoint theo checklist của skill.

## 6.6. UX Guidelines áp dụng (từ skill — 120 rules, chọn cái quan trọng nhất)

1. **Resilient text:** Heading wrap tự nhiên, không cắt; chip wrap hoặc `+n`; badge không chỉ dựa vào màu; long ID/hash được wrap an toàn.
2. **Cancellable interaction:** Đổi tab/filter hủy animation cũ, state cuối cùng phải đúng; parse có Cancel.
3. **Keyboard:** Mọi tương tác chính làm được bằng bàn phím, focus visible, `Cmd+K` mở palette, `1–9` nhảy tab (P2).
4. **Accessibility:** Contrast ≥ 4.5:1 cho text, chart có text alternative (bảng đi kèm), `aria-label` cho icon button, không dùng màu đơn độc.
5. **Pre-delivery checklist (chạy trước mỗi release):** Không emoji icon, `cursor-pointer` cho clickable, focus visible, `prefers-reduced-motion`, text reflow không clip, responsive 375/768/1024/1440, contrast, VI/EN không tràn.


---

<!-- Nguồn: 07-ROUTES-PAGES-IA.md -->

# 07 — Information Architecture, Routes & Pages

## 7.1. IA — 2 mode rõ rệt

```
F1 Pit Wall
├── MODE A: RACE WEEKEND (quyết định nhanh — trước/trong chặng)
│   ├── Pit Wall Home (/)
│   └── Race Weekend (/race/[raceId])
│       ├── Overview (strategy + pit window + weather)
│       ├── Tyres (Tyre Lab)
│       └── Sim (Quali sim + Race sim)
├── MODE B: FACTORY / SEASON (quyết định dài hạn — giữa các chặng)
│   ├── Cars (/cars) — pace, parts, durability
│   ├── Drivers (/drivers) — ratings, duel, form
│   ├── Teams (/teams) — comparison
│   ├── Season (/season) — calendar, standings, history
│   ├── Strategy (/strategy) — finance, personnel, loadout
│   └── Research (/research) — regulations, R&D queue
├── NARRATIVE (giữ chân, không phải decision)
│   └── Gazette (/gazette/[raceId])
└── SYSTEM
    ├── Library (/library) — nhiều save
    └── Settings (/settings) — locale, theme, privacy, xóa dữ liệu
```

**Quy tắc:** Người dùng luôn biết mình đang ở Mode nào (badge trên topbar). Không trộn quyết định dài hạn vào màn hình Race Weekend.

## 7.2. Route map (Next.js App Router)

| Route | Tên | Nội dung chính | Engine dùng |
|---|---|---|---|
| `/[locale]/` | Landing / Upload | Dropzone, privacy, save mẫu, tính năng | — |
| `/[locale]/library` | Save Library | List save đã parse, hash, season, team, xóa, so sánh (v2) | — |
| `/[locale]/` (khi đã có save) → redirect `/wall` | Pit Wall Home | KPI strip, alerts, next race, tyre quick rec, pace snapshot | pace, tyre (quick), car (alerts) |
| `/[locale]/wall` | Pit Wall Home | Như trên | — |
| `/[locale]/wall/race/[raceId]` | Race Weekend | Strategy overview, pit window, weather, quali/race sim, stint plan | tyre, strategy, pace |
| `/[locale]/wall/tyres` | Tyre Lab | Recommendation card, alternatives, compound, observed, what-if | tyre |
| `/[locale]/wall/cars` | Car Lab | Pace board, league table, part grid, durability, dev queue | pace, car |
| `/[locale]/wall/drivers` | Drivers | Driver cards, ratings, duel, form, tyre preservation | pace, personnel |
| `/[locale]/wall/teams` | Teams | Team comparison, pit stats, sparkline | pace |
| `/[locale]/wall/season` | Season | Calendar, standings, race data table, export | season |
| `/[locale]/wall/strategy` | Strategy | Finance, personnel, loadout, condition bars | finance, personnel, car |
| `/[locale]/wall/research` | Research | Regulations vote, impact, expertise banking, R&D queue | regulation, finance |
| `/[locale]/wall/gazette/[raceId]` | Gazette | Báo cáo chặng, awards, transfers, highlights | gazette (narrative) |

**Deep-link:** `/wall/race/12?tab=tyres&driver=44` phải mở đúng tab + driver. Filter lưu vào URL, không chỉ lưu vào Zustand.

## 7.3. Wireframe từng màn hình (mô tả, không phải hình)

### 7.3.1. Pit Wall Home (`/wall`) — màn hình quan trọng nhất

```
┌────────────────────────────────────────────────────────────────┐
│ Topbar: [Team ▾] [Season ▾] [Race ▾] [VI/EN] [Cmd+K] [Settings]│
├────────────────────────────────────────────────────────────────┤
│ ALERTS (nếu có): 🔴 Part X sắp hỏng  ⚠️ Hợp đồng Y sắp hết     │
├────────────────────────────────────────────────────────────────┤
│ KPI STRIP: [Pace vs rival +0.32s] [Pts P5 82] [Budget $12.4M]  │
│            [Tyre: 2-stop rec] [Car rank P6] [Next: Bahrain 3d] │
├──────────────────────────────┬─────────────────────────────────┤
│ NEXT RACE — Bahrain          │ TYRE QUICK REC                  │
│ Track type, laps, weather    │ S(12) → M(20) → M(18)           │
│ Favourites + Dark horse      │ Confidence MEDIUM · Xem chi tiết│
├──────────────────────────────┼─────────────────────────────────┤
│ PACE SNAPSHOT (vs rival)     │ DRIVER DUEL (teammate)          │
│ Bar chart + gap              │ Quali 8-4 · Race 7-5            │
├──────────────────────────────┴─────────────────────────────────┤
│ WHAT TO DO NEXT (3 khuyến nghị hàng đầu, có nút)               │
└────────────────────────────────────────────────────────────────┘
```

**Quy tắc:** Home không có bảng dài. Bảng nằm ở trang chi tiết. Home chỉ có KPI + 3 khuyến nghị + link drill-down.

### 7.3.2. Race Weekend (`/wall/race/[raceId]`)

- Header: Track name, laps, date, weather, track map mini.
- Tabs: `Overview | Tyres | Sim | Results` (results chỉ hiện khi race đã xong).
- Overview: Pit window bar, strategy card, weather trigger, undercut/overcut.
- Tyres: Stint timeline + alternatives + what-if slider.
- Sim: Quali sim table (Q1/Q2/Q3 band) + Race sim (slider số vòng, vị trí dự kiến).

### 7.3.3. Tyre Lab (`/wall/tyres`)

- Hero: Recommendation card lớn (stint sequence + pit window + expected gain + confidence).
- What-if: Slider pit sớm/muộn, toggle mưa.
- Compound grid: 5 compound cards (S/M/H/I/W) với life, deg, optimal window.
- Observed: Bảng pit history tại track này + practice compound share.
- Player drivers: Mỗi tay đua 1 dòng pit suggest.
- Provenance: Liệt kê nguồn + assumption.

### 7.3.4. Car Lab (`/wall/cars`)

- Pace board: Timing tower + gap bar + league average line.
- Part grid: Mỗi part 1 mini-card: score, bar vs average, condition, focus star.
- Durability: Bảng wear + risk badge + dự báo hỏng + aero note.
- Dev queue: Xếp theo points-per-budget, có lý do.

### 7.3.5. Drivers / Teams / Season / Strategy / Research

- **Drivers:** Card grid, filter theo team, sort theo points/pace/tyre preservation. Duel mode: chọn 2 tay đua → head-to-head.
- **Teams:** Comparison table + sparkline, highlight đội người chơi.
- **Season:** Calendar (list chặng, trạng thái), standings 2 cột (driver/team), race data table có export CSV.
- **Strategy:** Finance snapshot, personnel list, loadout (parts + morale bars), condition bars.
- **Research:** Regulation vote cards (YES/NO rec), impact stats, expertise banking, R&D queue, calendar.

### 7.3.6. Gazette (`/wall/gazette/[raceId]`)

- Giữ phong cách báo: masthead, headline, subhead, race table, standings, awards, transfers, highlights, next race.
- Nhưng render bằng component, không phải 1 template string. Có nút “Xem Pit Wall cho chặng này” để quay lại decision mode.
- Có toggle VI/EN, có print/export PDF (P2).

### 7.3.7. Library & Upload

- **Upload:** Dropzone lớn, chấp nhận `.sav`, hiện progress + bước parse, lỗi có mã + hướng dẫn.
- **Library:** Card mỗi save: team, season, day, file name, hash, parsedAt, nút Mở / Xóa / Xuất báo cáo.
- **Save mẫu:** 1 save mẫu nhỏ để thử ngay không cần có game.

## 7.4. Navigation & Command Palette

- **Sidebar:** Pit Wall, Race Weekend, Tyres, Cars, Drivers, Teams, Season, Strategy, Research, Gazette, Library. Nhóm theo Mode A/B/Narrative.
- **Cmd+K:** Nhảy tới race (“Bahrain”), driver (“Verstappen”), module (“Tyre Lab”), action (“Nạp save mới”).
- **Breadcrumb:** `Pit Wall / Race Weekend / Bahrain` — luôn biết mình đang ở đâu.
- **Topbar selectors:** Team (chỉ hiện khi có nhiều save?), Season, Race — đổi là đổi toàn bộ context, URL cập nhật theo.
