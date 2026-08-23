# AI TASK — BUILD MODULE HỌC SINH / LỚP HỌC
> Dùng khi làm/mở rộng: CRUD lớp học, CRUD học sinh, import file, gán học sinh vào lớp
> Cập nhật 2026-08-23: đã đối chiếu bundle.js + HTML thật của bản gốc

---

## BƯỚC 0 — ĐỌC TRƯỚC KHI LÀM GÌ

1. `CLAUDE.md` (root) — kiến trúc tổng, roles, 4 phát hiện quan trọng về billing_mode
2. `includes/CLAUDE.md` — schema `wp_hinteach_classes`, `wp_hinteach_students`, `wp_hinteach_student_class`, endpoint, logic import file

Chưa đọc xong thì chưa được viết code.

---

## PHÂN TÍCH TRƯỚC — VIẾT CODE SAU

**1. Đây là tính năng mới hay sửa cái đã có?**

**2. File và vùng code cần đụng vào?**
`ajax-classes.php` / `ajax-students.php` / `modules/students.js` / `modules/classes.js`.

**3. Đang xử lý đúng field của lớp theo billing_mode nào?**
Lớp có 3 chế độ (`session`/`course`/`monthly`), MỖI chế độ có field riêng:
- `session`: chỉ cần `fee_amount`
- `course`: cần thêm `course_start_date`, `course_end_date`
- `monthly`: chỉ cần `fee_amount`, không cần ngày

Nếu task đụng tới field lớp, xác nhận đang validate đúng field bắt buộc theo mode đang chọn — KHÔNG bắt buộc `course_start_date` khi mode là `session`.

**4. Có đụng tới bảng N-N `wp_hinteach_student_class` không?**
Nếu có: `fee_override` CHỈ có ý nghĩa khi lớp đó `billing_mode = 'session'` — với `course`/`monthly`, học phí là số cố định của lớp, không có khái niệm override theo học sinh (xác nhận lại UI trước khi code phần này, vì bản gốc không thấy rõ field override cho 2 mode này).

**5. Nếu là import file — có dùng đúng helper dùng chung không?**
`hinteach_parse_uploaded_table()` trong `includes/helpers/file-parser.php`.

---

## ĐIỀU LUẬT — KHÔNG ĐƯỢC VI PHẠM

### Quyền sở hữu dữ liệu
- Mọi AJAX action CRUD lớp/học sinh PHẢI filter theo `teacher_id = get_current_user_id()` (trừ `hinteach_admin`).
- Trợ giảng chỉ thấy được nếu module `students`/`classProfiles` được bật trong `wp_hinteach_assistant_permissions` — KHÔNG mặc định thấy hết.

### Lớp học — billing_mode
- `billing_mode` + `fee_amount` bị KHOÁ (không sửa được qua form thường) sau khi lớp đã có ít nhất 1 buổi học — hiện note cảnh báo cho giáo viên, hướng dẫn sửa riêng qua `fee_override` (chỉ áp dụng mode `session`).
- Field phụ thu mặc định lúc tạo lớp (`surcharge_name`, `surcharge_amount`) — **XÁC NHẬN VỚI NGƯỜI DÙNG quan hệ với bảng `tuition_adjustments` trước khi code**, đừng tự quyết định (xem `includes/CLAUDE.md`).
- `schedule_type = 'fixed'` kèm `fixed_weekdays` (mảng 0-6) + giờ bắt đầu/kết thúc — **XÁC NHẬN quan hệ với tính năng lặp lịch ở Thời khoá biểu trước khi code** (tự sinh buổi hay chỉ gợi ý mặc định).

### Import file
- Giới hạn: tối đa 10MB, tối đa 500 dòng/lần.
- Dòng đầu là tên cột. Báo lỗi RÕ từng dòng lỗi, KHÔNG import 1 phần rồi im lặng bỏ qua.
- Dùng chung `hinteach_parse_uploaded_table()`.

### Học sinh học nhiều lớp
- 1 học sinh tham gia N lớp qua `wp_hinteach_student_class` — KHÔNG duplicate record.

### Xoá học sinh/lớp
- Soft delete — KHÔNG xoá cứng.
- Xoá lớp có học sinh đang active → cảnh báo trước.

### DB Schema
- KHÔNG tạo cột/bảng mới ngoài `includes/db-schema.php`.

---

## SAU KHI ĐỀ XUẤT — LIỆT KÊ TEST CASES

- [ ] Tạo lớp `session` → chỉ yêu cầu `fee_amount`, không yêu cầu ngày khóa
- [ ] Tạo lớp `course` → bắt buộc `course_start_date`/`course_end_date`, học phí là 1 số cố định
- [ ] Tạo lớp `monthly` → học phí cố định theo tháng, không có ngày khóa
- [ ] Tạo lớp đã có buổi học, thử sửa `billing_mode` → bị khóa, có note hướng dẫn
- [ ] Thêm học sinh mới → gán vào lớp `session` → `fee_override` hoạt động đúng
- [ ] Thêm học sinh vào lớp `course`/`monthly` → xác nhận hành vi override (theo kết quả xác nhận ở bước phân tích)
- [ ] Thêm học sinh đã có vào lớp thứ 2 → không tạo record trùng
- [ ] Import Excel 500 học sinh → đúng số dòng; import 501 dòng → bị chặn rõ ràng
- [ ] Giáo viên A không thấy/sửa được học sinh của giáo viên B
- [ ] Trợ giảng chỉ thấy module `students`/`classProfiles` nếu được bật trong `assistant_permissions`
- [ ] Xoá học sinh có dữ liệu điểm/buổi học cũ → dữ liệu cũ vẫn còn (soft delete)
- [ ] (Thêm case cụ thể cho task đang làm)
