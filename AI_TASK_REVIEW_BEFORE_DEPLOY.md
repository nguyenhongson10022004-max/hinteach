# AI TASK — REVIEW TRƯỚC KHI DEPLOY
> Dùng trước khi upload code lên server. Bắt AI kiểm tra toàn bộ thay đổi có an toàn không.
> Cập nhật 2026-08-23: thêm check billing_mode, bỏ check quiz (module đang hoãn)

---

## BƯỚC 0 — ĐỌC TRƯỚC KHI LÀM GÌ

1. `CLAUDE.md` (root) — toàn bộ điều luật và kiến trúc

Đọc thêm file liên quan tuỳ theo code đang review:
- Sửa Học sinh/Lớp → `AI_TASK_BUILD_STUDENTS_CLASSES.md`
- Sửa Thời khoá biểu → `AI_TASK_BUILD_SCHEDULE.md`
- Sửa Học phí → `AI_TASK_BUILD_TUITION.md`
- Sửa Điểm số/Nhật ký → `AI_TASK_BUILD_GRADES_JOURNAL.md`

⚠️ Nếu code review có đụng tới bất kỳ thứ gì liên quan `quiz`/bài trắc nghiệm/tài khoản học sinh tự làm bài → **DỪNG LẠI, hỏi lại người dùng** vì module này đang chủ động hoãn, không nên xuất hiện trong deploy hiện tại.

---

## CHECKLIST REVIEW — TRẢ LỜI TỪNG MỤC

### 1. Phạm vi thay đổi
```
□ File nào bị sửa?
□ Hàm/action nào bị thay đổi?
□ Có sửa ngoài phạm vi task không?
□ Có code nào thuộc quiz-engine bị lẫn vào không? → Nếu CÓ: dừng, xác nhận lại phạm vi
```

### 2. Kiểm tra rule cốt lõi theo domain

**Dữ liệu & DB (mọi domain):**
```
□ Có tạo bảng/cột mới ngoài includes/db-schema.php không? → Nếu CÓ: vi phạm
□ Có xoá cứng thay vì soft delete không? → Nếu CÓ: vi phạm
```

**Phân quyền (mọi domain):**
```
□ AJAX handler có filter theo teacher_id/student_id sở hữu không? → Nếu KHÔNG: vi phạm nghiêm trọng
□ Với route liên quan trợ giảng: có check đúng wp_hinteach_assistant_permissions theo module_key
  không, hay chỉ check role chung chung? → Nếu chỉ check role: vi phạm
```

**Học phí (nếu sửa ajax-tuition.php) — QUAN TRỌNG NHẤT SAU KHI CẬP NHẬT:**
```
□ Code có XÁC ĐỊNH RÕ đang xử lý billing_mode nào (session/course/monthly) không?
  → Nếu code áp dụng công thức của 1 mode cho cả 3: vi phạm nghiêm trọng
□ Mode 'session' có lưu tĩnh số tiền thay vì tính động không? → Nếu CÓ: vi phạm
□ Mode 'course'/'monthly' có bị đổi sang tính động từ số buổi không? → Nếu CÓ: vi phạm
  (2 mode này BẮT BUỘC là số cố định theo period_key)
□ fee_override có đúng thứ tự ưu tiên, và chỉ áp dụng cho mode 'session' không?
```

**Lịch lặp (nếu sửa ajax-schedule.php):**
```
□ Có hỏi rõ "chỉ buổi này" hay "buổi này và sau" không? → Nếu KHÔNG: vi phạm
□ Có động vào buổi đã qua khi sửa "và các buổi sau" không? → Nếu CÓ: vi phạm
□ Giới hạn 366 buổi có chặn ở server (không chỉ client) không? → Nếu KHÔNG: vi phạm
```

### 3. Side effects
```
□ Thay đổi có ảnh hưởng tính năng khác không?
□ Có thay đổi AJAX action nào mà JS module khác đang gọi không?
□ Có thêm/xoá cột DB nào cần trace toàn bộ codebase không?
□ Có thêm AJAX endpoint mới không? (cần update includes/CLAUDE.md)
```

### 4. Test cases cần verify
Liệt kê cụ thể, ứng với thay đổi này.

### 5. Kết luận
```
SAFE TO DEPLOY   — không vi phạm rule, side effects chấp nhận được
CẦN SỬA THÊM     — liệt kê vấn đề cụ thể cần fix
KHÔNG DEPLOY      — vi phạm rule cốt lõi (đặc biệt: nhầm công thức học phí giữa 3 mode,
                     thiếu filter quyền sở hữu, lẫn code quiz-engine vào), giải thích lý do
```

---

## CÁCH DÙNG

```
[Paste AI_TASK_REVIEW_BEFORE_DEPLOY.md]

Đây là code tôi vừa làm, hãy review theo checklist trên:

[Paste code diff hoặc toàn bộ hàm đã sửa/thêm]
```
