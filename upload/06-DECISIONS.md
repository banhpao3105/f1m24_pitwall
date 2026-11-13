> Gộp từ các file cũ: 10-DECISIONS-OPEN-QUESTIONS.md — nội dung giữ nguyên, chỉ gộp file, không cắt ý.


---

<!-- Nguồn: 10-DECISIONS-OPEN-QUESTIONS.md -->

# 10 — Quyết định cần chốt & câu hỏi mở

> File này là checklist cho Nguyen. Chốt xong thì cập nhật vào các file tương ứng + MEMORY.md. Không cần chốt hết trước khi code Phase 0 — nhưng 5 câu đầu nên chốt trước Phase 1.

## 10.1. Quyết định cần chốt trước Phase 1 (quan trọng)

### Q1. Hỗ trợ F1 Manager bản nào?
- [ ] Chỉ 23/24 (như bản cũ)
- [ ] Thêm 25 ngay từ đầu
- [ ] 23/24 trước, 25 ở Phase 4

**Gợi ý:** 23/24 trước. 25 chỉ làm khi có save 25 thật để introspect schema. Đừng đoán schema 25.

### Q2. Deploy ở đâu, cho ai dùng?
- [ ] Chỉ dùng local (chạy `npm run dev` / `npm run build` trên máy mình)
- [ ] Deploy public (Vercel / Cloudflare Pages) để chia sẻ cho cộng đồng
- [ ] Deploy nhưng không public link rộng rãi (chỉ share cho bạn bè)

**Ảnh hưởng:** Deploy public → cần landing page, privacy policy rõ ràng, không dùng asset có bản quyền của game (logo, ảnh xe/tay đua thật).

### Q3. Có cần multi-save / so sánh 2 save không?
- [ ] Không — 1 save tại 1 thời điểm là đủ cho v1
- [ ] Có — Library nhiều save, nhưng chưa cần so sánh
- [ ] Có — so sánh 2 save là tính năng chính

**Gợi ý:** Library nhiều save ở v1, so sánh ở v2.

### Q4. Tên dự án & thương hiệu?
- Tên tạm: `F1 Pit Wall`
- [ ] Giữ tên này
- [ ] Đổi tên: _______________
- Lưu ý: Tránh dùng logo / tên thương hiệu F1 / Frontier / đội đua thật nếu deploy public. Dùng tên riêng + thiết kế riêng.

### Q5. Ngôn ngữ mặc định?
- [ ] Tiếng Việt mặc định, EN chuyển được
- [ ] Tiếng Anh mặc định, VI chuyển được
- [ ] Theo trình duyệt

**Gợi ý:** Theo trình duyệt, fallback VI (vì Nguyen chơi bằng tiếng Việt, và bản cũ mặc định VI).

## 10.2. Quyết định kỹ thuật (chốt trong Phase 0)

| # | Câu hỏi | Đề xuất trong bộ này | Chốt |
|---|---|---|---|
| T1 | Static export hay Vercel SSR? | Static export nếu local-first, Vercel nếu muốn share dễ | |
| T2 | Recharts hay ECharts làm chính? | Recharts chính, ECharts chỉ khi cần chart nặng | |
| T3 | Lưu save đã parse vào IndexedDB không? | Có, có nút xóa rõ ràng | |
| T4 | Có dùng shadcn/ui không, hay tự build component? | Dùng shadcn/ui cho primitives, tự build Pit Wall components | |
| T5 | Font nào? | Inter + JetBrains Mono (kiểm tra Vietnamese subset) | |
| T6 | Có PWA offline ở v1 không? | P1 (Phase 3), không phải MVP | |

## 10.3. Câu hỏi về dữ liệu & game (cần save thật để trả lời)

- [ ] Save F1M 23 và 24 khác schema ở những bảng nào? (Trả lời bằng introspect ở Phase 0)
- [ ] Công thức tyre life thật trong code cũ là bao nhiêu? (Trích lại số khi migration, ghi vào file 05)
- [ ] `TeamID = 32` có phải custom team cho cả 23 và 24 không?
- [ ] Có save mẫu nào Nguyen sẵn sàng cho làm fixture không? (Anonymize trước khi commit)
- [ ] Có muốn giữ Gazette narrative y hệt bản cũ, hay viết lại giọng văn?

## 10.4. Câu hỏi về người dùng (để test Phase 1)

- [ ] 5 người chơi nào sẽ test MVP? (Tên / cách liên hệ — không ghi vào file public)
- [ ] Họ chơi đội nào, mùa nào, trình độ ra sao?
- [ ] Họ sẵn sàng cho feedback bằng cách nào? (Chat, form, call 15 phút?)

## 10.5. Quyết định đã chốt trong bộ này (không cần hỏi lại)

1. **Đập đi xây lại bằng Next.js full** — không vá file HTML cũ.
2. **Local-first, không upload save** — không đổi.
3. **Parser GVAS + sql.js mang sang** — không viết lại từ đầu.
4. **Mọi khuyến nghị phải có confidence + evidence + assumption** — không có ngoại lệ.
5. **VI/EN từ ngày 0** — không dịch sau.
6. **Design system từ ui-ux-pro-max, khóa token** — không hard-code màu.
7. **Gazette giữ lại nhưng tách riêng** — không trộn vào Pit Wall.
8. **Không sửa save, không live telemetry, không tài khoản ở v1** — không scope creep.

---

## Checklist chốt

- [ ] Q1 — Game version
- [ ] Q2 — Deploy
- [ ] Q3 — Multi-save
- [ ] Q4 — Tên
- [ ] Q5 — Ngôn ngữ mặc định
- [ ] T1–T6 — Kỹ thuật
- [ ] Cung cấp 2–3 save mẫu cho Phase 0 (nếu có)
