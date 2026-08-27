# Specification — Học phí / Phiếu thu

> Module: Tuition | Status: **NOT STARTED** (GĐ4)
> Xem `STATUS.md` cho trạng thái hiện tại.

---

## Business Rules

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

### Nguyên tắc tách biệt
- KHÔNG viết 1 hàm `calculateTuition()` dùng if/else nhồi cả 3 mode — tách riêng function hoặc dispatch rõ ràng.
- `session`: KHÔNG lưu số tiền tĩnh — luôn tính động.
- `course`/`monthly`: NGƯỢC LẠI — số tiền LÀ giá trị tĩnh, không tính từ buổi học.
- `fee_amount` (mode `session`) ưu tiên: `student_class.fee_override` → `classes.fee_amount`. KHÔNG đảo thứ tự.

### Phụ thu / Giảm phí (`wp_hinteach_tuition_adjustments`)
- `type`: `surcharge` (phụ thu) hoặc `discount` (giảm phí).
- `calc_type`: `amount` (số tiền cố định) hoặc `percent` (phần trăm học phí gốc).
- Scope: theo lớp (`student_id` NULL) hoặc học sinh cụ thể.
- Áp dụng theo khoảng `month_from → month_to`, KHÔNG áp dụng vĩnh viễn nếu không chọn "bảo lưu đến".
- **Riêng biệt với phụ thu mặc định lúc tạo lớp** (`classes.surcharge_name/amount`) — quan hệ 2 cơ chế CHƯA XÁC NHẬN hoàn toàn. Đề xuất: tạo lớp có phụ thu → tự sinh 1 record adjustment scope=lớp. Giáo viên sửa/xoá sau như adjustment bình thường.
- Adjustment với `course`/`monthly`: CHƯA XÁC NHẬN có cộng vào `fee_amount` cố định không.

### Thanh toán — mode `session`
- 1 lần "xác nhận đã thu" = 1 record MỚI trong `wp_hinteach_payments`, không update đè.
- Không cho phép số tiền vượt số còn nợ mà không cảnh báo rõ.

### Thanh toán — mode `course`/`monthly`
- Dùng `wp_hinteach_billing_payments` (student_id, class_id, period_key, paid, amount_paid).
- Endpoint RIÊNG (`hinteach_billing_payment_confirm`), KHÔNG dùng chung hàm xác nhận thu của mode `session`.

### Phiếu học phí PDF
- Dữ liệu (số buổi, số giờ, tổng tiền) LẤY TỪ QUERY ĐỘNG tại thời điểm xuất — không dùng cache cũ.
- Xuất hàng loạt: UI bản gốc có class `admin-only` — CHƯA XÁC NHẬN có phải giới hạn quyền thật.
- Mẫu nhận xét/câu kết là template giáo viên tự cấu hình.

### DB Schema
- KHÔNG tạo bảng/cột mới ngoài `includes/db-schema.php`.

---

## Permissions
- `manage_hinteach_classes` hoặc quyền `tuition` (assistant).
- Xuất hàng loạt: có thể chỉ admin — cần xác nhận.

---

## Files (chưa tạo)

| Backend | Frontend |
|---|---|
| `includes/ajax-tuition.php` | `assets/modules/tuition.js` |
| `includes/pdf-export.php` | |

---

## Test Expectations

### Mode `session`
- [ ] 4 buổi/tháng × 100.000đ, không chia sẻ → học phí = 400.000đ
- [ ] 1 buổi có 2 học sinh, session.price = 200.000đ, không override → mỗi HS 100.000đ
- [ ] Phụ thu cố định 50.000đ → tổng = 450.000đ
- [ ] Giảm phí 10% → tính đúng % trên học phí gốc
- [ ] Xoá 1 buổi → học phí tháng tự giảm
- [ ] `fee_override` khác `fee_amount` → tính đúng theo override
- [ ] Thanh toán 1 phần → "còn nợ" đúng phần còn lại

### Mode `course`/`monthly`
- [ ] `monthly` 500.000đ → mỗi tháng hiển thị 500.000đ bất kể số buổi
- [ ] `course` 3.000.000đ, khóa 01/01-30/06 → 1 khoản duy nhất
- [ ] Thu tiền `monthly` tháng 8 → tháng 9 vẫn "chưa thu"
- [ ] Xoá buổi lớp `monthly` → học phí KHÔNG đổi

### Chung
- [ ] Xuất phiếu 2 lần, có buổi mới ở giữa (session) → phiếu lần 2 đúng số liệu mới
- [ ] Phụ thu 1 học sinh cụ thể → học sinh khác không ảnh hưởng
