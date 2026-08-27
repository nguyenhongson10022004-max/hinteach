<!-- ═══════════════════════════════════════════════════════════ -->
<!-- STATUS: DEFERRED                                          -->
<!-- DO NOT IMPLEMENT UNLESS EXPLICITLY REQUESTED              -->
<!-- Giữ business rules để dùng về sau.                        -->
<!-- ═══════════════════════════════════════════════════════════ -->

# Quiz Engine — Specification (DEFERRED)

> Module bài tập trắc nghiệm — tính năng MỚI, không có ở bản gốc.
> Ưu tiên hiện tại: dựng xong các module cốt lõi (GĐ3-6).
> KHÔNG code phần này cho tới khi được yêu cầu mở lại rõ ràng.

---

## Mục đích

Giáo viên tạo bộ đề trắc nghiệm (nhập tay hoặc import file), giao cho lớp hoặc học sinh cụ thể, hệ thống chấm điểm tự động ngay khi nộp, kết quả đồng bộ vào bảng điểm (`wp_hinteach_grades`, type=`quiz`) và hiển thị trong hồ sơ học sinh.

---

## Bảng DB (khai báo trong `includes/db-schema.php`, không tạo riêng)

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `wp_ntt_quiz_sets` | teacher_id, title, subject, class_id (nullable), time_limit_minutes, due_date, shuffle_questions (bool), status (`draft`/`published`/`closed`) | class_id NULL nếu giao riêng theo học sinh |
| `wp_ntt_quiz_questions` | quiz_id, question_text, options (JSON: `[{id,text}]`), correct_option_id, explanation, order_index | correct_option_id KHÔNG BAO GIỜ trả về client khi học sinh đang làm bài |
| `wp_ntt_quiz_assignments` | quiz_id, student_id | Expand class → từng học sinh |
| `wp_ntt_quiz_attempts` | quiz_id, student_id, started_at, submitted_at, score, status (`in_progress`/`submitted`/`expired`) | Giới hạn số lượt cấu hình được (mặc định 1) |
| `wp_ntt_quiz_answers` | attempt_id, question_id, selected_option_id, is_correct | Ghi lại sau khi chấm |

---

## Luồng hoạt động

### 1. Giáo viên tạo đề
```
Nhập tay từng câu  HOẶC  Import file (Excel/CSV/Word)
  → dùng chung helper includes/helpers/file-parser.php
  → Cột kỳ vọng: [Câu hỏi | Đáp án A | B | C | D | Đáp án đúng (A/B/C/D) | Giải thích (tuỳ chọn)]
  → Validate: mỗi câu phải có đúng 1 đáp án đúng
  → Lưu status = 'draft' cho tới khi bấm "Giao bài"
```

### 2. Giao bài
```
Chọn: cả lớp HOẶC học sinh lẻ + hạn nộp + giới hạn thời gian (optional)
  → Expand class_id → tạo record quiz_assignments cho từng học sinh
  → Set status = 'published'
```

### 3. Học sinh làm bài
```
GET bài được giao (status='published', due_date >= now, có assignment)
  → Tạo quiz_attempts (started_at = now, status='in_progress')
  → API trả câu hỏi KHÔNG kèm correct_option_id
  → Client đếm ngược time_limit_minutes (UX only)
  → Nộp bài: server kiểm tra submitted_at - started_at <= time_limit_minutes (+ buffer)
    Vượt quá nhiều → status='expired', vẫn chấm nhưng đánh dấu nộp trễ
```

### 4. Chấm tự động (server-side)
```
for each câu trong quiz_answers:
    is_correct = (selected_option_id === quiz_questions.correct_option_id)
score = (số câu đúng / tổng số câu) × 10

→ INSERT quiz_attempts.score
→ INSERT grades (student_id, class_id, test_name=quiz.title, score, scale=10, type='quiz', date=submitted_at)
```

### 5. Xem lại
Học sinh xem đáp án đúng + giải thích — CHỈ sau khi đã nộp (`status IN ('submitted','expired')`).

---

## Điều luật — KHÔNG ĐƯỢC VI PHẠM

### Chống lộ đáp án
- TUYỆT ĐỐI không trả `correct_option_id` trước khi nộp bài — kể cả console.log, field ẩn DOM.
- Chỉ trả sau khi `status` = `submitted`/`expired`.

### Chấm điểm ở server
- Client gửi `selected_option_id`, server tự so sánh.
- KHÔNG tin bất kỳ field "score"/"is_correct" từ client.

### Thời gian làm bài
- `started_at` ghi ở server, KHÔNG lấy từ client.
- Server tự tính thời lượng, KHÔNG tin client báo.

### Sửa câu hỏi sau khi đã có người làm
- KHÔNG update trực tiếp `correct_option_id`/`options` — phải tạo version mới.

### Import câu hỏi
- Dùng chung `hinteach_parse_uploaded_table()`, giới hạn 200 câu/lần.
- Validate: mỗi câu đúng 1 đáp án, báo rõ dòng lỗi, không import 1 phần rồi bỏ qua.

### Lượt làm bài
- Mặc định 1 lượt/bài/học sinh, cấu hình được (KHÔNG hardcode).
- 1 học sinh không được mở 2 attempt `in_progress` cùng lúc cho cùng 1 quiz.

---

## Files (chưa tạo)

| Backend | Frontend |
|---|---|
| `quiz-import.php` | `modules/quiz.js` |
| `quiz-assign.php` | |
| `quiz-grading.php` | |
| `quiz-attempt.php` | |

---

## Test Expectations

- [ ] Tạo đề 5 câu → lưu draft → giao lớp → mọi HS có assignment
- [ ] Import 50 câu → tạo đủ, câu thiếu đáp án đúng báo lỗi rõ
- [ ] HS mở bài → response KHÔNG chứa `correct_option_id`
- [ ] HS nộp bài → điểm = (đúng/tổng) × 10
- [ ] HS sửa DOM/gửi score giả → DB vẫn đúng theo server tính
- [ ] Hết time_limit → auto đóng, status='expired'
- [ ] HS mở lại bài đã nộp → xem đáp án + giải thích, không sửa được
- [ ] GV sửa câu đã có người làm → chặn hoặc tạo version mới
- [ ] Kết quả quiz xuất hiện trong `grades` với type='quiz'
