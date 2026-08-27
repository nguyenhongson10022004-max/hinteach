# Specification — Điểm số / Nhật ký học tập

> Module: Grades & Journal | Status: **NOT STARTED** (GĐ5)
> Xem `STATUS.md` cho trạng thái hiện tại.

---

## Business Rules

### Phân biệt 2 khái niệm
- **Điểm số** = bài kiểm tra (`wp_hinteach_grades`) — có `test_name`, `score`, `scale`, `type`.
- **Nhật ký học tập** = BTVN/ý thức/nhận xét theo buổi (`wp_hinteach_session_students`) — KHÔNG phải bảng riêng.

### Kiểu dữ liệu — BTVN (`homework` trong `session_students`)
- **Enum phần trăm**: `'0%'`, `'30%'`, `'50%'`, `'70%'`, `'100%'`.
- KHÔNG phải boolean "đã làm/chưa làm", KHÔNG phải điểm 0-10.
- Mapping tương thích ngược (chỉ nếu import data cũ): `'Chưa làm'→'0%'`, `'Chưa hoàn thành'→'50%'`, `'Hoàn thành'→'100%'`.
- Hiển thị badge màu: ≥100% = "done", ≥50% = "pending", còn lại = "not-done" (khớp `getHomeworkClass` từ bundle.js).

### Ý thức (`attitude`)
- **TEXT TỰ DO**, không phải điểm số. Khác với `attitude_score` (kiểu số) từng giả định trước — sửa lại nếu code cũ dùng kiểu số.

### Các field text
- `individual_comment`, `note`: TEXT tự do, giới hạn 500 ký tự (`maxlength="500"`).

### Một nguồn dữ liệu duy nhất cho nhật ký
- BTVN/ý thức/nhận xét lưu ở `wp_hinteach_session_students`.
- Tab "Nhật ký học tập" chỉ là 1 VIEW khác — cùng nguồn, không phải 2 bảng.

### Loại điểm (`wp_hinteach_grades.type`)
- Chỉ nhận: `homework` (bài kiểm tra BTVN — LƯU Ý: khác với field `homework` % trong nhật ký), `test`, `final`.
- KHÔNG có `type='quiz'` ở giai đoạn hiện tại (hoãn cùng quiz-engine).

### Sửa bài kiểm tra
- Sửa thông tin chung (tên, thang điểm) khi đang edit điểm → KHOÁ các field chung để tránh lệch dữ liệu học sinh khác.

### Quy đổi thang điểm
- `diem_quy_doi = (score / scale) * 10`.

### Tách domain
- Điểm số và học phí độc lập dù cùng gắn `session_id` — KHÔNG trộn logic vào `ajax-tuition.php`.

### Quyền
- Học sinh/trợ giảng chỉ xem theo đúng phạm vi được cấp — filter ở AJAX handler.

### DB Schema
- KHÔNG tạo bảng/cột mới ngoài `includes/db-schema.php`.

---

## Files (chưa tạo)

| Backend | Frontend |
|---|---|
| `includes/ajax-grades.php` | `assets/modules/grades.js` |

---

## Test Expectations

- [ ] BTVN '70%' → badge "pending"; '100%' → "done"; không nhập → "-"
- [ ] Ý thức text tự do → lưu và hiển thị đúng nguyên văn
- [ ] Sửa nhận xét ở hồ sơ học sinh → tab Nhật ký cập nhật theo (cùng nguồn)
- [ ] Tạo bài kiểm tra, nhập điểm cả lớp → lưu đúng 1 lần
- [ ] Sửa điểm 1 HS trong bài đã tồn tại → tên bài/thang điểm bị khoá
- [ ] Điểm TB quy đổi đúng thang 10 khi nhiều bài khác thang gốc
- [ ] Học sinh A không xem được điểm học sinh B
- [ ] Không xuất hiện field/loại điểm 'quiz'
