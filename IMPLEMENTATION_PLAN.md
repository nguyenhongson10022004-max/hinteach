# HinTeach Plugin — Giai đoạn 1 + 2: Scaffold + Lớp học & Học sinh

## Mục tiêu
Dựng nền tảng plugin WordPress (`hinteach`) và hoàn thành CRUD Lớp học (3 billing_mode) + CRUD Học sinh (bao gồm import file). Áp dụng hiệu năng frontend/backend ngay từ đầu.

## Phạm vi

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Scaffold: `hinteach.php`, `db-schema.php`, roles, shortcode rỗng | **Sẽ làm** |
| 2 | Lớp học + Học sinh (CRUD, 3 billing_mode, phụ thu lúc tạo lớp, import file) | **Sẽ làm** |

## Quyết định thiết kế quan trọng

> [!IMPORTANT]
> **Những phần CHƯA nối logic tự động (đánh dấu `// TODO`):**
> 1. `surcharge_name` / `surcharge_amount` khi tạo lớp → lưu vào DB đúng schema, nhưng **chưa tự sinh `tuition_adjustment`** record → `// TODO: chờ xác nhận quan hệ surcharge_default ↔ tuition_adjustments`
> 2. `schedule_type='fixed'` + `fixed_weekdays` → lưu vào DB, nhưng **chưa tự sinh buổi học lặp** → `// TODO: chờ xác nhận logic tự sinh buổi từ lịch cố định`

> [!WARNING]
> **KHÔNG code** ở lần này: Học phí (GĐ4), Điểm số/Nhật ký (GĐ5), Tài khoản/License (GĐ6), Quiz-engine (HOÃN).

---

## Proposed Changes

### Component 1: Plugin Core (Scaffold)

#### [NEW] [hinteach.php](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/hinteach.php)
Main plugin file:
- Plugin header (Plugin Name, Version, Author, Text Domain)
- Define constants: `HINTEACH_VERSION`, `HINTEACH_PATH`, `HINTEACH_URL`, `HINTEACH_DB_VERSION`
- `register_activation_hook` → gọi `hinteach_activate()`:
  - Chạy `db-schema.php` (dbDelta tạo bảng)
  - Chạy `roles-capabilities.php` (tạo 3 role)
  - Update `hinteach_db_version` option
- `register_deactivation_hook` → remove roles (tuỳ chọn)
- Require tất cả includes files
- Enqueue assets **có điều kiện** (chỉ trang có shortcode `[hinteach_dashboard]`)
- Dọn hook WP thừa trên trang dashboard (wp_generator, rsd_link, emoji, etc.)

---

### Component 2: Database Schema

#### [NEW] [db-schema.php](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/includes/db-schema.php)
Dùng `dbDelta()` tạo **tất cả 12 bảng** cùng lúc (theo spec `includes/CLAUDE.md`):

| Bảng | Index |
|---|---|
| `wp_hinteach_classes` | `teacher_id`, `billing_mode` |
| `wp_hinteach_students` | (chỉ pk) |
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

Mọi bảng đều có `id BIGINT UNSIGNED AUTO_INCREMENT`, `created_at`, `updated_at`, `deleted_at`.

---

### Component 3: Roles & Capabilities

#### [NEW] [roles-capabilities.php](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/includes/roles-capabilities.php)
3 roles:
- `hinteach_admin` → cap `manage_hinteach_all`, `manage_hinteach_classes`, `read`
- `hinteach_teacher` → cap `manage_hinteach_classes`, `read`
- `hinteach_assistant` → cap `read` (quyền chi tiết tra bảng `assistant_permissions`)

Hàm helper: `hinteach_user_can_module($user_id, $module_key)` → check `assistant_permissions`.

---

### Component 4: Shortcode

#### [NEW] [shortcodes.php](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/includes/shortcodes.php)
Shortcode `[hinteach_dashboard]`:
- Check user logged in + có role phù hợp
- Render HTML shell (sidebar + main content area) theo role
- Output `HT_Config` JS object (nonce, ajaxurl, currentUser, currentRole, assistantPermissions)
- **KHÔNG query DB trực tiếp** — chỉ render khung HTML

---

### Component 5: AJAX Backend — Lớp học

#### [NEW] [ajax-classes.php](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/includes/ajax-classes.php)

**Endpoints:**

| Action | Mô tả |
|---|---|
| `hinteach_class_list` | Lấy danh sách lớp (filter teacher_id, soft delete) |
| `hinteach_class_get` | Lấy chi tiết 1 lớp + danh sách học sinh |
| `hinteach_class_save` | Tạo/sửa lớp. Validate theo billing_mode: session → chỉ fee_amount; course → fee_amount + start/end date; monthly → fee_amount. Lưu surcharge_name/amount, schedule_type/fixed_weekdays. **KHOÁ billing_mode+fee_amount nếu đã có buổi học.** |
| `hinteach_class_delete` | Soft delete. Cảnh báo nếu có học sinh active. |

Mọi handler: verify nonce, check capability, filter teacher_id.

> [!IMPORTANT]
> **Phân quyền assistant bắt buộc:** Nếu user hiện tại có role `hinteach_assistant`, mọi handler trong file này PHẢI gọi `hinteach_user_can_module($user_id, 'classProfiles')` — nếu trả `false` → `wp_send_json_error('permission_denied')`. Không chỉ check capability `read` chung chung.

---

### Component 6: AJAX Backend — Học sinh

#### [NEW] [ajax-students.php](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/includes/ajax-students.php)

**Endpoints:**

| Action | Mô tả |
|---|---|
| `hinteach_student_list` | Lấy danh sách học sinh (filter teacher_id qua join student_class→classes) |
| `hinteach_student_get` | Chi tiết 1 học sinh + danh sách lớp đang tham gia |
| `hinteach_student_save` | Tạo/sửa học sinh. Gán vào lớp qua student_class (tránh duplicate). fee_override chỉ có ý nghĩa khi lớp billing_mode='session'. |
| `hinteach_student_delete` | Soft delete. |
| `hinteach_student_import` | Import Excel/CSV/Word. Giới hạn 10MB, 500 dòng. Báo lỗi từng dòng. |
| `hinteach_student_class_add` | Gán học sinh vào lớp (tạo record student_class, check duplicate) |
| `hinteach_student_class_remove` | Bỏ học sinh khỏi lớp (soft delete student_class) |

> [!IMPORTANT]
> **Phân quyền assistant bắt buộc:** Nếu user hiện tại có role `hinteach_assistant`, mọi handler trong file này PHẢI gọi `hinteach_user_can_module($user_id, 'students')` — nếu trả `false` → `wp_send_json_error('permission_denied')`. Không chỉ check capability `read` chung chung.

---

### Component 7: File Import Helper

#### [NEW] [file-parser.php](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/includes/helpers/file-parser.php)

```php
hinteach_parse_uploaded_table( $file_path, $expected_columns ) : array
```
- PhpSpreadsheet cho .xlsx/.csv
- PhpOffice\PhpWord cho .docx (bảng)
- Validate 10MB, 500 dòng
- Trả mảng associative, báo lỗi rõ từng dòng

---

### Component 8: Frontend Core

#### [NEW] [dashboard-core.js](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/assets/dashboard-core.js)

Namespace `HT`:
- `HT.api.call(action, payload)` → `fetch()` wrapper tới `admin-ajax.php` (kèm nonce)
- `HT.state` → `{ currentUser, currentRole, activeTab, assistantPermissions, cache: {} }`
- `HT.router` → chuyển tab, lazy-load module JS bằng `import()`
- `HT.events` → simple pub/sub (`emit`, `on`, `off`)
- `HT.modal` → `openModal(id)`, `closeModal(id)`

#### [NEW] [dashboard-shell.js](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/assets/dashboard-shell.js)

- Render sidebar tabs theo role (ẩn tab nếu assistant không có quyền module đó)
- Render topbar (tên user, avatar, nút đăng xuất)
- Tab click → `HT.router.navigate(tabName)`
- Modal container dùng chung

---

### Component 9: Frontend Modules — Lớp học & Học sinh

#### [NEW] [classes.js](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/assets/modules/classes.js)

- Danh sách lớp (bảng/grid)
- Form tạo/sửa lớp (4 phần theo spec):
  1. Thông tin (tên, màu — color picker)
  2. Học phí: chọn billingMode → label/field thay đổi động. Phụ thu mặc định (tên + mức). Khoá billing_mode nếu đã có buổi học.
  3. Lịch học: scheduleType toggle (flexible/fixed), chọn weekdays + giờ nếu fixed
  4. Chọn học sinh: multi-select + nút tạo nhanh
- Xoá lớp: confirm dialog, cảnh báo nếu có học sinh

#### [NEW] [students.js](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/assets/modules/students.js)

- Danh sách học sinh (bảng)
- Form tạo/sửa học sinh (name, dob, phone, email, note)
- Gán/bỏ lớp (multi-select, fee_override cho billing_mode='session')
- Import file: upload → preview → confirm → kết quả (hiện lỗi từng dòng)
- Xoá học sinh: confirm dialog

---

### Component 10: Stylesheet

#### [NEW] [style.css](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/assets/style.css)

CSS cơ bản cho layout dashboard (sidebar + content), form, table, modal. **Không hardcode branding** — chờ giai đoạn UI/UX sau. Dùng CSS custom properties cho dễ theme.

---

### Component 11: Build Setup

#### [NEW] [package.json](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/package.json)

- Dependency: `esbuild` (build/minify)
- Script: `npm run build` → gộp `dashboard-core.js` + `dashboard-shell.js` → `assets/dist/hinteach-dashboard.min.js`
- Module JS (`classes.js`, `students.js`) → `assets/dist/modules/` (lazy-load bằng `import()`)

---

## Cấu trúc file cuối cùng

```
hinteach/
├── hinteach.php                          ★ Main plugin file
├── package.json                          Build config (esbuild)
│
├── assets/
│   ├── CLAUDE.md                         (giữ nguyên)
│   ├── dashboard-core.js                 Core: state, API client, router, events
│   ├── dashboard-shell.js                UI shell: sidebar, topbar, modals
│   ├── style.css                         Layout + component styles
│   ├── modules/
│   │   ├── classes.js                    CRUD lớp học
│   │   └── students.js                  CRUD học sinh + import
│   └── dist/                             (output build — KHÔNG commit)
│       ├── hinteach-dashboard.min.js
│       └── modules/
│           ├── classes.min.js
│           └── students.min.js
│
├── includes/
│   ├── CLAUDE.md                         (giữ nguyên)
│   ├── db-schema.php                     ★ dbDelta — tất cả 12 bảng
│   ├── roles-capabilities.php            3 roles + caps + helper
│   ├── shortcodes.php                    [hinteach_dashboard] shell
│   ├── ajax-classes.php                  AJAX: CRUD lớp
│   ├── ajax-students.php                 AJAX: CRUD học sinh + import
│   └── helpers/
│       └── file-parser.php               Import Excel/CSV/Word
│
├── modules/
│   └── quiz-engine-DEFERRED/             (giữ nguyên, KHÔNG đụng)
│
└── CLAUDE.md                             (giữ nguyên)
```

---

## Verification Plan

> [!NOTE]
> **Chưa có môi trường localWP.** Verification ở giai đoạn này chỉ bằng code review + PHP syntax check (`php -l`). Test thật trên WP sẽ làm sau khi anh cài xong localWP.

### Code Review (thay cho automated test)
- PHP syntax check: `php -l` tất cả file `.php`
- Kiểm tra schema: đủ 12 bảng, đúng cột, đúng index
- Kiểm tra 3 roles + capabilities đúng spec
- Kiểm tra shortcode render HTML shell không query DB trực tiếp
- Kiểm tra mọi AJAX handler đều có: nonce verify, capability check, teacher_id filter, **assistant module permission check**

### Manual Verification (SAU KHI có localWP)
- Activate plugin → kiểm tra bảng DB tạo đủ
- Tạo lớp với mỗi billing_mode → lưu đúng field
- Tạo/sửa/xoá học sinh → soft delete hoạt động
- Gán học sinh vào nhiều lớp → không duplicate
- Import file Excel 500 dòng → thành công; 501 → chặn
- Billing_mode bị khoá khi lớp đã có buổi học
- Giáo viên A không thấy dữ liệu giáo viên B
- Trợ giảng chỉ thấy module được bật (check `hinteach_user_can_module`)

### Test Cases (từ AI_TASK_BUILD_STUDENTS_CLASSES.md)
- [ ] Tạo lớp `session` → chỉ yêu cầu `fee_amount`
- [ ] Tạo lớp `course` → bắt buộc `course_start_date`/`course_end_date`
- [ ] Tạo lớp `monthly` → fee cố định, không cần ngày
- [ ] Tạo lớp đã có buổi → billing_mode bị khoá
- [ ] Thêm học sinh → gán vào lớp session → fee_override hoạt động
- [ ] Thêm học sinh đã có vào lớp 2 → không trùng record
- [ ] Import Excel 500 dòng → đúng; 501 dòng → chặn
- [ ] Giáo viên A ≠ giáo viên B
- [ ] Trợ giảng gọi AJAX lớp học → check `hinteach_user_can_module($uid, 'classProfiles')`
- [ ] Trợ giảng gọi AJAX học sinh → check `hinteach_user_can_module($uid, 'students')`
- [ ] Xoá học sinh → soft delete, dữ liệu cũ còn
