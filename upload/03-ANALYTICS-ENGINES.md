> Gộp từ các file cũ: 05-ANALYTICS-ENGINES.md — nội dung giữ nguyên, chỉ gộp file, không cắt ý.


---

<!-- Nguồn: 05-ANALYTICS-ENGINES.md -->

# 05 — Analytics Engines: từ số liệu tới khuyến nghị

> Nguyên tắc: Engine là hàm thuần TypeScript. Input = Normalized Model (+ params người dùng chỉnh). Output = `{ value, confidence, evidence[], assumptions[], recommendations[] }`. Không có side-effect, không đọc DB, không render.

## 5.1. Khung chung cho mọi engine

```ts
export interface EngineResult<T> {
  data: T;
  confidence: Confidence;
  evidence: Evidence[];
  assumptions: Assumption[];
  recommendations: Recommendation[];
  warnings: string[];
}
```

Mỗi engine phải có:
1. **Công thức ghi lại** trong file này + comment trong code (không để công thức chỉ nằm trong đầu).
2. **Baseline từ bản cũ** (nếu có) — ghi rõ “kế thừa từ Gazette v2.2” hay “viết mới”.
3. **Unit test** với fixture: input cố định → output cố định.
4. **Provenance** — không trả số trần.

## 5.2. Pace Engine (`pace.engine.ts`) — P0

**Câu hỏi:** Tôi nhanh/chậm hơn đối thủ trực tiếp bao nhiêu? Ai là đối thủ trực tiếp?

- **Input:** Practice best laps, quali laps, race fastest laps, race results.
- **Output:**
  - Pace board: gap tới leader, gap tới đối thủ trực tiếp (±1–2 vị trí), gap theo sector nếu có dữ liệu (P2).
  - Pace trend: sparkline qua các chặng (đang nhanh lên hay chậm đi so với grid).
  - Quali sim: dự đoán vị trí quali dựa trên pace + track characteristics (kế thừa quali sim cũ: band Q1/Q2/Q3).
  - Race sim: mô phỏng số vòng còn lại, vị trí dự kiến nếu giữ pace hiện tại (kế thừa race sim cũ: slider số vòng).
- **Đối thủ trực tiếp:** Không phải P1 toàn grid. Là đội xếp ngay trên/dưới trong Team Standings + đội có pace gần nhất (±0,5s). Ghi rõ định nghĩa trong UI.
- **Confidence:** HIGH nếu có practice + quali + race cùng track; MEDIUM nếu chỉ có race; LOW nếu chỉ có 1 nguồn.

## 5.3. Tyre Engine (`tyre.engine.ts`) — P0, flagship

**Câu hỏi:** Chặng tới chạy lốp nào, mấy pit, pit vòng nào?

- **Input:** `Save_CarTyreAllocation`, `Races_PracticeResults.BestLapTyre` (0=Hard, 1=Medium, 2=Soft; dry only), `Races_PitStopTimings`, race laps, weather.
- **Output:**
  - **Recommended strategy:** Stint sequence, vd: `S (12) → M (20) → M (18)` + số pit + pit window (vòng 11–13, 30–32) + expected time loss.
  - **Alternatives:** 1-stop vs 2-stop, so sánh time loss + risk.
  - **Compound cards:** Life ước lượng từng loại (S/M/H), deg curve, optimal window.
  - **Wet plan:** Nếu mưa → Inter/Wet plan riêng, ghi rõ trigger.
  - **Player drivers:** Mỗi tay đua 1 dòng: tyre preservation, stint dài nhất có thể, pit suggest.
- **Công thức baseline từ bản cũ (giữ, cần verify):**
  - Soft life ≈ giá trị game trong allocation; M ≈ …, H ≈ … (ghi lại số thật khi trích code).
  - Khi thiếu history tại track: expected stops ≈ `0.28 × race distance` (model constant — ghi rõ là LOW confidence).
  - Khi thiếu allocation: compound life envelope S ≈ `0.51×`, M ≈ `0.7×`… (ghi lại số thật khi trích).
- **What-if (P1):** Slider “pit sớm hơn 2 vòng / muộn hơn 2 vòng” → xem time loss thay đổi. Slider “mưa ở vòng 25” → xem plan đổi ra sao.
- **Cấm:** Không đưa ra chiến thuật mà không ghi pit window + confidence + nguồn. Không dùng số trung bình cộng đồng thay cho số trong save mà không ghi rõ.

## 5.4. Strategy Engine (`strategy.engine.ts`) — P1

**Câu hỏi:** Undercut hay overcut? Safety car thì làm gì? Mưa thì sao?

- **Undercut/overcut:** Dựa trên pit loss tại track + pace gap + tyre delta. Trả về “Undercut có lợi nếu gap < X giây”.
- **Pit window:** Tính từ pit loss + traffic (vị trí dự kiến sau pit).
- **Safety car / VSC:** Kịch bản “nếu SC ở vòng N thì…” — checklist, không phải dự đoán SC sẽ ra.
- **Weather trigger:** Nhiệt độ + mưa → khuyến nghị compound + thời điểm chuyển Inter.
- **Output phải có:** `trigger` (khi nào hành động), `action`, `fallback` (nếu trigger không xảy ra).

## 5.5. Car Engine (`car.engine.ts`) — P0

**Câu hỏi:** Xe tôi mạnh/yếu ở đâu? Nâng cấp gì tiếp? Part nào sắp hỏng?

- **Part score:** Điểm từng part (aero, chassis, powertrain…) so với league average (vạch trung bình trên bar — giữ ý tưởng `bar-avg` từ bản cũ).
- **League table:** Xếp hạng xe theo part, có delta vs chặng trước.
- **Durability & failure risk:** Wear theo part, risk LOW/WATCH/HIGH, dự báo hỏng trong N chặng tới, gợi ý thay trước khi phạt lưới.
- **Engine/ERS/Gearbox:** Nhắc rõ supplier parts — bank reset mỗi mùa, chỉ self-designed parts carry-over (kiến thức từ bản cũ).
- **Dev queue ranking:** Xếp part theo **points-per-budget** (không phải điểm tuyệt đối). Nếu correlation pace-points bị ngược (xe mạnh trên giấy nhưng chậm ngoài track) → từ chối conversion, ghi rõ lý do (giữ logic cũ).
- **Focus star:** Part đang được focus trong factory — hiển thị rõ.

## 5.6. Finance Engine (`finance.engine.ts`) — P1

**Câu hỏi:** Tiền đi đâu? Chi gì sinh điểm?

- **Budget snapshot:** Còn bao nhiêu, đã chi bao nhiêu, sắp tới chi gì.
- **Cost-per-point:** Từng khoản chi (R&D, parts, salary) → điểm mang lại.
- **Expertise banking:** `Parts_TeamExpertise.NextSeasonExpertise` — giá trị sẽ load vào mùa sau, so với 11 đội. Khuyến nghị “bank hay spend”.
- **Engine supplier decision:** So sánh powertrain hiện tại vs supplier khác — “giữ hay đổi, vì sao, tốn bao nhiêu điểm nếu đổi”.

## 5.7. Personnel Engine (`personnel.engine.ts`) — P1

**Câu hỏi:** Ký ai, giữ ai, trả bao nhiêu?

- **Driver comparison:** Pace, tyre preservation, consistency, morale, contract.
- **Teammate duel:** Head-to-head quali/race, ai thắng ở đâu.
- **FA intel:** Từ `Staff_ContractPatience`: suitability, opinion, acceptance threshold (0–1). Lương neo = lương hợp đồng sắp hết. Ngưỡng càng thấp càng dễ ký — ghi rõ công thức.
- **Staff:** Rating, morale, contract expiry, ai sắp hết hạn cần gia hạn.
- **Cảnh báo:** Hợp đồng sắp hết + morale thấp = risk mất người.

## 5.8. Regulation Engine (`regulation.engine.ts`) — P1

**Câu hỏi:** Luật mới có lợi hay hại cho tôi? Vote thế nào?

- **Vote impact:** Mỗi đề xuất luật → tác động lên xe/tiền/điểm của **đội người chơi**, không phải tác động chung chung.
- **Calendar:** Lịch bỏ phiếu, deadline.
- **R&D queue vs regulation:** Project nào sẽ mất giá trị nếu luật đổi → nên dừng hay đẩy nhanh.
- **Recommendation:** “Vote YES/NO vì…” + evidence.

## 5.9. Season / Post-Race Analysis Engine — P1

**Câu hỏi:** Chặng vừa rồi mất điểm ở đâu?

- **Loss attribution:** Phân rã gap thành pace / pit / strategy / driver error / reliability. Không đổ lỗi chung chung.
- **Form:** 5 chặng gần nhất (chip W/L/DNF), trend.
- **Track record:** Fastest lap history tại track, first race year.
- **Next race preview:** Track type, favorites (odds), dark horse, trivia — giữ từ Gazette, nhưng gắn với pace thật của save.

## 5.10. Gazette Engine (narrative) — P2

- Giữ narrative: awards, transfers, highlights, pull-quote.
- Tách khỏi engine quyết định. Gazette không được ảnh hưởng tới recommendation.
- Quote phải có seed deterministic (cùng save → cùng quote), không random mỗi lần load.

## 5.11. Recommendation — chuẩn output (quan trọng nhất)

Mọi khuyến nghị phải có đủ 6 trường, thiếu 1 trường là chưa xong:

| Trường | Ví dụ |
|---|---|
| `action` | “Pit vòng 18–20, chuyển sang Medium” |
| `why` | “Soft đã qua optimal window ở vòng 16, deg 0,12s/vòng” |
| `evidence` | `Races_PitStopTimings tại Bahrain (3 chặng) + Practice BestLapTyre` |
| `confidence` | MEDIUM |
| `assumptions` | “Giả định thời tiết khô, không SC” |
| `riskIfIgnored` | “Ở lại thêm 3 vòng mất ~1,8s + risk undercut từ Norris” |

**Hiển thị:** Recommendation Card có badge confidence, nút “Xem bằng chứng” mở EvidenceList, nút “Tại sao không làm X?” mở alternatives.

**Feedback loop (local):** Nút 👍/👎 cho mỗi khuyến nghị, lưu local để đo trust (file 01, mục 1.6). Không gửi server.
