> ## ⏸️ MODULE NÀY ĐANG HOÃN LẠI (2026-08-23)
> Ưu tiên hiện tại là dựng xong các module cốt lõi (Lớp học/Học sinh/Thời khoá biểu/Học phí/Điểm số/Nhật ký)
> cho HinTeach, khớp đúng dữ liệu quan sát từ bản gốc. KHÔNG code phần dưới đây cho tới khi được
> yêu cầu mở lại rõ ràng. Nội dung giữ nguyên để dùng lại sau, không cần đọc/áp dụng bây giờ.
> Xem `../../CLAUDE.md` phần "GIAI ĐOẠN PHÁT TRIỂN".

---

# modules/quiz-engine/ — MODULE BÀI TẬP TRẮC NGHIỆM (TÍNH NĂNG MỚI)
> Thuộc plugin `ntt-class` | Đọc `../../CLAUDE.md` trước file này
> Đây là module KHÔNG có ở bản gốc — thiết kế mới để học sinh tự rèn luyện/làm bài về nhà.

---

## MỤC ĐÍCH

Giáo viên tạo bộ đề trắc nghiệm (nhập tay hoặc import file), giao cho lớp hoặc học sinh cụ thể, hệ thống chấm điểm tự động ngay khi nộp, kết quả đồng bộ vào bảng điểm (`wp_ntt_grades`, type=`quiz`) và hiển thị trong hồ sơ học sinh.

---

## BẢNG DB (khai báo trong `includes/db-schema.php`, không tạo riêng ở đây)

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `wp_ntt_quiz_sets` | teacher_id, title, subject, class_id (nullable), time_limit_minutes, due_date, shuffle_questions (bool), status (`draft`/`published`/`closed`) | class_id NULL nếu giao riêng theo học sinh |
| `wp_ntt_quiz_questions` | quiz_id, question_text, options (JSON: `[{id,text}]`), correct_option_id, explanation, order_index | correct_option_id KHÔNG BAO GIỜ trả về client khi học sinh đang làm bài |
| `wp_ntt_quiz_assignments` | quiz_id, student_id | Danh sách học sinh được giao (giáo viên chọn lớp → hệ thống tự expand ra từng học sinh) |
| `wp_ntt_quiz_attempts` | quiz_id, student_id, started_at, submitted_at, score, status (`in_progress`/`submitted`/`expired`) | 1 học sinh có thể giới hạn số lượt làm (mặc định 1, cấu hình được ở quiz_sets) |
| `wp_ntt_quiz_answers` | attempt_id, question_id, selected_option_id, is_correct | Ghi lại sau khi chấm, dùng để hiện "xem lại bài làm" |

---

## LUỒNG HOẠT ĐỘNG

### 1. Giáo viên tạo đề
```
Nhập tay từng câu  HOẶC  Import file (Excel/CSV/Word)
  → dùng chung helper includes/helpers/file-parser.php (xem includes/CLAUDE.md)
  → Cột kỳ vọng: [Câu hỏi | Đáp án A | Đáp án B | Đáp án C | Đáp án D | Đáp án đúng (A/B/C/D) | Giải thích (tuỳ chọn)]
  → Validate: mỗi câu phải có đúng 1 đáp án đúng nằm trong các lựa chọn đã nhập
  → Lưu status = 'draft' cho tới khi giáo viên bấm "Giao bài"
```

### 2. Giao bài
```
Giáo viên chọn: cả lớp HOẶC học sinh lẻ + hạn nộp (due_date) + giới hạn thời gian (time_limit_minutes, optional)
  → quiz-assign.php: expand class_id → tạo record wp_ntt_quiz_assignments cho từng học sinh
  → set status = 'published'
```

### 3. Học sinh làm bài
```
GET danh sách bài được giao (chỉ quiz có status='published', due_date >= now, có assignment cho student_id này)
  → Bắt đầu làm: tạo wp_ntt_quiz_attempts (started_at = now, status='in_progress')
  → API trả câu hỏi KHÔNG kèm correct_option_id
  → Client đếm ngược time_limit_minutes (UX only)
  → Nộp bài (thủ công hoặc auto khi hết giờ):
      Server tính lại: submitted_at - started_at <= time_limit_minutes (+ buffer vài giây network)?
      Nếu vượt quá nhiều → status='expired', vẫn chấm nhưng đánh dấu nộp trễ
```

### 4. Chấm tự động (server-side, `quiz-grading.php`)
```
for each câu trong wp_ntt_quiz_answers:
    is_correct = (selected_option_id === wp_ntt_quiz_questions.correct_option_id)
score = (số câu đúng / tổng số câu) × 10   -- quy về thang điểm 10, khớp bản gốc "Quy đổi thang điểm 10"

→ INSERT wp_ntt_quiz_attempts.score
→ INSERT wp_ntt_grades (student_id, class_id, test_name=quiz.title, score, scale=10, type='quiz', date=submitted_at)
```

### 5. Xem lại
Học sinh xem được: câu nào đúng/sai, đáp án đúng, giải thích (nếu giáo viên có nhập) — CHỈ sau khi đã nộp (`status IN ('submitted','expired')`).

---

## 🔴 TUYỆT ĐỐI KHÔNG (riêng module này)

1. **KHÔNG trả `correct_option_id` trong bất kỳ response nào trước khi học sinh nộp bài** — kể cả trong console.log debug, kể cả field ẩn trong DOM.
2. **KHÔNG cho phép giáo viên sửa `correct_option_id` của câu hỏi đã có `wp_ntt_quiz_answers` tham chiếu tới** — nếu cần sửa nội dung câu hỏi sau khi đã có học sinh làm, tạo bản câu hỏi mới (versioning), không update ngược làm sai lệch điểm lịch sử.
3. **KHÔNG tính điểm ở client** — `quiz.js` chỉ gửi `selected_option_id` lên server, KHÔNG tự so sánh và hiển thị "đúng/sai" trước khi có phản hồi từ `quiz-grading.php`.
4. **KHÔNG cho học sinh xem đáp án đúng của bài đang `in_progress`** dù đã hết giờ hiển thị trên client — chỉ khi server xác nhận `status` đã chuyển `submitted`/`expired`.
5. **KHÔNG giới hạn số câu hỏi/số lượt làm cứng trong code** — để giáo viên cấu hình (mặc định hợp lý: không giới hạn số câu, 1 lượt làm/bài) qua `wp_ntt_quiz_sets`.

## 🟡 LƯU Ý KHI IMPORT FILE

- Dùng lại `ntt_parse_uploaded_table()` từ `includes/helpers/file-parser.php` — không viết parser riêng cho quiz.
- Giới hạn hợp lý: tối đa 200 câu/file/lần import (khác với giới hạn 500 dòng của import học sinh, vì mỗi câu có nhiều cột options phức tạp hơn).
- Nếu 1 dòng lỗi (thiếu đáp án đúng, thiếu câu hỏi...) → báo rõ số dòng lỗi, KHÔNG import 1 phần rồi im lặng bỏ qua dòng lỗi.
