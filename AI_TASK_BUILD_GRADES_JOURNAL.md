# AI TASK — BUILD MODULE ĐIỂM SỐ / NHẬT KÝ HỌC TẬP
> Dùng khi làm/mở rộng: nhập điểm, nhật ký học tập (BTVN/ý thức/nhận xét theo buổi), đồng bộ giữa 2 nơi hiển thị
> Cập nhật 2026-08-23: xác nhận field BTVN thật là % hoàn thành, không phải trạng thái

---

## BƯỚC 0 — ĐỌC TRƯỚC KHI LÀM GÌ

1. `CLAUDE.md` (root)
2. `includes/CLAUDE.md` — schema `wp_hinteach_grades`, `wp_hinteach_session_students`

---

## PHÂN TÍCH TRƯỚC — VIẾT CODE SAU

**1. Đây là "điểm số" (bài kiểm tra) hay "nhật ký học tập" (BTVN/ý thức/nhận xét theo buổi)?**

**2. File và vùng code cần đụng vào?**
`ajax-grades.php` / `modules/grades.js`.

**3. Đang đụng field BTVN — có đúng kiểu dữ liệu không?**
BTVN (`homework`) là **enum phần trăm**: `'0%'`, `'30%'`, `'50%'`, `'70%'`, `'100%'` — KHÔNG phải boolean "đã làm/chưa làm", KHÔNG phải điểm 0-10. Có mapping tương thích ngược từ dữ liệu cũ hơn (`'Chưa làm'→'0%'`, `'Chưa hoàn thành'→'50%'`, `'Hoàn thành'→'100%'`) — chỉ cần biết để hiểu dữ liệu cũ, KHÔNG cần replicate mapping này trong hệ thống mới trừ khi có data cũ thật cần import.

**4. Field "ý thức" (`attitude`) là TEXT TỰ DO, không phải điểm số** — khác với field `attitude_score` (kiểu số) từng giả định trước đây. Sửa lại nếu code cũ dùng kiểu số.

**5. Dữ liệu này đồng bộ ở mấy nơi?**
Nhật ký học tập hiển thị cả ở tab riêng VÀ hồ sơ học sinh — cùng 1 nguồn (`wp_hinteach_session_students`), không phải 2 bảng.

**6. Minimal patch là gì?**

---

## ĐIỀU LUẬT — KHÔNG ĐƯỢC VI PHẠM

### Tách domain điểm số / học phí
- Điểm số và học phí độc lập dù cùng gắn `session_id` — KHÔNG trộn logic vào `ajax-tuition.php`.

### Một nguồn dữ liệu duy nhất cho nhật ký học tập
- BTVN/ý thức/nhận xét lưu ở `wp_hinteach_session_students` — tab "Nhật ký học tập" chỉ là 1 VIEW khác.

### Kiểu dữ liệu đúng
- `homework`: enum 5 giá trị `'0%'/'30%'/'50%'/'70%'/'100%'`, hiển thị dạng badge màu theo ngưỡng: ≥100% = "done", ≥50% = "pending", còn lại = "not-done" (khớp `getHomeworkClass` quan sát từ bundle.js).
- `attitude`: TEXT tự do, không giới hạn giá trị cố định.
- `individual_comment`, `note`: TEXT tự do, giới hạn 500 ký tự theo UI quan sát (`maxlength="500"`).

### Loại điểm (`wp_hinteach_grades.type`)
- Chỉ nhận: `homework` (BTVN — LƯU Ý: đây là loại BÀI KIỂM TRA BTVN, khác với field `homework` % trong nhật ký học tập — 2 khái niệm trùng tên khác ý nghĩa, cẩn thận khi code để không nhầm), `test` (kiểm tra thường xuyên), `final` (kiểm tra cuối chương).
- KHÔNG có `type='quiz'` ở giai đoạn hiện tại (hoãn cùng quiz-engine).
- Sửa thông tin chung bài kiểm tra (tên, thang điểm) khi đang edit điểm học sinh → PHẢI khoá các field chung để tránh lệch dữ liệu học sinh khác.

### Quy đổi thang điểm
- `diem_quy_doi = (score / scale) * 10`.

### Quyền xem
- Học sinh/trợ giảng chỉ xem điểm/nhật ký theo đúng phạm vi được cấp — filter ở AJAX handler.

---

## SAU KHI ĐỀ XUẤT — LIỆT KÊ TEST CASES

- [ ] Nhập BTVN cho 1 buổi, chọn '70%' → badge hiển thị đúng màu "pending" (50-99%)
- [ ] Nhập BTVN '100%' → badge "done"; không nhập gì → badge "no-data" hiển thị "-"
- [ ] Nhập ý thức dạng text tự do (VD: "Tập trung tốt") → lưu và hiển thị đúng nguyên văn
- [ ] Sửa nhận xét ở hồ sơ học sinh → tab Nhật ký học tập cập nhật theo (cùng nguồn)
- [ ] Tạo bài kiểm tra mới, nhập điểm cho cả lớp → lưu đúng 1 lần
- [ ] Sửa điểm 1 học sinh trong bài đã tồn tại → tên bài/thang điểm bị khoá
- [ ] Điểm trung bình quy đổi đúng thang 10 khi có nhiều bài khác thang điểm gốc
- [ ] Học sinh A không xem được điểm/nhật ký của học sinh B
- [ ] Không xuất hiện field/loại điểm 'quiz' ở bất kỳ đâu trong module này
- [ ] (Thêm case cụ thể cho task đang làm)
