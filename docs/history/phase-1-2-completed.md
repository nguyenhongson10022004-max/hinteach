<!-- ═══════════════════════════════════════════════════════════ -->
<!-- HISTORICAL / COMPLETED                                    -->
<!-- DO NOT IMPLEMENT AGAIN                                    -->
<!-- Tài liệu lịch sử — chỉ dùng để hiểu quá khứ.           -->
<!-- Nếu mâu thuẫn với code hiện tại → code hiện tại thắng.   -->
<!-- ═══════════════════════════════════════════════════════════ -->

# Giai đoạn 1 + 2 — Scaffold + Lớp học & Học sinh (COMPLETED)

> Hoàn thành: 2026-08-23 ~ 2026-08-24
> Commits: `5bf4f86` (checkpoint GĐ1+2) → `35856d4` (fix import + xóa)

---

## Tổng quan

Antigravity (Claude Opus 4.6) đã tạo xong ~4200 dòng code theo IMPLEMENTATION_PLAN ban đầu, đã test bằng tay và chạy được thật trên LocalWP.

---

## Danh sách file đã tạo và trạng thái tại thời điểm hoàn thành

| File | Trạng thái |
|---|---|
| `hinteach.php` | ✅ Activation hook, enqueue có điều kiện, dọn hook WP thừa |
| `includes/db-schema.php` | ✅ 12 bảng, đã kiểm tra bằng Adminer |
| `includes/roles-capabilities.php` | ✅ 3 role, `hinteach_user_can_module()` chạy đúng |
| `includes/shortcodes.php` | ✅ Render shell 6 tab theo role, chặn đúng người không có quyền |
| `includes/ajax-classes.php` | ✅ CRUD lớp, 4 lớp bảo vệ (nonce → module permission → teacher_id → capability) |
| `includes/ajax-students.php` | ✅ CRUD học sinh + import + duplicate check (fix phiên 2026-08-24) |
| `includes/helpers/file-parser.php` | ⚠️ Có code + `hinteach_normalize_date()`, CHƯA test import thật |
| `assets/dashboard-core.js` + `dashboard-shell.js` | ✅ Router, lazy-load, modal — đã fix confirm dialog |
| `assets/modules/classes.js` | ✅ CRUD lớp qua UI |
| `assets/modules/students.js` | ✅ CRUD học sinh + import — đã fix button stuck |
| `build.mjs` + `package.json` | ✅ esbuild, `npm run build` → `assets/dist/` |

---

## Kiến trúc đã xây

### Plugin core (`hinteach.php`)
- Constants: `HINTEACH_VERSION`, `HINTEACH_PATH`, `HINTEACH_URL`, `HINTEACH_DB_VERSION`
- `register_activation_hook` → `hinteach_activate()`: dbDelta + tạo roles + update version option
- Enqueue assets có điều kiện (chỉ trang có shortcode `[hinteach_dashboard]`)
- Dọn hook WP thừa trên trang dashboard

### Database (12 bảng, dbDelta)
| Bảng | Index chính |
|---|---|
| `wp_hinteach_classes` | `teacher_id`, `billing_mode` |
| `wp_hinteach_students` | (pk) |
| `wp_hinteach_student_user_map` | `student_id`, `user_id` |
| `wp_hinteach_student_class` | `student_id`, `class_id` (composite unique) |
| `wp_hinteach_sessions` | `class_id`, `date`, `repeat_group_id` |
| `wp_hinteach_session_students` | `session_id`, `student_id` |
| `wp_hinteach_billing_payments` | `student_id`, `class_id`, `period_key` |
| `wp_hinteach_payments` | `student_id`, `class_id`, `session_id` |
| `wp_hinteach_tuition_adjustments` | `class_id`, `student_id` |
| `wp_hinteach_grades` | `student_id`, `class_id` |
| `wp_hinteach_assistant_permissions` | `assistant_user_id`, `module_key` |
| `wp_hinteach_license` | `user_id` |

Mọi bảng có `id BIGINT UNSIGNED AUTO_INCREMENT`, `created_at`, `updated_at`, `deleted_at`.

### Roles & Capabilities
- `hinteach_admin` → `manage_hinteach_all`, `manage_hinteach_classes`, `read`
- `hinteach_teacher` → `manage_hinteach_classes`, `read`
- `hinteach_assistant` → `read` (quyền chi tiết tra bảng `assistant_permissions`)
- Helper: `hinteach_user_can_module($user_id, $module_key)`

### Frontend
- Namespace `HT`: `HT.api.call()`, `HT.state`, `HT.router`, `HT.events`, `HT.modal`
- Shortcode `[hinteach_dashboard]` → output `HT_Config` JS object (nonce, ajaxurl, currentUser, currentRole, assistantPermissions)
- Lazy-load modules qua `import()` động
- Vanilla JS, không jQuery

### AJAX Endpoints (GĐ2)
| Action | File |
|---|---|
| `hinteach_class_list`, `_get`, `_save`, `_delete` | `ajax-classes.php` |
| `hinteach_student_list`, `_get`, `_save`, `_delete`, `_import`, `_class_add`, `_class_remove` | `ajax-students.php` |

### Quyết định thiết kế chưa nối logic (còn `// TODO`)
1. `surcharge_name`/`surcharge_amount` khi tạo lớp → lưu vào DB nhưng chưa tự sinh `tuition_adjustment` record.
2. `schedule_type='fixed'` + `fixed_weekdays` → lưu vào DB nhưng chưa tự sinh buổi học lặp.

---

## 8 Bug đã fix

### Phiên 2026-08-23

1. **Sai tên file module lazy-load**: `dashboard-core.js` ghép URL `${tabName}.min.js` nhưng `build.mjs` xuất file không có đuôi `.min`.
   - **Nguyên nhân**: config esbuild thiếu `entryNames`.
   - **Fix**: thêm `entryNames: '[name].min'` vào `modulesConfig` trong `build.mjs`.

2. **Tab mặc định trỏ vào module chưa tồn tại**: tab "Tổng quan" (`key='dashboard'`) không có module JS.
   - **Fix**: comment out tab "Tổng quan" trong `hinteach_get_tabs_for_role()` (`shortcodes.php`), kèm `// TODO`. Tab mặc định giờ là "Lớp học".

### Phiên 2026-08-24

3. **Bug ngày sinh khi import (dob → 0000-00-00)**: cột `dob` khi import không validate format. MySQL âm thầm lưu `0000-00-00`.
   - **Nguyên nhân**: thiếu normalize trước khi insert.
   - **Fix**: thêm `hinteach_normalize_date($value)` trong `file-parser.php` dùng `regex + checkdate()`. Nếu không parse được → bỏ qua dòng với lỗi rõ ràng, KHÔNG insert `0000-00-00`. Dùng cả trong `hinteach_ajax_student_save()`.

4. **Import trùng lặp học sinh**: import file có tên + SĐT trùng → tạo bản ghi trùng.
   - **Fix**: check trùng trước insert. Có SĐT → check `name + phone`; không có SĐT nhưng có dob → fallback `name + dob`; không cả 2 → không chặn. Response JSON kèm trường `duplicated`.

5. **Nút "Xoá" không hoạt động**: `HT.modal.confirm()` — `close()` gọi `onClose()` → `resolve(false)` chạy trước `resolve(true)`. Promise chỉ nhận resolve đầu tiên nên LUÔN trả `false`.
   - **Fix**: thêm cờ `let resolved = false`; nút OK/Cancel set `resolved = true` trước `close()`; `onClose` kiểm tra cờ.

6. **Import button kẹt ở "Đang import..."**: `submitImport()` chỉ reset nút trong `catch`, nhánh `try` không reset.
   - **Fix**: chuyển reset vào khối `finally`.

7. **`hinteach_normalize_date()` từ chối oan ngày không đệm 0**: `DateTime::createFromFormat()` → `$dt->format($fmt) === $value` — PHP luôn xuất đệm 0, input không đệm 0 không khớp.
   - **Fix**: thay toàn bộ bằng `regex + checkdate()`, chấp nhận `\d{1,2}`. Bỏ `m/d/Y` (kiểu US) — chỉ hỗ trợ VN (`d/m/Y`) và ISO (`Y-m-d`).

8. **Học sinh không có SĐT: import lặp không giới hạn**: check trùng cũ chỉ chạy `if ($phone)` → thiếu SĐT bỏ qua hoàn toàn.
   - **Fix**: thêm `elseif ($dob)` fallback check `name + dob`. Không có cả SĐT lẫn dob → không chặn.

---

## Test đã chạy (bằng tay, qua UI thật)

- [x] Tạo lớp `session` ("Nguyễn Hồng Sơn", 500.000đ/buổi, lịch linh hoạt)
- [x] Thêm học sinh mới
- [x] Sửa lớp → gán học sinh vào lớp → cột "Học sinh" tăng đúng
- [x] Validate lớp `course` thiếu ngày → bị chặn đúng
- [x] Phân quyền: role "HinTeach Giáo viên" vào được trang, thấy đúng sidebar

## Test chưa chạy tại thời điểm hoàn thành GĐ2

- [ ] Tạo lớp `course` với đủ ngày
- [ ] Tạo lớp `monthly`
- [ ] Xoá lớp đang có học sinh (test bug #5)
- [ ] Xoá học sinh (test bug #5)
- [ ] Import file Excel/CSV/Word (cả case đúng + lỗi)
- [ ] Import với ngày sinh VN / không đệm 0 (test bug #3, #7)
- [ ] Import trùng (test bug #4, #6, #8)
- [ ] Role trợ giảng (chưa bật module → sidebar rỗng)
- [ ] Cách ly dữ liệu giữa 2 giáo viên

---

## Quyết định kiến trúc quan trọng đã chốt (tại thời điểm GĐ2)

1. **Giữ WordPress** — không đổi sang Laravel/stack khác.
2. **Site riêng biệt** — HinTeach chạy trên WP + domain + database riêng, không chung `hinlove.store`.
3. **Bản gốc suspended** — `nttclass.onrender.com` bị chủ sở hữu suspend, kế hoạch lấy HAR dừng vô thời hạn.
4. **Phụ thu tạo lớp → tự sinh adjustment** (quyết định tạm thời, chưa code).
5. **Fixed schedule → tự sinh buổi 3 tháng** (quyết định tạm thời, chưa code).
