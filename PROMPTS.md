# PROMPTS MẪU — HINTEACH
> Copy đúng prompt, điền vào chỗ [...], upload đúng file, gửi đi.
> Cập nhật 2026-08-23: đổi tên project, mục 5 (Quiz) chuyển sang trạng thái HOÃN — không dùng cho tới khi mở lại module này.

---

## 1. XÂY MODULE HỌC SINH / LỚP HỌC

**Upload:** `AI_TASK_BUILD_STUDENTS_CLASSES.md` + file liên quan (nếu đã có code)

```
Đọc file AI_TASK_BUILD_STUDENTS_CLASSES.md trước khi làm bất cứ điều gì.

Task: [mô tả tính năng hoặc bug]

Ví dụ: thêm chức năng import học sinh từ file Excel, map cột linh hoạt không cố định thứ tự.

Hãy:
1. Xác định file cần sửa/thêm
2. Nêu rõ những rule nào trong file task cần tuân thủ
3. Đề xuất cách implement phù hợp kiến trúc hiện tại
4. Viết code theo từng bước nhỏ, hỏi lại trước khi tiếp tục bước sau
5. Liệt kê test cases

Chưa viết code nếu chưa có plan rõ ràng.
```

---

## 2. XÂY MODULE THỜI KHOÁ BIỂU

**Upload:** `AI_TASK_BUILD_SCHEDULE.md` + file liên quan

```
Đọc file AI_TASK_BUILD_SCHEDULE.md trước khi làm bất cứ điều gì.

Task: [mô tả]

Ví dụ: xây form ghi buổi học mới với lặp lịch tuỳ chỉnh theo thứ trong tuần.

Hãy:
1. Xác định file cần sửa/thêm
2. Xác nhận cách xử lý repeat_group_id đúng rule (chỉ buổi này / và các buổi sau)
3. Đề xuất implement
4. Viết code từng bước, hỏi lại trước khi tiếp tục
5. Liệt kê test cases
```

---

## 3. XÂY MODULE HỌC PHÍ

**Upload:** `AI_TASK_BUILD_TUITION.md` + file liên quan

```
Đọc file AI_TASK_BUILD_TUITION.md trước khi làm bất cứ điều gì.

Task: [mô tả]

Ví dụ: xây tính năng phụ thu/giảm phí theo phần trăm, áp dụng cho 1 khoảng tháng.

Hãy:
1. Viết lại công thức tính học phí áp dụng cho case này, đối chiếu công thức chuẩn
2. Xác định file cần sửa/thêm
3. Đề xuất implement
4. Viết code từng bước, hỏi lại trước khi tiếp tục
5. Liệt kê test cases (bắt buộc có case số cụ thể, VD: 4 buổi x 100k + phụ thu 10% = ?)
```

---

## 4. XÂY MODULE ĐIỂM SỐ / NHẬT KÝ HỌC TẬP

**Upload:** `AI_TASK_BUILD_GRADES_JOURNAL.md` + file liên quan

```
Đọc file AI_TASK_BUILD_GRADES_JOURNAL.md trước khi làm bất cứ điều gì.

Task: [mô tả]

Hãy:
1. Xác định đây là "điểm số" hay "nhật ký học tập" (2 khái niệm khác nhau)
2. Xác nhận không tạo nguồn dữ liệu trùng lặp giữa các view
3. Đề xuất implement
4. Viết code từng bước, hỏi lại trước khi tiếp tục
5. Liệt kê test cases
```

---

## 5. XÂY MODULE BÀI TẬP TRẮC NGHIỆM — ⏸️ ĐANG HOÃN, CHƯA DÙNG MỤC NÀY

**Upload:** `modules/quiz-engine-DEFERRED/AI_TASK_BUILD_QUIZ.md` + `modules/quiz-engine-DEFERRED/CLAUDE.md` + file liên quan

```
Đọc file AI_TASK_BUILD_QUIZ.md và modules/quiz-engine/CLAUDE.md trước khi làm bất cứ điều gì.

Task: [mô tả]

Ví dụ: xây flow học sinh làm bài có đếm giờ, tự nộp khi hết giờ.

Hãy:
1. Xác định task này chạm giai đoạn nào (tạo đề/giao bài/làm bài/chấm điểm/xem lại)
2. Xác nhận KHÔNG lộ correct_option_id trước khi nộp bài — chỉ rõ ở đâu trong code đã chặn
3. Xác nhận chấm điểm chạy ở server
4. Đề xuất implement
5. Viết code từng bước, hỏi lại trước khi tiếp tục
6. Liệt kê test cases (bắt buộc có case thử "gian lận" — sửa DOM/gửi score giả từ client)
```

---

## 6. REVIEW TRƯỚC KHI DEPLOY

**Upload:** `AI_TASK_REVIEW_BEFORE_DEPLOY.md` + file vừa sửa

```
Đọc file AI_TASK_REVIEW_BEFORE_DEPLOY.md trước khi làm bất cứ điều gì.

Tôi vừa làm: [tên file, mô tả ngắn thay đổi]

Hãy review theo checklist trong file và kết luận:
- SAFE TO DEPLOY
- CẦN SỬA THÊM (liệt kê vấn đề)
- KHÔNG DEPLOY (giải thích lý do)
```

---

## 7. HỎI VỀ CƠ CHẾ / HIỂU CODE

**Upload:** file liên quan

```
Giải thích cho tôi hiểu cơ chế hoạt động của [tên hàm/tính năng].

Cụ thể tôi muốn hiểu:
- [câu hỏi 1]
- [câu hỏi 2]

Giải thích đơn giản, dùng ví dụ cụ thể nếu cần.
Không sửa code, chỉ giải thích.
```

---

---

# GHI LẠI SAU KHI LÀM XONG — LESSONS LEARNED

> Mỗi khi fix xong bug khó hoặc có quyết định kiến trúc quan trọng, ghi vào đây.
> Mục đích: không lặp lại sai lầm, AI lần sau biết tránh.

## TEMPLATE GHI LẠI

```
### [Ngày] — [Tên bug / tính năng]

**Vấn đề:**
Mô tả bug hoặc task.

**Nguyên nhân gốc:**
Root cause thực sự là gì.

**Cách fix:**
Fix như thế nào, sửa file nào, dòng nào.

**Bài học:**
- Điều cần nhớ để không lặp lại
- Rule mới cần thêm vào CLAUDE.md / AI_TASK nào

**File đã update:**
- [ ] CLAUDE.md (root)
- [ ] includes/CLAUDE.md
- [ ] assets/CLAUDE.md
- [ ] modules/quiz-engine/CLAUDE.md
- [ ] AI_TASK file liên quan
```

## LESSONS LEARNED

*(Thêm lesson mới vào đây sau mỗi lần fix bug lớn hoặc quyết định kiến trúc quan trọng)*
