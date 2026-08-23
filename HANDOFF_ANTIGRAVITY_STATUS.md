# HINTEACH — TÌNH TRẠNG CODE ANTIGRAVITY (2026-08-24)
> File handoff để AI agent khác (hoặc chính Antigravity phiên mới) đọc và tiếp tục đúng chỗ đang dừng.
> Dùng cùng bộ: `CLAUDE.md` (root+includes+assets), `IMPLEMENTATION_PLAN.md`, 4 `AI_TASK_BUILD_*.md`.
> Copy file này vào thư mục gốc `HinTeach/` để nó luôn đi cùng project.

---

## ĐÃ CODE — Giai đoạn 1 (Scaffold) + Giai đoạn 2 (Lớp học & Học sinh)

Antigravity (model Claude Opus 4.6) đã tạo xong theo đúng `IMPLEMENTATION_PLAN.md`, khoảng 4200 dòng code, **đã test bằng tay và chạy được thật** trên môi trường local (xem phần Environment bên dưới):

| File | Trạng thái |
|---|---|
| `hinteach.php` | ✅ Hoạt động — activation hook, enqueue có điều kiện, dọn hook WP thừa |
| `includes/db-schema.php` | ✅ Đủ 12 bảng, đã kiểm tra bằng Adminer |
| `includes/roles-capabilities.php` | ✅ Đủ 3 role (HinTeach Admin/Giáo viên/Trợ giảng), `hinteach_user_can_module()` chạy đúng |
| `includes/shortcodes.php` | ✅ Render đúng shell 6 tab theo role, chặn đúng người không có quyền |
| `includes/ajax-classes.php` | ✅ Đã test tạo lớp (session/course), sửa lớp, gán học sinh, validate course thiếu ngày — **đã review code, đủ 4 lớp bảo vệ (nonce → module permission → teacher_id → capability)** |
| `includes/ajax-students.php` | ✅ Đã test thêm học sinh thành công — đã fix bug dob import + thêm duplicate check (phiên 2026-08-24) |
| `includes/helpers/file-parser.php` | ⚠️ Có code + thêm `hinteach_normalize_date()` (phiên 2026-08-24), **CHƯA test thật** (chưa thử Import file Excel/CSV/Word) |
| `assets/dashboard-core.js` + `dashboard-shell.js` | ✅ Router, lazy-load module, modal system — đã fix bug confirm dialog (phiên 2026-08-24) |
| `assets/modules/classes.js` | ✅ Đã test tạo/sửa lớp thành công qua UI thật |
| `assets/modules/students.js` | ✅ Đã test thêm học sinh — đã fix bug import button stuck (phiên 2026-08-24) |
| `build.mjs` + `package.json` | ✅ Build chạy được (`npm run build` → `assets/dist/`) |

**CHƯA CODE (đúng phạm vi, không phải thiếu sót):** Giai đoạn 3 (Thời khoá biểu), Giai đoạn 4 (Học phí), Giai đoạn 5 (Điểm số/Nhật ký), Giai đoạn 6 (Tài khoản/License), toàn bộ quiz-engine (hoãn).

---

## 8 BUG ĐÃ TÌM RA VÀ ĐÃ FIX

### Phiên 2026-08-23 (Claude review code + Antigravity sửa)

1. **Sai tên file module lazy-load**: `dashboard-core.js` ghép URL dạng `${tabName}.min.js` nhưng `build.mjs` xuất file không có đuôi `.min`. → Đã fix: thêm `entryNames: '[name].min'` vào `modulesConfig` trong `build.mjs`.
2. **Tab mặc định trỏ vào module chưa tồn tại**: tab "Tổng quan" (`key='dashboard'`) không có module JS tương ứng (ngoài phạm vi Giai đoạn 1+2) → mở trang lần đầu luôn lỗi. → Đã fix: comment out tab "Tổng quan" trong `hinteach_get_tabs_for_role()` (`shortcodes.php`), kèm `// TODO`, tab mặc định giờ là "Lớp học".

### Phiên 2026-08-24 (Antigravity — Claude Opus 4.6)

3. **Bug ngày sinh khi import (dob → 0000-00-00)**: Cột `dob` khi import không được validate/chuẩn hoá định dạng. Khi giá trị không đúng `YYYY-MM-DD` (VD nhập `12/05/2010` kiểu VN), MySQL âm thầm lưu thành `0000-00-00`. → **Đã fix**: thêm hàm `hinteach_normalize_date($value)` vào `includes/helpers/file-parser.php`, dùng `regex + checkdate()` (xem bug #7 bên dưới cho lý do không dùng `DateTime::createFromFormat`). Nếu không parse được → dòng bị bỏ qua hoàn toàn với lỗi rõ ràng, **KHÔNG insert `0000-00-00`**. Hàm cũng được dùng trong `hinteach_ajax_student_save()` (form thủ công) để nhất quán.
4. **Import trùng lặp học sinh**: Khi import file có tên + SĐT trùng với học sinh đã tồn tại của cùng giáo viên, hệ thống tạo bản ghi trùng. → **Đã fix**: thêm kiểm tra trùng trước khi insert. Có SĐT → check `name + phone`; không có SĐT nhưng có dob → fallback check `name + dob`; không có cả 2 → không chặn (xem bug #8 bên dưới). Response JSON kèm trường `duplicated`.
5. **Nút "Xoá" (học sinh VÀ lớp) không hoạt động**: `HT.modal.confirm()` trong `dashboard-core.js` gọi `this.close()` trước `resolve(true)`, nhưng `close()` gọi `onClose()` → `resolve(false)` chạy trước. Promise chỉ nhận resolve đầu tiên nên LUÔN trả `false` dù bấm "Xác nhận". → **Đã fix**: thêm cờ `let resolved = false` trong Promise executor; nút OK/Cancel set `resolved = true` trước khi `close()`; `onClose` kiểm tra cờ và chỉ resolve nếu chưa resolved.
6. **Import học sinh có dòng trùng: nút bị kẹt ở "Đang import..."**: Trong `submitImport()` (`students.js`), đoạn reset nút submit (`disabled = false`, `textContent = 'Import'`) chỉ nằm trong `catch` — nhánh `try` (thành công) không reset. → **Đã fix**: chuyển `submitBtn` ra ngoài `try`, đặt reset vào khối `finally` để LUÔN chạy dù thành công hay lỗi.
7. **`hinteach_normalize_date()` từ chối oan ngày hợp lệ không đệm số 0**: Hàm cũ dùng `DateTime::createFromFormat()` rồi so sánh chuỗi `$dt->format($fmt) === $value` để chống rollover. Nhưng PHP luôn xuất bản đệm 0 ("15/01/2012") → input không đệm 0 ("15/1/2012") không bao giờ khớp → trả null oan. → **Đã fix**: thay toàn bộ bằng `regex + checkdate()`, chấp nhận `\d{1,2}` cho ngày/tháng. Đồng thời bỏ `m/d/Y` (kiểu US) để tránh hiểu nhầm ngầm d/m vs m/d — sản phẩm chỉ hỗ trợ VN (d/m/Y) và ISO (Y-m-d).
8. **Học sinh không có SĐT: import lặp không giới hạn**: Đoạn check trùng cũ chỉ chạy `if ($phone)` → học sinh thiếu SĐT bỏ qua hoàn toàn bước check → import lại bao nhiêu lần cũng tạo thêm bấy nhiêu bản ghi. → **Đã fix**: thêm `elseif ($dob)` fallback check theo `name + dob` khi không có SĐT. Nếu không có cả SĐT lẫn dob → không chặn (tránh chặn oan 2 học sinh trùng tên thật, để giáo viên tự xử lý).

---

## ⚠️ BUG CÒN TỒN ĐỌNG — CHƯA FIX

Không có bug tồn đọng đã xác định tại thời điểm này. Bug hiển thị message AJAX đã được fix (code `HT.api.call()` hiện đọc đúng `errJson?.data?.message` từ `wp_send_json_error`).

---

## QUYẾT ĐỊNH KIẾN TRÚC QUAN TRỌNG ĐÃ CHỐT (đọc kỹ trước khi code tiếp)

1. **Server gốc `nttclass.onrender.com` đã bị chủ sở hữu SUSPENDED** (thông báo "This service has been suspended by its owner") — không rõ có mở lại hay không, không nên chờ. Toàn bộ kế hoạch lấy HAR thật (Nhóm 1, 2, 3, 5) đã **dừng vô thời hạn**, không phải đã hoàn thành.
2. **2 câu hỏi Nhóm 4 đã được quyết định TẠM THỜI** (không dựa trên quan sát bản gốc, vì không truy cập được nữa):
   - Phụ thu lúc tạo lớp → sẽ tự sinh 1 record `tuition_adjustments` scope=class.
   - `schedule_type=fixed` → sẽ tự sinh buổi học 3 tháng tới kể từ ngày tạo lớp (dùng thuật toán `generateRepeatDates` weekly có sẵn trong `AI_TASK_BUILD_SCHEDULE.md`).
   - **Cả 2 quyết định này CHƯA được code** (vẫn còn `// TODO` trong `ajax-classes.php`) — đây là việc đầu tiên cần làm khi bắt đầu Giai đoạn 4, hoặc sớm hơn nếu muốn.
3. **Kiến trúc giữ nguyên WordPress**, không đổi sang Laravel/stack khác — đã cân nhắc và quyết định giữ nguyên vì tận dụng được kinh nghiệm WP có sẵn từ dự án `thiep-builder` (Hinlove).
4. **Quyết định site độc lập**: HinTeach chạy trên WordPress + domain + database HOÀN TOÀN riêng biệt, không chung với `hinlove.store`.
5. **Chưa quyết định cuối cùng** về mô hình tài khoản học sinh (self vs parent-multi-child) — đã bàn sơ bộ (xem phần "Ý tưởng chưa chốt" bên dưới) nhưng **chưa đưa vào schema**, không phải việc cần làm ở giai đoạn hiện tại.

---

## MÔI TRƯỜNG DEV — QUAN TRỌNG, ĐỌC KỸ ĐỂ KHÔNG MẤT THỜI GIAN LẶP LẠI

- **Local WordPress**: chạy bằng LocalWP, tên site "hinteach", domain `hinteach.local`.
- **Symlink**: `C:\Users\nguye\Local Sites\hinteach\app\public\wp-content\plugins\hinteach` là **symlink** trỏ tới `C:\CLASS\HinTeach-CLAUDE-md\HinTeach` — sửa file ở 1 trong 2 chỗ đều có hiệu lực ngay lập tức ở cả 2 (đây là cùng 1 nơi vật lý). **Không copy tay qua lại nữa.**
- **File PHP**: sửa xong là có hiệu lực ngay, chỉ cần refresh trình duyệt.
- **File JS**: sửa xong **BẮT BUỘC** chạy `npm run build` trong Terminal (đứng đúng tại `C:\CLASS\HinTeach-CLAUDE-md\HinTeach`) rồi mới refresh (`Ctrl+Shift+R` để xoá cache trình duyệt) — nếu quên bước này, thay đổi JS sẽ KHÔNG có hiệu lực dù code đã sửa đúng.
- **Terminal trong Antigravity mặc định là PowerShell**, đã chạy `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` để cho phép chạy npm — không cần làm lại nếu dùng cùng máy.
- **Node.js đã cài** (bản LTS, `node -v` → v24.19.0).
- **Composer + PhpSpreadsheet**: đã chạy `composer require phpoffice/phpspreadsheet --ignore-platform-reqs` (phiên 2026-08-24) → cài thành công `phpoffice/phpspreadsheet` v5.9.0 + `phpoffice/phpword` v1.1.0. Thư mục `vendor/` đã thêm vào `.gitignore`. Để cài lại trên máy khác: `composer install --ignore-platform-reqs`.
- **Tài khoản test**: username `teacher_test` / role "HinTeach Giáo viên" — dùng để test giao diện giáo viên. Tài khoản admin gốc WP riêng (`sonskt2002`) vẫn còn, dùng khi cần vào `wp-admin` full quyền (tạo trang, sửa user khác...).
- **Trang chứa dashboard**: slug `dashboard` (`hinteach.local/dashboard/`), nội dung trang chỉ có `[hinteach_dashboard]`.
- **⚠️ CHƯA khởi tạo Git** cho project này — nên làm `git init` + commit checkpoint đầu tiên càng sớm càng tốt, hiện chưa có điểm lùi nếu code bị sửa hỏng.

---

## ĐÃ TEST THỦ CÔNG THÀNH CÔNG (bằng tay, qua UI thật)

- [x] Tạo lớp `session` ("Nguyễn Hồng Sơn", 500.000đ/buổi, lịch linh hoạt)
- [x] Thêm học sinh mới ("Nguyễn Hồng Sơn" — trùng tên với lớp, không phải lỗi, chỉ là data test)
- [x] Sửa lớp → gán học sinh vào lớp → cột "Học sinh" tăng đúng từ 0 lên 1
- [x] Validate lớp `course` thiếu ngày bắt đầu/kết thúc → bị chặn đúng (chỉ có bug hiển thị message, xem phần Bug tồn đọng)
- [x] Phân quyền: role "HinTeach Giáo viên" vào được trang, thấy đúng sidebar

## CHƯA TEST — LÀM TIẾP KHI QUAY LẠI

- [ ] Tạo lớp `course` với đủ ngày bắt đầu/kết thúc → lưu thành công, hiển thị đúng "Theo khoá"
- [ ] Tạo lớp `monthly` → UI ẩn đúng phần ngày tháng, chỉ hiện học phí/tháng
- [ ] Xoá lớp đang có học sinh → bấm "Xác nhận" → lớp bị xoá thành công (test bug #5 đã fix)
- [ ] Xoá học sinh → bấm "Xác nhận" → học sinh bị xoá thành công (test bug #5 đã fix)
- [ ] Import file học sinh (Excel/CSV/Word) — cả trường hợp đúng và trường hợp lỗi (>500 dòng, thiếu cột bắt buộc)
- [ ] Import file với ngày sinh định dạng VN (`12/05/2010`) → xác nhận lưu đúng `2010-05-12`
- [ ] Import file với ngày sinh KHÔNG đệm 0 (`5/1/2012`) → xác nhận lưu đúng `2012-01-05` (test bug #7)
- [ ] Import file có dòng trùng (tên + SĐT) với học sinh đã có → xác nhận bỏ qua + báo "đã tồn tại" + nút Import reset (test bug #6)
- [ ] Import file có dòng trùng (tên + ngày sinh, KHÔNG có SĐT) → xác nhận bỏ qua + báo "đã tồn tại" (test bug #8)
- [ ] Import file có dòng KHÔNG có SĐT VÀ KHÔNG có dob → xác nhận vẫn import bình thường (không chặn oan)
- [ ] Import file có dòng ngày sinh sai hoàn toàn (VD "abc", "32/13/2010") → xác nhận bỏ qua + báo lỗi rõ ràng
- [ ] Test với role "HinTeach Trợ giảng" (chưa bật bất kỳ module nào) → xác nhận sidebar rỗng đúng
- [ ] Giáo viên A tạo tài khoản `teacher_test`, thử tạo thêm 1 tài khoản giáo viên B khác → xác nhận A không thấy dữ liệu của B

---

## THỨ TỰ ĐỀ XUẤT KHI QUAY LẠI

1. **`npm run build`** — BẮT BUỘC sau khi sửa JS (bug #5, #6) trước khi test.
2. Hoàn tất checklist "CHƯA TEST" ở trên cho Giai đoạn 1+2 (đặc biệt: xoá học sinh, xoá lớp, import trùng).
3. `git init` + commit checkpoint (nếu chưa làm).
4. Bắt đầu Giai đoạn 3 (Thời khoá biểu) — đọc `AI_TASK_BUILD_SCHEDULE.md` trước khi giao Antigravity, nhớ áp dụng quyết định "tự sinh buổi 3 tháng" cho `schedule_type=fixed` đã chốt tạm thời ở trên.
5. Giai đoạn 4 (Học phí) — code luôn phần "tự sinh `tuition_adjustments`" đã chốt tạm thời, xoá 2 dòng `// TODO` trong `ajax-classes.php`.
6. Giai đoạn 5, 6 theo đúng thứ tự trong `CLAUDE.md`.

---

## Ý TƯỞNG CHƯA CHỐT (bàn để tham khảo sau, KHÔNG code bây giờ)

- Tài khoản học sinh tương lai (module bài tập, hiện đang deferred ở `modules/quiz-engine-DEFERRED/`): đề xuất thêm cột `wp_user_id` (nullable) + `account_owner_type` ENUM(`none`,`self`,`parent`) vào `wp_hinteach_students` — cho phép học sinh cấp 2/3 tự có tài khoản, học sinh cấp 1 dùng chung tài khoản phụ huynh (1 phụ huynh — nhiều con, kiểu chọn hồ sơ). Cơ chế đăng nhập nên tái dùng pattern magic-link từ `modules/guest-link/tb-guest-link.php` của `thiep-builder` (Hinlove). **Chưa đưa vào schema**, chỉ ghi lại ý tưởng.
