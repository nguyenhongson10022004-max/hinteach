> ## ⏸️ HOÃN LẠI (2026-08-23) — không dùng file này cho tới khi module quiz được mở lại rõ ràng.

---

# AI TASK — BUILD MODULE BÀI TẬP TRẮC NGHIỆM (QUIZ ENGINE)
> Dùng khi làm/mở rộng: tạo đề, import câu hỏi, giao bài, học sinh làm bài, chấm tự động
> Đây là tính năng MỚI, không có ở bản gốc — cẩn thận hơn các module khác vì chưa có "hành vi chuẩn" để đối chiếu.

---

## BƯỚC 0 — ĐỌC TRƯỚC KHI LÀM GÌ

Bạn PHẢI đọc các file này trước:
1. `CLAUDE.md` (root)
2. `modules/quiz-engine/CLAUDE.md` — TOÀN BỘ, đây là spec chi tiết nhất của module này
3. `includes/CLAUDE.md` — phần "FILE IMPORT" (helper dùng chung)

Chưa đọc hết `modules/quiz-engine/CLAUDE.md` thì chưa được đề xuất fix/tính năng.

---

## PHÂN TÍCH TRƯỚC — VIẾT CODE SAU

**1. Task này chạm vào giai đoạn nào của luồng?**
Tạo đề / Giao bài / Làm bài / Chấm điểm / Xem lại — xác định rõ 1 hoặc nhiều giai đoạn.

**2. File và vùng code cần đụng vào?**
`quiz-import.php` / `quiz-assign.php` / `quiz-grading.php` / `quiz-attempt.php` / `modules/quiz.js`.

**3. Có đụng tới dữ liệu đáp án đúng (`correct_option_id`) không?**
Nếu có: xác nhận response API gửi cho học sinh KHÔNG BAO GIỜ chứa field này trước khi nộp bài — kiểm tra ở tầng PHP, không chỉ ẩn ở JS.

**4. Có đụng tới việc chấm điểm không?**
Nếu có: xác nhận chấm điểm xảy ra ở server (`quiz-grading.php`), không phải client.

---

## ĐIỀU LUẬT — KHÔNG ĐƯỢC VI PHẠM

### Chống lộ đáp án
- API trả câu hỏi cho học sinh (khi đang `in_progress`) TUYỆT ĐỐI không kèm `correct_option_id` trong payload JSON — kể cả ẩn trong field khác, kể cả trong response debug.
- Chỉ trả `correct_option_id` + `explanation` sau khi `wp_ntt_quiz_attempts.status` đã là `submitted` hoặc `expired`.

### Chấm điểm ở server
- `selected_option_id` gửi từ client lên, server tự so sánh với `correct_option_id` trong DB để tính `is_correct` và `score`.
- KHÔNG tin bất kỳ field "score"/"is_correct" nào gửi từ client lên — nếu client gửi kèm, server phải bỏ qua và tự tính lại.

### Thời gian làm bài
- `started_at` ghi ở server khi học sinh bắt đầu, KHÔNG lấy từ client.
- Khi nộp bài, server tự tính `submitted_at - started_at` so với `time_limit_minutes` (+ buffer nhỏ vài giây cho độ trễ mạng) để xác định `status = submitted` hay `expired` — KHÔNG tin thời gian còn lại mà client báo về.

### Sửa câu hỏi sau khi đã có người làm
- Nếu 1 câu hỏi đã có record trong `wp_ntt_quiz_answers` tham chiếu tới → KHÔNG update trực tiếp `correct_option_id`/`options` của câu đó. Phải tạo bản mới (versioning) nếu cần sửa nội dung.

### Import câu hỏi
- Dùng chung `ntt_parse_uploaded_table()` — không viết parser riêng.
- Giới hạn 200 câu/lần import.
- Validate: mỗi câu phải có đúng 1 đáp án đúng nằm trong các lựa chọn đã nhập, báo rõ số dòng lỗi, không import 1 phần rồi bỏ qua lỗi âm thầm.

### Lượt làm bài
- Mặc định 1 lượt/bài/học sinh, số lượt cấu hình được ở `wp_ntt_quiz_sets` (KHÔNG hardcode).
- 1 học sinh không được mở 2 attempt `in_progress` cùng lúc cho cùng 1 quiz.

### DB Schema
- KHÔNG tạo bảng/cột mới ngoài `includes/db-schema.php`.

---

## SAU KHI ĐỀ XUẤT — LIỆT KÊ TEST CASES

- [ ] Giáo viên tạo đề thủ công 5 câu → lưu draft → giao cho 1 lớp → mọi học sinh trong lớp có assignment
- [ ] Import file 50 câu đúng định dạng → tạo đủ 50 câu, câu nào thiếu đáp án đúng bị báo lỗi rõ dòng
- [ ] Học sinh mở bài làm → response KHÔNG chứa `correct_option_id` (verify bằng cách xem raw response, không chỉ xem UI)
- [ ] Học sinh nộp bài → điểm tính đúng = (số câu đúng/tổng câu) × 10
- [ ] Học sinh cố tình sửa DOM/JS để tự chấm đúng → điểm thật lưu trong DB vẫn đúng theo server tính, không bị ảnh hưởng
- [ ] Hết thời gian time_limit mà học sinh không nộp → hệ thống tự đóng bài, tính điểm theo các câu đã trả lời, status = 'expired'
- [ ] Học sinh mở lại bài đã nộp → xem được đáp án đúng + giải thích, không sửa được câu trả lời
- [ ] Giáo viên sửa câu hỏi đã có học sinh làm → hệ thống chặn hoặc tạo version mới, không làm lệch điểm cũ
- [ ] Kết quả quiz tự động xuất hiện trong `wp_ntt_grades` với type='quiz', đúng student_id/class_id
- [ ] (Thêm case cụ thể cho task đang làm)
