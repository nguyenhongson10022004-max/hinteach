# Current Project Status

> Cập nhật: 2026-08-27 — xác minh từ code/git thật, không phải từ tài liệu cũ.
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
**Status: ❌ NOT STARTED**

Chưa có: `includes/ajax-schedule.php`, `assets/modules/schedule.js`
Spec: `docs/specs/schedule.md`

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
- 2026-08-27: Tái cấu trúc toàn bộ tài liệu Markdown (xem `docs/history/phase-1-2-completed.md`).
- 2026-08-24: Fix 6 bug (import dob, duplicate check, confirm dialog, import button stuck, normalize_date, no-phone import). Commit `35856d4`.
- 2026-08-23: Hoàn thành GĐ1+2, commit checkpoint `5bf4f86`. Init Git repo.

---

## Next Recommended Task
1. Hoàn tất checklist test chưa chạy cho GĐ2 (đặc biệt: xóa lớp/học sinh, import file, role trợ giảng).
2. Bắt đầu GĐ3 (Thời khoá biểu) — đọc `docs/specs/schedule.md` trước khi code.
