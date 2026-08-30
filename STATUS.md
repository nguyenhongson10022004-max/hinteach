# Current Project Status

> Cập nhật: 2026-08-31 — xác minh từ code/git thật, không phải từ tài liệu cũ.

> Source of truth thứ 2 (sau code + git log). Xem `CLAUDE.md` cho thứ tự ưu tiên.

---

## GĐ1 — Scaffold

**Status: ✅ COMPLETED** (commit `5bf4f86`, 2026-08-23)

Đã hoàn thành:

- `hinteach.php` — activation hook, enqueue có điều kiện, dọn hook WP thừa

- `includes/db-schema.php` — 12 bảng, đã kiểm tra bằng Adminer

- `includes/roles-capabilities.php` — 3 role (HinTeach Admin/Giáo viên/Trợ giảng), `hinteach_user_can_module()`

- `includes/shortcodes.php` — render shell 6 tab theo role

- `build.mjs` + `package.json` — esbuild, `npm run build` → `assets/dist/`

---

## GĐ2 — Students & Classes

**Status: ✅ COMPLETED** (commits `5bf4f86` → `35856d4`, 2026-08-23~24)

Đã hoàn thành:

- `includes/ajax-classes.php` (354 dòng) — CRUD lớp học, 3 billing_mode, validate

- `includes/ajax-students.php` (494 dòng) — CRUD học sinh, import file, duplicate check

- `assets/modules/classes.js` (329 dòng) — UI lớp học

- `assets/modules/students.js` (349 dòng) — UI học sinh + import

- `assets/dashboard-core.js` — router, lazy-load, modal, API client

- `assets/dashboard-shell.js` — sidebar, topbar

- `includes/helpers/file-parser.php` — import Excel/CSV/Word (dùng PhpSpreadsheet + PhpWord)

- 8 bug đã fix (xem `docs/history/phase-1-2-completed.md` chi tiết)

Chưa test:

- Import file thật (Excel/CSV/Word) — code có nhưng chưa test end-to-end

- Xóa lớp/học sinh qua UI (bug confirm dialog đã fix, chưa verify)

- Tạo lớp `course`/`monthly` đầy đủ

- Role trợ giảng chặn đúng module

- Cách ly dữ liệu giữa 2 giáo viên

---

## GĐ3 — Schedule

**Status: 🟡 M5 COMPLETED**

Đã hoàn thành:

- M1 — Calendar Shell + Session List (READ ONLY) ✅
- M2 — Create Single Session ✅
- M3 — Recurrence / Repeat Session ✅
- M4 — Edit/Delete Recurrence ✅
- M5 — Quick Entry / Session Record / Score ✅

---

### M1 — Calendar Shell + Session List (READ ONLY)

Đã hoàn thành:

- `includes/ajax-schedule.php` (150 dòng)

  - Endpoint `wp_ajax_hinteach_session_list`

  - Validate `date_from/date_to`

  - Check nonce + module permission `scheduler`

  - Filter ownership theo `teacher_id`

  - SELECT-only, không INSERT/UPDATE/DELETE

- `assets/modules/schedule.js` (234 dòng)

  - Calendar tuần T2-CN

  - Điều hướng tuần trước/sau

  - Gọi API `hinteach_session_list`

  - Render session thật từ database

  - Không có create/edit/delete/recurrence/quick-entry

- `build.mjs`

  - Thêm entry point `assets/modules/schedule.js`

  - Build ra `assets/dist/modules/schedule.min.js`

Runtime test:

- ✅ Local WordPress chạy thành công

- ✅ AJAX endpoint trả session thật

- ✅ Session từ `wp_hinteach_sessions` hiển thị trên calendar

- ✅ Ownership test với `teacher_id` thực tế đã xác nhận

Database:

- M0B schema đã được áp dụng trên local database:

  - thêm `session_name`

  - thêm `general_comment`

Commit:

- `792e117` — feat: add read-only schedule calendar M1

---

### M2 — Create Single Session

**Status: ✅ COMPLETED** (commit `f625fa1`, 2026-08-29)

Phạm vi hoàn thành:

- Create single session
- Type:
  - `riêng`
  - `chung`
- Session ↔ student mapping
- Validation
- Conflict detection
- Calendar refresh

Đã triển khai:

- `includes/ajax-schedule.php`
  - thêm `hinteach_session_save`
  - create-only handler
  - validation class/date/time/type/student/price
  - conflict scope `teacher_id`
  - transaction insert `sessions` + `session_students`

- `assets/dashboard-core.js`
  - mở rộng `HT.api.call()`
  - giữ `error.message`
  - thêm structured error data

- `assets/modules/schedule.js`
  - modal tạo buổi
  - chọn lớp
  - load học sinh
  - tạo session
  - refresh calendar

Verification:

- ✅ Create riêng 1 học sinh
- ✅ Create chung >=2 học sinh
- ✅ Chặn chung 1 học sinh
- ✅ Conflict cùng teacher
- ✅ Khác teacher cùng giờ tạo được
- ✅ Display color lưu đúng
- ✅ Database mapping session/student đúng
- ✅ `npm run build` pass

History:

- `docs/history/gd3-m2-create-session-completed.md`

---

### M5 — Quick Entry / Session Record / Score

**Status: ✅ COMPLETED** (commit `40ce7cd`, 2026-08-31)

Phạm vi hoàn thành:

- Quick-entry session record
- Student journal update
- Score creation from session
- Score reload in edit modal

Đã triển khai:

Backend:

- `hinteach_session_quick_entry`
- Update session-level record:
  - content
  - homework_content
  - session_name
  - general_comment

- Update `wp_hinteach_session_students`:
  - homework
  - attitude
  - individual_comment
  - note

- Insert `wp_hinteach_grades`:
  - session_id
  - student_id
  - test_name
  - score
  - scale
  - type
  - score_type_label

Frontend:

- Edit modal mở rộng:
  - Nhật ký học tập
  - Điểm buổi học

- Thêm:
  - Lưu nhật ký
  - score group rendering
  - reload score khi mở lại modal

Database:

- `wp_hinteach_grades`
  - sử dụng `session_id` để liên kết điểm với buổi học
  - thêm `score_type_label` theo D3 Option B

Verification:

- ✅ Journal save/reload
- ✅ BTVN score mapping
- ✅ Custom score type mapping
- ✅ Null score handling
- ✅ Score zero handling
- ✅ Score validation
- ✅ Score reload after reopen modal
- ✅ M4 regression edit/delete

Commit:

- `40ce7cd` — feat: implement gd3 m5 quick entry

---

### GĐ3 — Commits

- `792e117` — feat: add read-only schedule calendar M1

- `f625fa1` — feat: implement gd3 m2 create session

- `6f17bd3` — docs: add gd3 m2 completion history

- `c018430` — feat: add recurring session creation

- `fc0a5fa` — docs: record gd3 m3 recurrence completion

- `add476f` — feat: implement gd3 m4 edit/delete recurrence backend

- `619f0e0` — feat: implement gd3 m4 edit/delete recurrence frontend

- `3246b99` — docs: record gd3 m4 edit/delete recurrence completion

- `40ce7cd` — feat: implement gd3 m5 quick entry

- `16cd068` — docs: record gd3 m5 quick entry completion
---

### GĐ3 — Completed

- M1 — Calendar Shell + Session List READ ONLY ✅

- M2 — Create Single Session ✅

- M3 — Recurrence / Repeat Session ✅

- M4 — Edit/Delete Recurrence ✅

- M5 — Quick Entry / Session Record / Score ✅

---

### GĐ3 — Còn lại

Chưa triển khai:

- M6 — Calendar Actions
- M7 — Calendar Interaction

---

## GĐ4 — Tuition

**Status: ❌ NOT STARTED**

Chưa có: `includes/ajax-tuition.php`, `assets/modules/tuition.js`, `includes/pdf-export.php`

Spec: `docs/specs/tuition.md`

---

## GĐ5 — Grades & Journal

**Status: ❌ NOT STARTED**

Chưa có: `includes/ajax-grades.php`, `assets/modules/grades.js`

Spec: `docs/specs/grades-journal.md`

---

## GĐ6 — Accounts & License

**Status: ❌ NOT STARTED**

Chưa có: `includes/admin/license.php`

Chưa có spec riêng — xem `CLAUDE.md` root phần phân quyền + `includes/CLAUDE.md` phần endpoint

---

## Deferred

- **Quiz engine** — giữ spec tại `modules/quiz-engine-DEFERRED/SPEC.md`, KHÔNG code cho tới khi được yêu cầu mở lại rõ ràng.

---

## Known Issues

Không có bug tồn đọng đã xác định tại thời điểm này.

---

## Known Limitations

- Domain gốc trước đây (`nttclass.onrender.com`) đã suspended, nhưng đã phát hiện domain mới đang chạy sống: `nttclass.com` (phát hiện 2026-08-27). Cần đăng nhập lấy HAR thật để đối chiếu spec — kế hoạch lấy HAR sẽ làm riêng, chưa bắt đầu.

- Tab "Tổng quan" (`key='dashboard'`) bị comment out vì chưa có module JS tương ứng — tab mặc định hiện là "Lớp học". Kèm `// TODO` trong `shortcodes.php`.

- `file-parser.php` có code + `hinteach_normalize_date()` nhưng CHƯA test import thật với file Excel/CSV/Word.

---

## Decisions Not Yet Implemented

1. **Phụ thu lúc tạo lớp → tự sinh `tuition_adjustments`**: quyết định TẠM THỜI — tạo lớp có phụ thu mặc định sẽ tự sinh 1 record `tuition_adjustments` scope=class. **CHƯA ĐƯỢC CODE** (còn `// TODO` trong `ajax-classes.php`).

2. **`schedule_type=fixed` → tự sinh buổi học**: quyết định TẠM THỜI — tự sinh buổi học 3 tháng tới kể từ ngày tạo lớp (dùng thuật toán `generateRepeatDates` weekly). **CHƯA ĐƯỢC CODE** (còn `// TODO` trong `ajax-classes.php`).

3. **Mô hình tài khoản học sinh** (self vs parent-multi-child): CHƯA CHỐT. Đề xuất thêm cột `wp_user_id` (nullable) + `account_owner_type` ENUM(`none`,`self`,`parent`) vào `wp_hinteach_students`. Chưa đưa vào schema, chỉ ghi lại ý tưởng. Liên quan quiz-engine (đang deferred).

4. **Phụ thu/giảm phí với `course`/`monthly`**: chưa xác nhận adjustment có cộng vào `fee_amount` cố định không, hay không hỗ trợ 2 mode này.

5. **Xuất phiếu hàng loạt — phân quyền**: UI bản gốc có class `admin-only` trên nút "Xuất hàng loạt" — chưa xác nhận có phải giới hạn quyền thật (chỉ admin xuất hàng loạt, giáo viên chỉ xuất từng phiếu).

---

## Latest Important Changes

- 2026-08-31: Hoàn thành GĐ3 M5 — Quick Entry / Session Record / Score. Commit `40ce7cd`.

- 2026-08-29: Hoàn thành GĐ3 M2 — Create Single Session. Commit `f625fa1`, history `6f17bd3`.

- 2026-08-28: Hoàn thành GĐ3 M1 — Calendar Shell + Session List READ ONLY. Commit `792e117`.

- 2026-08-27: Tái cấu trúc toàn bộ tài liệu Markdown (xem `docs/history/phase-1-2-completed.md`).

- 2026-08-24: Fix 6 bug (import dob, duplicate check, confirm dialog, import button stuck, normalize_date, no-phone import). Commit `35856d4`.

- 2026-08-23: Hoàn thành GĐ1+2, commit checkpoint `5bf4f86`. Init Git repo.

---

## Next Recommended Task

1. Hoàn tất đóng milestone GĐ3 M5:
   - push commits lên origin
   - tạo tag `gd3-m5-completed`

2. Chuẩn bị GĐ3 M6:
   - đọc HAR Calendar Actions
   - đọc bundle context menu
   - lập Decision Log
   - viết Implementation Plan trước khi code