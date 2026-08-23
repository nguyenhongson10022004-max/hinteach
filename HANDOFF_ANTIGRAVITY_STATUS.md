# HINTEACH — TÌNH TRẠNG CODE ANTIGRAVITY (2026-08-23)
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
| `includes/ajax-students.php` | ✅ Đã test thêm học sinh thành công |
| `includes/helpers/file-parser.php` | ⚠️ Có code, **CHƯA test thật** (chưa thử Import file Excel/CSV/Word) |
| `assets/dashboard-core.js` + `dashboard-shell.js` | ✅ Router, lazy-load module, modal system — chạy ổn sau khi fix bug (xem phần Bug đã fix) |
| `assets/modules/classes.js` | ✅ Đã test tạo/sửa lớp thành công qua UI thật |
| `assets/modules/students.js` | ✅ Đã test thêm học sinh thành công qua UI thật |
| `build.mjs` + `package.json` | ✅ Build chạy được (`npm run build` → `assets/dist/`) |

**CHƯA CODE (đúng phạm vi, không phải thiếu sót):** Giai đoạn 3 (Thời khoá biểu), Giai đoạn 4 (Học phí), Giai đoạn 5 (Điểm số/Nhật ký), Giai đoạn 6 (Tài khoản/License), toàn bộ quiz-engine (hoãn).

---

## 2 BUG ĐÃ TÌM RA VÀ ĐÃ FIX (bởi Claude review code + Antigravity sửa)

1. **Sai tên file module lazy-load**: `dashboard-core.js` ghép URL dạng `${tabName}.min.js` nhưng `build.mjs` xuất file không có đuôi `.min`. → Đã fix: thêm `entryNames: '[name].min'` vào `modulesConfig` trong `build.mjs`.
2. **Tab mặc định trỏ vào module chưa tồn tại**: tab "Tổng quan" (`key='dashboard'`) không có module JS tương ứng (ngoài phạm vi Giai đoạn 1+2) → mở trang lần đầu luôn lỗi. → Đã fix: comment out tab "Tổng quan" trong `hinteach_get_tabs_for_role()` (`shortcodes.php`), kèm `// TODO`, tab mặc định giờ là "Lớp học".

---

## ⚠️ 1 BUG NHỎ CÒN TỒN ĐỌNG — CHƯA FIX

**Lỗi hiển thị thông báo AJAX**: khi backend trả lỗi (`wp_send_json_error`), frontend chỉ hiện `HTTP 400: Bad Request` chung chung thay vì đọc đúng `response.data.message` (VD lẽ ra phải hiện "Chế độ khóa học yêu cầu ngày bắt đầu và kết thúc."). Không chặn tiến độ, nhưng nên fix trước khi làm Giai đoạn 3, vì lỗi này sẽ lặp lại ở mọi module sau. Sửa ở phần xử lý lỗi trong `HT.api.call()` (`dashboard-core.js`).

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
- [ ] Xoá lớp đang có học sinh → có cảnh báo/xác nhận đúng spec không
- [ ] Import file học sinh (Excel/CSV/Word) — cả trường hợp đúng và trường hợp lỗi (>500 dòng, thiếu cột bắt buộc)
- [ ] Test với role "HinTeach Trợ giảng" (chưa bật bất kỳ module nào) → xác nhận sidebar rỗng đúng
- [ ] Giáo viên A tạo tài khoản `teacher_test`, thử tạo thêm 1 tài khoản giáo viên B khác → xác nhận A không thấy dữ liệu của B

---

## THỨ TỰ ĐỀ XUẤT KHI QUAY LẠI

1. Fix bug hiển thị message lỗi AJAX (nhỏ, nhanh) — làm trước khi qua giai đoạn mới để không lặp lại lỗi này ở mọi module sau.
2. Hoàn tất checklist "CHƯA TEST" ở trên cho Giai đoạn 1+2.
3. `git init` + commit checkpoint (nếu chưa làm).
4. Bắt đầu Giai đoạn 3 (Thời khoá biểu) — đọc `AI_TASK_BUILD_SCHEDULE.md` trước khi giao Antigravity, nhớ áp dụng quyết định "tự sinh buổi 3 tháng" cho `schedule_type=fixed` đã chốt tạm thời ở trên.
5. Giai đoạn 4 (Học phí) — code luôn phần "tự sinh `tuition_adjustments`" đã chốt tạm thời, xoá 2 dòng `// TODO` trong `ajax-classes.php`.
6. Giai đoạn 5, 6 theo đúng thứ tự trong `CLAUDE.md`.

---

## Ý TƯỞNG CHƯA CHỐT (bàn để tham khảo sau, KHÔNG code bây giờ)

- Tài khoản học sinh tương lai (module bài tập, hiện đang deferred ở `modules/quiz-engine-DEFERRED/`): đề xuất thêm cột `wp_user_id` (nullable) + `account_owner_type` ENUM(`none`,`self`,`parent`) vào `wp_hinteach_students` — cho phép học sinh cấp 2/3 tự có tài khoản, học sinh cấp 1 dùng chung tài khoản phụ huynh (1 phụ huynh — nhiều con, kiểu chọn hồ sơ). Cơ chế đăng nhập nên tái dùng pattern magic-link từ `modules/guest-link/tb-guest-link.php` của `thiep-builder` (Hinlove). **Chưa đưa vào schema**, chỉ ghi lại ý tưởng.
