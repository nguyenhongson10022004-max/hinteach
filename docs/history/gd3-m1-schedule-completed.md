# GĐ3 M1 — Calendar Shell + Session List

> Ngày hoàn thành: 2026-08-28
> Commit chính: `792e117`
> Phạm vi: READ ONLY — hiển thị buổi học trên calendar tuần.

---

## 1. Overview

### Mục tiêu M1

Cung cấp giao diện calendar tuần hiển thị danh sách buổi học (session) từ database.
Chỉ đọc — không có khả năng tạo, sửa, xoá buổi học.

### Phạm vi

- Backend endpoint trả danh sách session trong khoảng ngày.
- Frontend module render calendar tuần T2–CN với session blocks.
- Điều hướng tuần trước / tuần sau.
- Filter ownership theo `teacher_id` — giáo viên chỉ thấy lớp của mình.

### Những gì cố tình KHÔNG làm trong M1

- Tạo buổi học (create session).
- Chuỗi lặp (recurrence).
- Sửa buổi học (edit).
- Xoá buổi học (delete).
- Quick-entry (nhật ký + điểm nhanh).
- Điểm danh (attendance).
- Tích hợp học phí (tuition).

---

## 2. Design Decisions

| Quyết định | Lý do |
|---|---|
| M1 là READ ONLY — chỉ SELECT, không INSERT/UPDATE/DELETE | Giảm phạm vi M1 xuống mức nhỏ nhất có thể test được. Đảm bảo calendar shell hoạt động đúng trước khi thêm mutation. |
| Session là nguồn dữ liệu duy nhất hiển thị trên calendar | Calendar đọc trực tiếp từ bảng `wp_hinteach_sessions`. Không có dữ liệu giả hay mock. |
| Không làm recurrence trong M1 | Recurrence là tính năng phức tạp (4 kiểu sinh ngày, conflict detection, edit/delete scope). Tách riêng để giảm rủi ro. |
| Không làm quick-entry trong M1 | Quick-entry liên quan GĐ5 (scoreGroups, studentDetails). Cần spec boundary rõ trước khi code. |
| Chỉ SELECT 10 field cần thiết cho hiển thị | Không lấy `price`, `content`, `repeat_group_id`, `is_exception` — không cần cho calendar view M1. |

---

## 3. Backend Implementation

### File

[`includes/ajax-schedule.php`](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/includes/ajax-schedule.php) — 151 dòng (bao gồm comments và blank lines).

### Endpoint

| Action | Hook | HTTP |
|---|---|---|
| `hinteach_session_list` | `wp_ajax_hinteach_session_list` | GET |

Đăng ký tại dòng 18:
```php
add_action( 'wp_ajax_hinteach_session_list', 'hinteach_ajax_session_list' );
```

### Flow xử lý

```
Request
  → check_ajax_referer('hinteach_nonce', 'nonce')
  → get_current_user_id() — 401 nếu chưa đăng nhập
  → hinteach_user_can_module($user_id, 'scheduler') — 403 nếu không có quyền
  → hinteach_get_teacher_id($user_id) — 403 nếu không xác định được giáo viên
  → Validate date_from, date_to (GET params, format YYYY-MM-DD)
  → Check date_from <= date_to
  → Check khoảng tối đa 62 ngày
  → Query sessions
  → wp_send_json_success({ sessions: [...] })
```

### Helper function

`hinteach_schedule_check_access()` — pattern giống `hinteach_class_check_access()` trong `ajax-classes.php`. Trả `['user_id' => int, 'teacher_id' => int]`.

### Query behavior

- JOIN `wp_hinteach_sessions` với `wp_hinteach_classes` (lấy `class_name`, `class_color`).
- Filter `s.deleted_at IS NULL` và `c.deleted_at IS NULL`.
- Filter `s.date BETWEEN date_from AND date_to`.
- Admin (`manage_hinteach_all`): xem tất cả session, không filter `teacher_id`.
- Teacher / Assistant: filter `c.teacher_id = :teacher_id` — chỉ thấy lớp của mình.
- ORDER BY `s.date ASC, s.start_time ASC`.

### Fields SELECT

```
s.id, s.class_id, s.date, s.start_time, s.end_time,
s.type, s.session_name, s.display_color,
c.name AS class_name, c.color AS class_color
```

### Lý do không có INSERT/UPDATE/DELETE

M1 chỉ hiển thị. Mutation sẽ triển khai ở M2+. File header ghi rõ:
> "M1: Đọc danh sách buổi học trong khoảng ngày — READ ONLY.
> Không có INSERT/UPDATE/DELETE trong file này ở M1."

---

## 4. Frontend Implementation

### File

[`assets/modules/schedule.js`](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/assets/modules/schedule.js) — 235 dòng (bao gồm comments và blank lines).

### Module shape

```js
const ScheduleModule = {
    _currentDate: new Date(),
    async render(container) { ... },
    // internal methods...
};
export default ScheduleModule;
```

Giống pattern `classes.js` / `students.js`. Gọi bởi `HT.router.navigate('schedule')`.

### Calendar tuần T2–CN

- `_getWeekRange(date)`: tính khoảng T2–CN chứa `date`.
  - `day = d.getDay()` (0=CN, 1=T2, ..., 6=T7).
  - `offset = (day + 6) % 7` → T2=0, T3=1, ..., CN=6.
  - `from = date - offset` (T2), `to = from + 6` (CN).
- Mảng 7 cột với nhãn `['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']`.
- Cột ngày hôm nay có class `ht-cal__col--today`.
- Header label format: `DD/MM – DD/MM/YYYY`.

### Navigation

- `_navigate(delta)`: `delta = -1` (tuần trước) hoặc `+1` (tuần sau).
- Thay đổi `_currentDate` rồi gọi `_render()`.
- 2 nút: `#ht-cal-prev` ("← Tuần trước") và `#ht-cal-next` ("Tuần sau →").
- `_bindNavEvents()` gắn click listener sau mỗi lần render.
- Mỗi lần mount tab (`render()`), reset về tuần hiện tại.

### API call flow

```
_render()
  → _getWeekRange(_currentDate)
  → _loadSessions(fromStr, toStr)
      → HT.api.call('hinteach_session_list', { date_from, date_to }, 'GET')
      → return data.sessions || []
  → _buildCalendarHtml(week, sessions)
  → _bindNavEvents()
```

Lỗi API → render `ht-error` div với message.

### Render session block

`_renderSessionBlock(s)`:
- `border-left: 3px solid <color>` — ưu tiên `display_color`, fallback `class_color`, fallback `#888888`.
- Hiển thị: `class_name`, `session_name` (nếu có), `start_time – end_time`.
- Tất cả text qua `HT.utils.escapeHtml()`.
- Không có click handler trong M1.

### Date utilities

| Method | Input → Output |
|---|---|
| `_toIso(date)` | `Date` → `'YYYY-MM-DD'` |
| `_fmtShort(iso)` | `'YYYY-MM-DD'` → `'DD/MM'` |
| `_fmtTime(timeStr)` | `'HH:MM:SS'` hoặc `'HH:MM'` → `'HH:MM'` |

### Build pipeline

[`build.mjs`](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/build.mjs) — thêm entry point `'./assets/modules/schedule.js'` vào `modulesConfig.entryPoints` (dòng 35).

Output: `assets/dist/modules/schedule.min.js` (ESM, lazy-load bằng `import()`).

[`hinteach.php`](file:///c:/CLASS/HinTeach-CLAUDE-md/HinTeach/hinteach.php) — thêm `require_once` cho `includes/ajax-schedule.php` (dòng 67). Module JS không enqueue trực tiếp — lazy-load bởi `HT.router`.

---

## 5. Database Impact

### M0B schema migration (commit `8b9fbae`)

Thay đổi trong `includes/db-schema.php`:

**Bảng `wp_hinteach_sessions`:**

| Thay đổi | Chi tiết |
|---|---|
| Thêm cột `session_name` | `VARCHAR(255) DEFAULT NULL` — tên buổi học. |
| Thêm cột `general_comment` | `TEXT DEFAULT NULL` — nhận xét chung. |
| Đổi index `idx_repeat_group_id` → `idx_repeat_group_date` | `(repeat_group_id, date, start_time)` — hỗ trợ query "following" trong recurrence chain (Mục 4 spec). |

**Bảng `wp_hinteach_grades`:**

| Thay đổi | Chi tiết |
|---|---|
| Thêm cột `session_id` | `BIGINT UNSIGNED DEFAULT NULL` — liên kết grades với session (chuẩn bị cho quick-entry GĐ3 M2+). |
| Thêm index `idx_session_id` | `(session_id)`. |

Thêm update tương ứng trong `includes/CLAUDE.md`.

### Các field session sử dụng trong M1

M1 đọc 10 field từ query:

| Field | Nguồn | Mục đích |
|---|---|---|
| `id` | sessions | Unique ID |
| `class_id` | sessions | Liên kết lớp |
| `date` | sessions | Ngày hiển thị trên calendar |
| `start_time` | sessions | Giờ bắt đầu |
| `end_time` | sessions | Giờ kết thúc |
| `type` | sessions | `'riêng'` / `'chung'` |
| `session_name` | sessions | Tiêu đề buổi học (cột mới từ M0B) |
| `display_color` | sessions | Màu hiển thị trên calendar |
| `class_name` | classes (JOIN) | Tên lớp — hiển thị chính trên block |
| `class_color` | classes (JOIN) | Fallback màu nếu `display_color` null |

---

## 6. Testing

Các test đã thực hiện (ghi trong STATUS.md):

| Test | Kết quả |
|---|---|
| `npm run build` | ✅ Build thành công, output `assets/dist/modules/schedule.min.js` |
| Local WordPress runtime | ✅ Plugin load, tab Thời khoá biểu render |
| AJAX endpoint `hinteach_session_list` | ✅ Trả session thật từ database |
| Session từ `wp_hinteach_sessions` hiển thị trên calendar | ✅ Session block render đúng với class_name, time, color |
| Ownership test với `teacher_id` thực tế | ✅ Giáo viên chỉ thấy session của lớp mình |

---

## 7. Known Limitations

Những thứ chưa có trong M1 — sẽ triển khai ở M2+:

- **Create session** — không có giao diện hay endpoint tạo buổi học.
- **Recurrence** — không có logic sinh chuỗi lặp (daily/weekly/monthly/custom).
- **Edit session** — không có sửa buổi (single/following scope).
- **Delete session** — không có xoá buổi (single/following scope).
- **Quick-entry** — không có ghi nhật ký, điểm, studentDetails trong buổi.
- **Attendance** — không có điểm danh.
- **Grades integration** — không có scoreGroups.
- **Tuition integration** — không có tính học phí liên quan session.
- **Calendar click handler** — session block không có click event.
- **Month view** — chỉ có week view.
- **Filter lịch** — không có filter theo lớp/học sinh/khoảng giờ.

---

## 8. Commit History

| Commit | Message | Ngày | Files changed |
|---|---|---|---|
| `8b9fbae` | `GĐ3-M0B: apply approved schedule schema migration` | 2026-08-28 14:28 | `includes/db-schema.php`, `includes/CLAUDE.md` (2 files, +7 −3) |
| `792e117` | `feat: add read-only schedule calendar M1` | 2026-08-28 17:01 | `assets/modules/schedule.js`, `build.mjs`, `hinteach.php`, `includes/ajax-schedule.php` (4 files, +386 −0) |
| `b4c4a5a` | `docs: update status after schedule M1 completion` | 2026-08-28 17:15 | `STATUS.md` (1 file, +116 −13) |
