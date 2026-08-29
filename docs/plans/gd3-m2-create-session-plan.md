# GĐ3 M2 — Phân tích & Implementation Plan (v3 — FINAL, decisions locked)

> Ngày phân tích: 2026-08-29 (v1) — cập nhật v2 sau review, thêm Decision Log.
> Cập nhật v3 (2026-08-29): owner đã chốt cả 4 mục `NEED OWNER DECISION` → chuyển `APPROVED`.
> Tài liệu này là bản FINAL để bắt đầu code M2. Không còn mục nào chặn implementation.
> Nguồn: `CLAUDE.md`, `STATUS.md`, `docs/history/gd3-m1-schedule-completed.md`, `docs/specs/schedule.md`,
> `GD3-HAR-analysis-checkpoint.md`, HAR 3.1–3.11 gốc (đọc trực tiếp, không chỉ đọc checkpoint),
> `app-bundle.js` (đọc trực tiếp, không suy diễn), codebase HinTeach hiện tại (đọc trực tiếp).
> KHÔNG CODE trong phiên phân tích gốc — implementation bắt đầu sau khi file này được duyệt.

---

# M2 DECISION LOG (v3 — tất cả đã chốt)

Tất cả 4 mục trước đây `NEED OWNER DECISION` nay đã `APPROVED` bởi chủ dự án (2026-08-29).
Không còn mục nào cần dừng lại hỏi trong lúc code M2.

| # | Mục | Trạng thái | Quyết định |
|---|---|---|---|
| 1 | **Conflict detection scope** | `APPROVED` | **Chặn theo `teacher_id`.** Một giáo viên không thể có 2 buổi overlap giờ trong cùng ngày, bất kể khác lớp/khác học sinh. HAR 3.6 (1 mẫu) không mâu thuẫn với cách hiểu này; về nghiệp vụ, giáo viên là entity duy nhất bị giới hạn bởi thời gian vật lý. Đây là HinTeach business decision, không phải suy diễn từ HAR — ghi rõ nhãn `[HINTEACH DESIGN DECISION]` khi implement. |
| 2 | **Assistant `scheduler` module — quyền ghi hay chỉ đọc?** | `APPROVED` | **Assistant có module `scheduler` được bật → được phép tạo session (full write ở phạm vi M2).** Lý do: `includes/CLAUDE.md` không có ghi chú cấm tương tự như `classProfiles` (nơi tường minh "trợ giảng không được tạo/sửa lớp"); sự vắng mặt của rule cấm tương tự ở `scheduler` được hiểu là cho phép. Đây là business decision của owner, không phải suy luận runtime từ M1 (M1 chỉ có nhánh đọc). |
| 3 | **`type='chung'` có được phép chỉ 1 học sinh?** | `APPROVED` | **KHÔNG cho phép — `chung` bắt buộc ≥ 2 học sinh.** Lý do: đúng ngữ nghĩa tên gọi ("chung" = nhiều người dùng chung buổi); trường hợp "lớp chỉ còn 1 học sinh hôm đó" phải dùng `type='riêng'`. Server phải validate chặn `chung` + 1 học sinh → lỗi 400, không âm thầm chấp nhận. |
| 4 | **Nguồn giá trị `price` khi tạo buổi** | `APPROVED` | **`sessions.price` nhận giá trị cuối cùng do frontend gửi lên; backend chỉ validate `>= 0`, không tự tính/không override.** Frontend (M2) *có thể* prefill gợi ý (ví dụ tổng theo giá mặc định học sinh/lớp) trước khi giáo viên xác nhận hoặc sửa tay — việc prefill là UI convenience, không phải nguồn sự thật bắt buộc. Với lớp có `billing_mode` khác `session` (`course`/`monthly`): field `price` trên form tạo buổi **vẫn hiển thị và vẫn được lưu như bình thường ở M2** (không ẩn, không set cứng 0); ý nghĩa nghiệp vụ của `price` trong các `billing_mode` này (có ảnh hưởng học phí hay chỉ mang tính ghi chú) thuộc phạm vi tích hợp học phí GĐ4, **không xử lý ở M2** — M2 chỉ lưu đúng giá trị nhận được, không diễn giải thêm. |
| 5 | **Field cố tình KHÔNG thêm ở M2: `sessions.completed`** | `APPROVED` | Không đổi so với v2: không thêm cột, không nhận field này từ client ở M2. |
| 6 | **Field cố tình KHÔNG thêm ở M2: `sessions.paid`** | `APPROVED` | Không đổi: `session_students.paid` là nguồn DUY NHẤT, quyết định kiến trúc có sẵn từ trước M2. |
| 7 | **Field cố tình KHÔNG thêm ở M2: `duration`** | `APPROVED` | Không đổi: không lưu `duration`, tính on-the-fly khi cần, không persist. |

**Quy tắc xử lý (không đổi so với v2):** nếu trong lúc code phát sinh 1 điểm *mới* chưa có
evidence và chưa có quyết định ở bảng trên, áp dụng lại đúng quy trình: cô lập sau 1 flag rõ
ràng, ghi chú `// TODO: chờ owner quyết định`, và dừng lại hỏi thay vì tự chọn nhánh "hợp lý".
Guardrail này chỉ áp dụng cho các điểm phát sinh mới — **không áp dụng lại cho 4 mục #1–4 ở trên,
đã chốt, không hỏi lại.**

## Điểm đã đủ evidence để KHÔNG cần đưa vào Decision Log (không đổi so với v2)

**Quy ước HTTP status code trong `wp_send_json_error()`:** đọc trực tiếp `ajax-schedule.php`,
`ajax-classes.php`, `ajax-students.php` cho thấy **mọi handler đều dùng
`wp_send_json_error( $data, $status_code )`** với status code tường minh (`400, 401, 403, 404,
500` đã dùng). M2 dùng `wp_send_json_error( array('message'=>..., 'conflict'=>...), 409 )` cho
case trùng lịch — áp dụng đúng convention sẵn có, không phải phát minh pattern mới.

---

# PHASE 1 — ĐỌC PROJECT

*(Không đổi so với v2 — xem lại nội dung gốc; không lặp lại ở đây để tránh 2 nguồn lệch nhau.)*

M1 = Calendar Shell + Session List, READ ONLY, commit `792e117` (2026-08-28).
M2 = Tạo buổi học đơn lẻ (single session), type `riêng` + `chung`, KHÔNG bao gồm recurrence,
edit, delete, quick-entry, đổi màu.

| Milestone | Nội dung |
|---|---|
| **M2** (tài liệu này) | Create session đơn lẻ — `riêng` + `chung`, conflict 409 (scope: `teacher_id`), duration normalize |
| M3 (chưa lập plan) | Recurrence: batch create + 4 thuật toán sinh ngày + conflict batch |
| M4 (chưa lập plan) | Edit (single/following) + Delete (single/following) |
| M5 (chưa lập plan) | Quick-entry (journal + scoreGroups) + Đổi màu (display-color propagate) |

---

# PHASE 2 — PHÂN TÍCH HAR EVIDENCE

*(Bảng tổng hợp feature không đổi so với v2 — xem nội dung gốc cho phần recurrence/edit/delete/
quick-entry/display-color, tất cả ngoài phạm vi M2.)*

### Cập nhật riêng cho M2 (create) sau khi decision chốt

| Khía cạnh | v2 (trước chốt) | v3 — áp dụng cho code |
|---|---|---|
| `type` validation | `chung` → ≥1 student (chưa xác nhận) | **`chung` → ≥2 student (APPROVED, Decision Log #3).** `riêng` → đúng 1 student (không đổi). |
| Conflict scope | Chưa xác nhận ai/`teacher_id`/`student_id`/`class_id` | **`teacher_id` (APPROVED, Decision Log #1).** Overlap = cùng `teacher_id` + cùng `date` + khoảng giờ giao nhau. |
| `price` | Nguồn giá trị chưa rõ, cần hỏi | **Nhận giá trị cuối từ client, backend chỉ validate `>=0`, không tự tính (APPROVED, Decision Log #4).** |
| Assistant `scheduler` write | Chưa xác nhận có được tạo buổi | **Được phép, nếu module `scheduler` đang bật cho assistant đó (APPROVED, Decision Log #2).** |
| Conflict response structure | HAR 3.6 (batch): `409`, `{error, conflict:{id,date,startTime,endTime,sessionName}}` | Không đổi — áp dụng nguyên cấu trúc này cho single-create ở M2, đổi tên field sang `snake_case`. |

---

# PHASE 3 — PHÂN TÍCH FRONTEND ORIGINAL (`app-bundle.js`)

*(Không đổi so với v2 — không liên quan trực tiếp tới 4 decision vừa chốt. Xem nội dung gốc:
client-generated ID không dùng, giới hạn 366 ngày sinh recurrence, monthly fallback
bundle-confirmed, `updateScope` chỉ có `single`/`following` — tất cả ngoài phạm vi M2.)*

---

# PHASE 4 — PHÂN TÍCH HINTEACH CODEBASE

*(Không đổi so với v2 cho phần liệt kê file. Cập nhật duy nhất: mục "Database impact" — không có
thay đổi migration nào phát sinh từ 4 decision vừa chốt, vì không decision nào yêu cầu thêm cột
mới. `session_students.fee_amount` vẫn luôn `NULL` ở M2 — decision #4 chỉ nói về `sessions.price`,
không đổi cách xử lý `fee_amount` per-student.)*

**Kết luận không đổi:** M2 không cần sửa `includes/db-schema.php`.

---

# PHASE 5 — M2 IMPLEMENTATION PLAN (FINAL)

## 1. Scope

Không đổi so với v2. Trong phạm vi M2: tạo buổi đơn lẻ `riêng`/`chung`, validate, conflict 409,
duration normalize (không persist), UI tạo buổi trên calendar M1.

## 3. HAR-derived business rules — bản FINAL (đã khoá theo Decision Log)

1. **[HAR CONFIRMED]** `type='riêng'` → đúng 1 student.
2. **[HINTEACH DESIGN DECISION — Decision Log #3, APPROVED]** `type='chung'` → **≥ 2** student
   (không phải ≥1 như v2 đã viết nháp — sửa lại đúng theo quyết định cuối).
3. **[HAR CONFIRMED]** Buổi đơn lẻ (không lặp) → `repeat_group_id = NULL`.
4. **[HINTEACH DESIGN DECISION — Decision Log #4, APPROVED]** `price` = giá trị client gửi,
   backend chỉ validate `>=0`, không tự tính lại, không override. Prefill (nếu có) là việc của
   frontend, không phải rule backend.
5. **[HINTEACH DESIGN DECISION — Decision Log #1, APPROVED]** Conflict giờ học → chặn theo
   `teacher_id`. Cùng ngày + khung giờ giao nhau + cùng `teacher_id` (bất kể khác `class_id`/
   `student_id`) → 409, trả `{error, conflict:{...}}`.
6. **[HAR CONFIRMED]** Duration là phái sinh từ `start_time`/`end_time`, không nhận `duration`
   từ client, không persist.
7. **[HINTEACH DESIGN DECISION]** `fee_amount` mặc định `NULL` cho mọi dòng `session_students`
   tạo ở M2 (không đổi so với v2 — decision #4 không ảnh hưởng field này).
8. **[HINTEACH DESIGN DECISION]** `display_color` gửi rỗng → lưu `NULL`.
9. **[HINTEACH DESIGN DECISION — Decision Log #2, APPROVED]** Assistant có module `scheduler`
   bật → được phép gọi `hinteach_session_save` để tạo buổi, xử lý quyền giống teacher (không cần
   check thêm điều kiện đặc biệt nào khác ngoài `hinteach_user_can_module($uid, 'scheduler')`
   đã có sẵn).

## 5. Backend changes — bản FINAL

File: `includes/ajax-schedule.php`. Action mới: `hinteach_session_save` (POST, create-only ở M2).

Cấu trúc handler (đã khoá quyết định, không còn nhánh "cần xác nhận"):

1. `hinteach_schedule_check_access()` — dùng lại y nguyên (đã bao gồm
   `hinteach_user_can_module($uid, 'scheduler')`).
2. **Check quyền ghi (Decision Log #2 — APPROVED):** không cần thêm điều kiện gì ngoài
   `hinteach_schedule_check_access()` đã pass ở bước 1. Assistant có `scheduler` module bật =
   được phép tạo buổi, y hệt teacher/admin. Không phân biệt read/write cho module này ở M2.
3. Thu thập input (`class_id, date, start_time, end_time, type, student_ids[], price,
   session_name, content, homework_content, general_comment, display_color`).
4. Validate:
   - `class_id` tồn tại, thuộc đúng `teacher_id` (không trust client).
   - `date` format `YYYY-MM-DD` hợp lệ.
   - `start_time < end_time`.
   - `type` ∈ {`riêng`,`chung`}.
   - **`riêng` → đúng 1 `student_id`; `chung` → ≥ 2 `student_id` (Decision Log #3 — nếu `chung`
     chỉ có 1 học sinh → 400, không âm thầm chấp nhận).**
   - Mọi `student_id` phải thuộc `class_id` đó.
   - **`price >= 0` (Decision Log #4 — chỉ validate ngưỡng, không tính lại giá trị).**
5. **Conflict check (Decision Log #1 — APPROVED, scope = `teacher_id`):** tìm session khác của
   cùng `teacher_id`, cùng `date`, `deleted_at IS NULL`, khoảng giờ giao nhau với
   `[start_time, end_time)` mới — bất kể `class_id`/`student_id` có trùng hay không.
   - Nếu conflict → `wp_send_json_error` status `409`, body `{message, conflict:{id, date,
     start_time, end_time, session_name}}` (snake_case).
6. Qua hết validate: `START TRANSACTION` → INSERT `sessions` → lấy `insert_id` → loop INSERT
   `session_students` (`fee_amount=NULL` mỗi dòng) → `COMMIT`.
7. `wp_send_json_success` trả `{ id: <session_id mới>, message: '...' }`.

> Comment boundary bắt buộc trong code (không đổi so với v2):
> ```
> // M2: hinteach_session_save — CHỈ xử lý CREATE (không có session_id trong payload).
> // Nhánh UPDATE (session_id có giá trị) CHƯA implement — để dành M4, hiện tại phải
> // wp_send_json_error nếu nhận được session_id, KHÔNG được âm thầm bỏ qua.
> ```

## 8. Validation rules — bản FINAL

| Field | Rule | Trạng thái |
|---|---|---|
| `class_id` | Tồn tại, `deleted_at IS NULL`, thuộc `teacher_id` hiện tại | Không đổi |
| `date` | Format `YYYY-MM-DD` hợp lệ | Không đổi |
| `start_time`/`end_time` | Format `HH:MM`, `start < end` | Không đổi |
| `type` | ∈ {`riêng`,`chung`} | Không đổi |
| `student_ids` | **`riêng` = đúng 1; `chung` ≥ 2** (đổi từ ≥1 → ≥2 theo Decision Log #3); tất cả thuộc `class_id` | **Đã khoá** |
| `price` | Số, `>= 0`. **Nguồn giá trị = client gửi, backend không tự tính (Decision Log #4)** | **Đã khoá** |
| Conflict giờ | Chặn cứng, 409, **scope = `teacher_id`** (Decision Log #1) | **Đã khoá** |
| `display_color` | Nếu có, phải là hex hợp lệ (`sanitize_hex_color`); rỗng → lưu `NULL` | Không đổi |
| Assistant `scheduler` | **Được phép tạo buổi nếu module bật (Decision Log #2)** | **Đã khoá** |

## 9. Test cases — cập nhật FINAL

- [ ] Tạo buổi `riêng` hợp lệ → thành công, 1 row `sessions`, 1 row `session_students`
      (`fee_amount=NULL`).
- [ ] Tạo buổi `chung` với 2 học sinh → thành công (biên dưới hợp lệ theo Decision Log #3).
- [ ] Tạo buổi `chung` với 3 học sinh → thành công.
- [ ] Tạo buổi `chung` với **1 học sinh** → **lỗi 400** (khác v2 — trước đây dự kiến cho phép).
- [ ] Tạo buổi `chung` với `student_ids` rỗng → lỗi 400.
- [ ] Tạo buổi `riêng` với 2 `student_ids` → lỗi 400.
- [ ] `student_id` không thuộc `class_id` → lỗi 400.
- [ ] `class_id` thuộc giáo viên khác → lỗi 403.
- [ ] `end_time <= start_time` → lỗi 400.
- [ ] Tạo buổi trùng giờ **với buổi khác cùng `teacher_id`, khác `class_id`** → vẫn 409 (test này
      xác nhận scope là `teacher_id`, không phải `class_id`/`student_id`).
- [ ] Tạo buổi trùng giờ nhưng khác `teacher_id` → **không** conflict, tạo thành công.
- [ ] `price` gửi lên bằng đúng giá trị đã tính sẵn ở frontend → backend lưu y nguyên, không đổi.
- [ ] `price` âm → lỗi 400.
- [ ] `display_color` gửi chuỗi rỗng → DB lưu `NULL`.
- [ ] **Assistant có quyền `scheduler` bật → tạo được buổi (không còn điều kiện "nếu quyết định
      chốt là có" — đã chốt, test này giờ là required, không phải optional).**
- [ ] Assistant có quyền `scheduler` tắt → 403.
- [ ] Chưa đăng nhập → 401.
- [ ] Sau khi tạo thành công, calendar M1 hiển thị đúng buổi mới, không cần sửa
      `hinteach_session_list`.

## 10. Commit strategy

Không đổi so với v2 (5 commit tách theo layer). Thêm 1 dòng note: commit đầu tiên
(`feat: add hinteach_session_save ...`) nên nhắc trong message rằng 4 decision (#1–#4) đã được
owner approve trước khi code, không phải tự chọn trong lúc implement — để log lịch sử rõ ràng.

---

# Tổng hợp — trạng thái sau v3

Tất cả các điểm trước đây `NEED OWNER DECISION` đã được owner chốt (2026-08-29):

1. Conflict detection scope → **`teacher_id`** — Decision Log #1, `APPROVED`.
2. Assistant `scheduler` → **được phép ghi (tạo buổi)** — Decision Log #2, `APPROVED`.
3. `type='chung'` → **bắt buộc ≥ 2 học sinh** — Decision Log #3, `APPROVED`.
4. Nguồn giá trị `price` → **nhận từ client, backend chỉ validate `>=0`** — Decision Log #4,
   `APPROVED`.

**Không còn mục nào chặn implementation.** File này là bản FINAL cho M2 — có thể bắt đầu code
theo đúng Phase 5, không cần dừng lại hỏi thêm cho 4 mục trên trong quá trình implement.

Việc còn lại (không chặn code, chỉ cần review trước khi merge): câu chữ message lỗi validate cụ
thể — HinTeach tự viết, không có HAR đối chiếu, chỉ ảnh hưởng UX text, không ảnh hưởng business
logic/data.