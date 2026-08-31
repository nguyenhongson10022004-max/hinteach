# includes/ — BACKEND CONTEXT
> Thuộc plugin `hinteach` | Đọc `../CLAUDE.md` trước file này
> Cập nhật: 2026-08-31 — thêm endpoint `hinteach_session_quick_entry` và làm rõ schema `wp_hinteach_grades` (GĐ3 M5).

---

## DANH SÁCH BẢNG DB (`db-schema.php`)

> Tất cả bảng có prefix `wp_hinteach_`, đều có `id BIGINT UNSIGNED AUTO_INCREMENT`, `created_at`, `updated_at`, `deleted_at` (soft delete).

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `wp_hinteach_classes` | name, color (hex), teacher_id, billing_mode (`session`/`course`/`monthly`), fee_amount, course_start_date, course_end_date (nullable, chỉ dùng khi `course`), surcharge_name, surcharge_amount (phụ thu mặc định lúc tạo lớp), schedule_type (`fixed`/`flexible`), fixed_weekdays (JSON mảng số 0-6, chỉ dùng khi `fixed`), fixed_start_time, fixed_end_time | `fee_amount` bị KHOÁ (không sửa được) sau khi tạo lớp nếu đã có buổi học — xác nhận qua UI note "Học phí và cách thu được cố định sau khi tạo lớp" |
| `wp_hinteach_students` | name, dob, phone, email, note | |
| `wp_hinteach_student_user_map` | student_id, user_id | 1-1, nullable — hoãn nếu chưa cần tài khoản học sinh (gắn với quiz) |
| `wp_hinteach_student_class` | student_id, class_id, fee_override | N-N, fee_override CHỈ áp dụng ý nghĩa khi lớp đó `billing_mode = 'session'` |
| `wp_hinteach_sessions` | class_id, date, start_time, end_time, price, type, session_name (nullable), content, homework_content (BTVN giao chung cho buổi), general_comment (nhận xét chung cho buổi, nullable), display_color, repeat_group_id, is_exception (bool) | `type='riêng'` = 1 học sinh, `type='chung'` = nhóm — ảnh hưởng màu mặc định |
| `wp_hinteach_session_students` | session_id, student_id, fee_amount (override riêng buổi này nếu có), paid (bool), homework (enum: `0%/30%/50%/70%/100%`), attitude (TEXT tự do, không phải điểm số), individual_comment, note | Nguồn DUY NHẤT cho điểm danh + nhật ký học tập |
| `wp_hinteach_billing_payments` | student_id, class_id, period_key (VD: `2026-08` hoặc `course:2026-01-01:2026-06-30`), paid (bool), amount_paid | CHỈ dùng cho `billing_mode IN ('course','monthly')` — không liên quan `wp_hinteach_payments` |
| `wp_hinteach_payments` | student_id, class_id, session_id (nullable), amount, paid_at, note | Lịch sử thu tiền THẬT cho chế độ `session` — mỗi lần xác nhận thu = 1 record mới, không update đè |
| `wp_hinteach_tuition_adjustments` | student_id (nullable)/class_id (nullable), type (`surcharge`/`discount`), calc_type (`amount`/`percent`), value, month_from, month_to, note | scope: nếu `student_id` NULL → áp dụng cả lớp; đúng field UI: `tuitionAdjustmentType`, `tuitionAdjustmentMode`, `tuitionAdjustmentValue`, `tuitionAdjustmentMonthStart/End` |
| `wp_hinteach_grades` | student_id, class_id, session_id (nullable — liên kết grade record với session khi điểm được nhập qua quick-entry GĐ3), test_name, score, scale, type (`homework`/`test`/`final`), score_type_label (VARCHAR — nhãn hiển thị loại điểm, theo D3 Option B: giữ `type` ENUM cố định + thêm label tự do song song), date, note | KHÔNG có type=`quiz` ở giai đoạn hiện tại (hoãn cùng quiz-engine) |
| `wp_hinteach_assistant_permissions` | assistant_user_id, module_key, enabled | module_key thuộc tập: `dashboard, scheduler, tuition, students, classProfiles` (đúng như `assistantPermissionDefinitions()` trong bundle.js) |
| `wp_hinteach_license` | user_id, expires_at, status (`active`/`grace`/`locked`/`exempt`), last_confirmed_at | |

---

## AJAX ENDPOINTS

| Action (`wp_ajax_...`) | File | Method | Capability yêu cầu |
|---|---|---|---|
| `hinteach_class_save` / `hinteach_class_delete` | ajax-classes.php | POST | `manage_hinteach_classes` |
| `hinteach_student_save` / `hinteach_student_import` | ajax-students.php | POST | `manage_hinteach_classes` |
| `hinteach_session_list` | ajax-schedule.php | GET | quyền `scheduler` (assistant) hoặc `manage_hinteach_classes` |
| `hinteach_session_get` | ajax-schedule.php | GET | quyền `scheduler` (assistant) hoặc `manage_hinteach_classes` |
| `hinteach_session_save` (create + update, scope: `single`/`following`) | ajax-schedule.php | POST | quyền `scheduler` (assistant) hoặc `manage_hinteach_classes` |
| `hinteach_session_save_recurring` | ajax-schedule.php | POST | quyền `scheduler` (assistant) hoặc `manage_hinteach_classes` |
| `hinteach_session_delete` (scope: `single`/`following`) | ajax-schedule.php | POST | quyền `scheduler` (assistant) hoặc `manage_hinteach_classes` |
| `hinteach_session_quick_entry` | ajax-schedule.php | POST | quyền `scheduler` (assistant) hoặc `manage_hinteach_classes` — chỉ áp dụng đúng `session_id` đang mở, KHÔNG propagate sang session following (xem `docs/specs/schedule.md` mục 9). Cập nhật `content`/`homework_content`/`session_name`/`general_comment` của session, cập nhật `session_students` (nhật ký per-student), và tạo record trong `wp_hinteach_grades` gắn `session_id` |
| `hinteach_session_display_color` | ajax-schedule.php | POST | quyền `scheduler` (assistant) hoặc `manage_hinteach_classes` — cập nhật `display_color` cho session (hex hoặc null). Nếu thuộc chuỗi lặp (repeat_group_id), server tự propagate current + following theo tuple `(repeat_group_id, date, start_time, id)` |
| `hinteach_tuition_get` | ajax-tuition.php | GET | quyền `tuition` (assistant) hoặc `manage_hinteach_classes` |
| `hinteach_tuition_adjustment_save` | ajax-tuition.php | POST | `manage_hinteach_classes` |
| `hinteach_billing_payment_confirm` | ajax-tuition.php | POST | `manage_hinteach_classes` — dùng riêng cho `course`/`monthly`, KHÔNG dùng chung hàm với xác nhận thu buổi `session` |
| `hinteach_grade_save` / `hinteach_journal_save` | ajax-grades.php | POST | `manage_hinteach_classes` |
| `hinteach_receipt_export_pdf` / `hinteach_receipt_export_bulk` | pdf-export.php | POST | `manage_hinteach_classes` (xuất hàng loạt: chỉ admin theo quan sát UI — class `admin-only` trên nút "Xuất hàng loạt") |
| `hinteach_license_confirm_payment` | admin/license.php | POST | `manage_hinteach_all` |
| `hinteach_impersonate_start` / `hinteach_impersonate_stop` | admin/license.php hoặc file riêng | POST | `manage_hinteach_all` — set flag `impersonating=true` cho session, ẩn bớt 1 số thao tác nhạy cảm khi đang impersonate |

**Mọi handler PHẢI:**
1. Verify nonce (`check_ajax_referer`).
2. Verify capability đúng role — với `hinteach_assistant`, check thêm bảng `wp_hinteach_assistant_permissions` theo `module_key` tương ứng, KHÔNG chỉ check role chung chung.
3. Filter theo `teacher_id = get_current_user_id()`, KHÔNG trust `class_id`/`student_id` từ client.
4. Trả JSON chuẩn `wp_send_json_success()` / `wp_send_json_error()`.

---

## LOGIC TÍNH HỌC PHÍ (quan trọng — ĐÃ SỬA so với bản trước, xác nhận qua bundle.js)

### Chế độ `session` (mặc định)
```
Học phí tháng của 1 học sinh trong 1 lớp
  = Σ (phí mỗi buổi đã học trong tháng)
  ± phụ thu/giảm phí áp dụng cho tháng đó (wp_hinteach_tuition_adjustments)

Phí 1 buổi của 1 học sinh (getStudentSessionFee):
  1. Nếu wp_hinteach_session_students.fee_amount có giá trị (override riêng buổi này) → dùng giá trị đó
  2. Ngược lại → session.price / (số học sinh đang trả tiền buổi đó)   -- CHIA ĐỀU, không phải fee cố định × 1

Còn nợ = Học phí tháng (tính động) − Tổng đã thanh toán (wp_hinteach_payments)
```
KHÔNG lưu số tiền tĩnh cho chế độ này — luôn tính động khi hiển thị.

### Chế độ `course`
```
Học phí = wp_hinteach_classes.fee_amount   -- SỐ CỐ ĐỊNH, 1 lần cho cả khóa
period_key = "course:{course_start_date}:{course_end_date}"
Trạng thái thanh toán tra theo period_key trong wp_hinteach_billing_payments
```
KHÔNG tính từ số buổi. Số buổi thực tế học được ghi nhận riêng ở `wp_hinteach_sessions` chỉ để hiển thị lịch, KHÔNG ảnh hưởng số tiền.

### Chế độ `monthly`
```
Học phí = wp_hinteach_classes.fee_amount   -- SỐ CỐ ĐỊNH, mỗi tháng
period_key = "YYYY-MM" của tháng đang xem
Trạng thái thanh toán tra theo period_key trong wp_hinteach_billing_payments
```
Tương tự `course` — không tính từ số buổi.

### ⚠️ Cả 3 chế độ dùng chung bảng lớp nhưng KHÔNG được viết chung 1 hàm tính học phí
Viết 3 hàm riêng hoặc 1 hàm dispatch theo `billing_mode`, KHÔNG cố gộp logic vì bản chất tính động (session) vs tính tĩnh (course/monthly) khác nhau hoàn toàn — cố gộp sẽ tạo bug khó debug.

---

## PHỤ THU / GIẢM PHÍ (`wp_hinteach_tuition_adjustments`)

- `type`: `surcharge` (phụ thu) hoặc `discount` (giảm phí)
- `calc_type`: `amount` (số tiền cố định) hoặc `percent` (phần trăm học phí gốc)
- Scope: theo lớp (student_id NULL) hoặc theo học sinh cụ thể
- Áp dụng theo khoảng `month_from → month_to` ("Bảo lưu đến"), KHÔNG áp dụng vĩnh viễn nếu không chọn
- **Riêng biệt với phụ thu mặc định lúc tạo lớp** (`classes.surcharge_name/surcharge_amount`) — CẦN LÀM RÕ quan hệ 2 cơ chế này trước khi code. Xem thêm `docs/specs/tuition.md` và `STATUS.md` mục "Decisions Not Yet Implemented".

---

## FILE IMPORT

Bản gốc hỗ trợ Excel/CSV/Word (.docx bảng), giới hạn xác nhận đúng: **10MB, tối đa 500 dòng**.

```php
// includes/helpers/file-parser.php
hinteach_parse_uploaded_table( $file_path, $expected_columns ) : array
```
- `PhpSpreadsheet` cho xlsx/csv, `PhpOffice\PhpWord` cho .docx.
- Trả về mảng associative, báo lỗi rõ từng dòng thiếu dữ liệu bắt buộc — KHÔNG import 1 phần rồi im lặng bỏ qua.

---

## ⚡ HIỆU NĂNG BACKEND — BẮT BUỘC ÁP DỤNG

1. **`wp_enqueue_scripts` cho asset HinTeach chỉ chạy đúng trang dashboard** — check `is_page()`/`has_shortcode()` trước khi enqueue, không để load ở toàn site:
   ```php
   add_action('wp_enqueue_scripts', function () {
       if (!has_shortcode(get_post()->post_content ?? '', 'hinteach_dashboard')) return;
       // enqueue ở đây
   });
   ```
2. **Dọn hook mặc định của WP không cần thiết trên trang dashboard** (`wp_generator`, `rsd_link`, `wlwmanifest_link`, `wp_shortlink_wp_head`, `print_emoji_styles`, `wp_oembed_add_discovery_links`) — giảm số request/script thừa mỗi lần load trang.
3. **Cache kết quả tính Dashboard bằng `set_transient()`/`get_transient()`**, TTL 5-15 phút — doanh thu 6 tháng, thống kê theo lớp không cần tính lại mỗi request. Xoá transient (`delete_transient()`) ngay khi có sự kiện làm số liệu đổi (xác nhận thu tiền mới, thêm buổi học).
4. **Index đầy đủ trong `db-schema.php` ngay từ đầu** cho mọi cột dùng `WHERE`/`JOIN` thường xuyên: `teacher_id`, `class_id`, `student_id`, `session_id` trên tất cả các bảng liên quan. Không thêm index sau khi đã có dữ liệu lớn — tốn migration không cần thiết.
5. **Chỉ cài đúng 1 plugin (`hinteach`) trên site** — không cài thêm page builder/SEO plugin trên site này (xem quyết định tách site riêng, không chung `hinlove.store`, ở `../CLAUDE.md`).

---

## 🔴 RIÊNG CHO FOLDER NÀY

- **KHÔNG query trực tiếp `$wpdb` trong `shortcodes.php`.**
- **KHÔNG trộn logic tính học phí vào `ajax-grades.php`.**
- **KHÔNG viết 1 hàm tính học phí dùng chung cho cả 3 `billing_mode`** — xem phần công thức ở trên.
- **KHÔNG code bất kỳ endpoint nào liên quan quiz/type='quiz'** ở giai đoạn hiện tại.

---

## CẦN XÁC NHẬN THÊM (chưa đủ dữ liệu để quyết định)

1. Quan hệ giữa "lịch cố định" khi tạo lớp (`schedule_type='fixed'` + `fixed_weekdays`) và "lặp lịch" — xem `docs/specs/schedule.md` và `STATUS.md` mục "Decisions Not Yet Implemented".
2. Quan hệ phụ thu lúc tạo lớp vs bảng `tuition_adjustments` — xem `docs/specs/tuition.md` và `STATUS.md` mục "Decisions Not Yet Implemented".
