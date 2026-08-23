# AI TASK — BUILD MODULE HỌC PHÍ / PHIẾU THU
> Dùng khi làm/mở rộng: tính học phí, phụ thu/giảm phí, xác nhận thanh toán, xuất phiếu học phí PDF
> Cập nhật 2026-08-23: PHÁT HIỆN QUAN TRỌNG — có 3 công thức học phí, không phải 1 công thức chung

---

## BƯỚC 0 — ĐỌC TRƯỚC KHI LÀM GÌ

1. `CLAUDE.md` (root) — 4 phát hiện quan trọng về billing_mode
2. `includes/CLAUDE.md` — phần "LOGIC TÍNH HỌC PHÍ" (đã viết lại đầy đủ 3 công thức), schema `wp_hinteach_tuition_adjustments`, `wp_hinteach_payments`, `wp_hinteach_billing_payments`

---

## PHÂN TÍCH TRƯỚC — VIẾT CODE SAU

**1. Đây là bug tính sai tiền hay tính năng mới?**
Nếu tính sai tiền: XÁC ĐỊNH TRƯỚC đang xử lý lớp `billing_mode` nào — bug ở công thức `session` khác hoàn toàn nguyên nhân bug ở `course`/`monthly` (1 bên tính động, 1 bên lưu tĩnh).

**2. File và vùng code cần đụng vào?**
`ajax-tuition.php` / `pdf-export.php` / `modules/tuition.js`.

**3. Có đụng vào công thức tính học phí không?**
Nếu có: viết lại công thức ĐÚNG CHO ĐÚNG billing_mode trước khi sửa, đối chiếu bản chuẩn trong `includes/CLAUDE.md`. KHÔNG áp dụng công thức của mode này cho mode khác.

**4. Minimal patch là gì?**

---

## ĐIỀU LUẬT — KHÔNG ĐƯỢC VI PHẠM

### Công thức học phí — 3 CÔNG THỨC RIÊNG, BẤT BIẾN TRONG PHẠM VI MỖI MODE

```
[session]  Học phí tháng = Σ (phí mỗi buổi đã học trong tháng) ± phụ thu/giảm phí
           Phí 1 buổi = session_students.fee_amount (nếu có override)
                        HOẶC session.price / số học sinh đang trả tiền buổi đó (chia đều)
           → TÍNH ĐỘNG, không lưu tĩnh, còn nợ = tính động − Σ wp_hinteach_payments

[course]   Học phí = classes.fee_amount (CỐ ĐỊNH, không phụ thuộc số buổi)
           period_key = "course:{start}:{end}"
           Trạng thái trả tiền tra trong wp_hinteach_billing_payments theo period_key

[monthly]  Học phí = classes.fee_amount (CỐ ĐỊNH mỗi tháng, không phụ thuộc số buổi)
           period_key = "YYYY-MM"
           Trạng thái trả tiền tra trong wp_hinteach_billing_payments theo period_key
```

- KHÔNG viết 1 hàm `calculateTuition()` dùng if/else nhồi cả 3 mode vào — tách riêng function hoặc dispatch rõ ràng, dễ test độc lập.
- Với `session`: KHÔNG lưu số tiền tĩnh cho từng tháng — luôn tính động khi hiển thị.
- Với `course`/`monthly`: NGƯỢC LẠI — số tiền LÀ giá trị tĩnh của lớp, không được tự ý đổi logic sang tính từ buổi học.
- `fee_amount` (mode `session`) ưu tiên: `student_class.fee_override` → `classes.fee_amount`. KHÔNG đảo thứ tự.

### Phụ thu / Giảm phí (`wp_hinteach_tuition_adjustments`)
- Field đúng theo UI thật: `type` (`surcharge`/`discount`), `calc_type` (`amount`/`percent`), `value`, `month_from`, `month_to`.
- Scope: theo lớp (student_id NULL) hoặc học sinh cụ thể — ghi rõ khi tạo.
- Áp dụng theo khoảng tháng, KHÔNG vĩnh viễn nếu không chọn "bảo lưu đến".
- **Riêng biệt với phụ thu mặc định lúc tạo lớp** (`classes.surcharge_name/amount`) — quan hệ 2 cơ chế này CHƯA XÁC NHẬN, hỏi lại người dùng trước khi code phần đồng bộ giữa 2 nơi này.
- Chỉ có ý nghĩa rõ ràng với mode `session` (áp dụng lên học phí tính động). Với `course`/`monthly` — XÁC NHẬN xem adjustment có cộng vào `fee_amount` cố định không, hay không hỗ trợ 2 mode này (bundle.js chưa cho thấy rõ).

### Thanh toán — mode `session`
- 1 lần "xác nhận đã thu" = 1 record MỚI trong `wp_hinteach_payments`, không update đè.
- Không cho phép số tiền thanh toán vượt số còn nợ mà không cảnh báo rõ.

### Thanh toán — mode `course`/`monthly`
- Dùng `wp_hinteach_billing_payments` (student_id, class_id, period_key, paid, amount_paid) — endpoint RIÊNG (`hinteach_billing_payment_confirm`), KHÔNG dùng chung hàm xác nhận thu của mode `session`.

### Phiếu học phí PDF
- Dữ liệu (số buổi, số giờ, tổng tiền) LẤY TỪ QUERY ĐỘNG tại thời điểm xuất — không dùng cache cũ.
- Xuất hàng loạt: theo quan sát UI, nút "Xuất hàng loạt" gắn class admin-only — XÁC NHẬN xem đây có phải giới hạn quyền thật (chỉ admin xuất hàng loạt, giáo viên chỉ xuất từng phiếu) trước khi code phân quyền phần này.
- Mẫu nhận xét/câu kết trong phiếu là template giáo viên tự cấu hình.

### DB Schema
- KHÔNG tạo bảng/cột mới ngoài `includes/db-schema.php`.

---

## SAU KHI ĐỀ XUẤT — LIỆT KÊ TEST CASES

**Mode `session`:**
- [ ] Học sinh có 4 buổi/tháng, phí/buổi = 100.000đ, không chia sẻ buổi nào → học phí = 400.000đ
- [ ] 1 buổi có 2 học sinh cùng học, session.price = 200.000đ, không override → mỗi học sinh 100.000đ
- [ ] Thêm phụ thu cố định 50.000đ → tổng = 450.000đ
- [ ] Thêm giảm phí 10% → tính đúng % trên học phí gốc
- [ ] Xoá 1 buổi đã tính → học phí tháng tự giảm, không cần thao tác thủ công
- [ ] `fee_override` khác `fee_amount` mặc định lớp → tính đúng theo override
- [ ] Xác nhận thanh toán 1 phần → "còn nợ" đúng phần còn lại

**Mode `course`/`monthly`:**
- [ ] Lớp `monthly` fee_amount=500.000đ → mỗi tháng hiển thị đúng 500.000đ bất kể số buổi học tháng đó
- [ ] Lớp `course` fee_amount=3.000.000đ, khóa 01/01-30/06 → hiển thị đúng 1 khoản duy nhất cho cả kỳ, không lặp lại theo tháng
- [ ] Xác nhận đã thu cho `monthly` tháng 8 → tháng 9 vẫn hiện "chưa thu" (period_key riêng theo tháng)
- [ ] Xoá 1 buổi học của lớp `monthly` → số tiền học phí KHÔNG đổi

**Chung:**
- [ ] Xuất phiếu học phí 2 lần cách nhau, có buổi học mới ở giữa (mode session) → phiếu lần 2 đúng số liệu mới
- [ ] Phụ thu chỉ áp dụng 1 học sinh cụ thể → học sinh khác không bị ảnh hưởng
- [ ] (Thêm case cụ thể cho task đang làm)
