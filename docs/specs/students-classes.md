# Specification — Học sinh & Lớp học

> Module: Students & Classes | Status: **IMPLEMENTED** (GĐ2)
> Xem `STATUS.md` cho trạng thái hiện tại.

---

## Business Rules

### Quyền sở hữu dữ liệu
- Mọi AJAX action CRUD lớp/học sinh PHẢI filter theo `teacher_id = get_current_user_id()` (trừ `hinteach_admin`).
- Trợ giảng chỉ thấy nếu module `students`/`classProfiles` được bật trong `wp_hinteach_assistant_permissions` — KHÔNG mặc định thấy hết.

### Lớp học — billing_mode
- `billing_mode` + `fee_amount` bị KHOÁ (không sửa qua form thường) sau khi lớp đã có ≥1 buổi học. Hiện note cảnh báo, hướng dẫn sửa qua `fee_override` (chỉ mode `session`).
- 3 chế độ, MỖI chế độ có field bắt buộc riêng:
  - `session` → chỉ cần `fee_amount`
  - `course` → `fee_amount` + `course_start_date` + `course_end_date`
  - `monthly` → chỉ cần `fee_amount`, không cần ngày

### Phụ thu mặc định lúc tạo lớp
- Field `surcharge_name`, `surcharge_amount` trong form tạo lớp.
- Quan hệ với `tuition_adjustments`: quyết định tạm thời — tạo lớp có phụ thu → tự sinh 1 record `tuition_adjustments` scope=class. **CHƯA CODE** (còn `// TODO`).

### Lịch cố định lúc tạo lớp
- `schedule_type = 'fixed'` + `fixed_weekdays` (mảng 0-6) + giờ bắt đầu/kết thúc.
- Quan hệ với tính năng lặp lịch: quyết định tạm thời — tự sinh buổi học 3 tháng tới. **CHƯA CODE** (còn `// TODO`).

### Bảng N-N `wp_hinteach_student_class`
- `fee_override` CHỈ có ý nghĩa khi lớp `billing_mode = 'session'`. Với `course`/`monthly`, học phí là số cố định của lớp, không override theo học sinh.
- 1 học sinh tham gia N lớp — KHÔNG duplicate record.

### Import file
- Giới hạn: 10MB, 500 dòng/lần.
- Dòng đầu là tên cột. Báo lỗi RÕ từng dòng lỗi, KHÔNG import 1 phần rồi bỏ qua.
- Dùng chung `hinteach_parse_uploaded_table()` trong `includes/helpers/file-parser.php`.
- Duplicate check: có SĐT → `name + phone`; không SĐT nhưng có dob → `name + dob`; không cả 2 → không chặn.
- Ngày sinh: chấp nhận VN (`d/m/Y`) và ISO (`Y-m-d`), không hỗ trợ US (`m/d/Y`). Chấp nhận không đệm 0.

### Xoá học sinh/lớp
- Soft delete — KHÔNG xoá cứng.
- Xoá lớp có học sinh active → cảnh báo trước.

### DB Schema
- KHÔNG tạo cột/bảng mới ngoài `includes/db-schema.php`.

---

## Validations

- Tạo lớp `course` thiếu `course_start_date`/`course_end_date` → chặn.
- `fee_amount` bắt buộc với mọi mode.
- Import >500 dòng → chặn. Import >10MB → chặn.
- Ngày sinh sai format → bỏ qua dòng + báo lỗi rõ, KHÔNG insert `0000-00-00`.

---

## Files

| Backend | Frontend |
|---|---|
| `includes/ajax-classes.php` | `assets/modules/classes.js` |
| `includes/ajax-students.php` | `assets/modules/students.js` |
| `includes/helpers/file-parser.php` | |

---

## Test Expectations

- [ ] Tạo lớp `session` → chỉ yêu cầu `fee_amount`, không yêu cầu ngày khóa
- [ ] Tạo lớp `course` → bắt buộc `course_start_date`/`course_end_date`
- [ ] Tạo lớp `monthly` → fee cố định, không có ngày khóa
- [ ] Tạo lớp đã có buổi → billing_mode bị khoá, có note hướng dẫn
- [ ] Thêm học sinh → gán vào lớp `session` → `fee_override` hoạt động
- [ ] Thêm học sinh vào lớp `course`/`monthly` → xác nhận hành vi override
- [ ] Thêm học sinh đã có vào lớp 2 → không trùng record
- [ ] Import Excel 500 dòng → đúng; 501 dòng → chặn
- [ ] Giáo viên A không thấy/sửa được dữ liệu giáo viên B
- [ ] Trợ giảng chỉ thấy module `students`/`classProfiles` nếu được bật
- [ ] Xoá học sinh có dữ liệu cũ → soft delete, dữ liệu cũ còn
