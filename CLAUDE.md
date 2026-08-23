# HINTEACH — ROOT CONTEXT
> Plugin: `hinteach` | Kiến trúc tham chiếu: `thiep-builder` (Hinlove) | v0.2.0-scaffold
> Cập nhật: 2026-08-23 — sau khi đối chiếu bundle.js + HTML thật của bản gốc (nttclass.onrender.com)

---

## MỤC ĐÍCH

HinTeach là nền tảng **quản lý lớp học cá nhân cho giáo viên** (tái dựng lại từ project cũ của team, đi theo kiến trúc plugin WordPress giống Hinlove). Giáo viên quản lý học sinh, lớp học, thời khoá biểu, học phí, điểm số, nhật ký học tập.

**⏸️ HOÃN LẠI: module bài tập trắc nghiệm (quiz-engine) và tài khoản học sinh tự làm bài.**
Ưu tiên hiện tại: dựng đủ và đúng các module cốt lõi (Lớp học, Học sinh, Thời khoá biểu, Học phí, Điểm số, Nhật ký, Cài đặt tài khoản) cho đến khi CHẠY ĐƯỢC ổn định, khớp đúng dữ liệu quan sát từ bản gốc. Xem `modules/quiz-engine-DEFERRED/` — giữ nguyên spec cũ để dùng lại sau, KHÔNG code phần này ở giai đoạn hiện tại dù được yêu cầu tiện thể.

**Giai đoạn hiện tại:** tái hiện đầy đủ FUNCTION/LOGIC trước. Giao diện, màu sắc, logo, branding thiết kế lại sau — KHÔNG ưu tiên pixel-perfect UI, ưu tiên đúng nghiệp vụ và đúng dữ liệu.

**Stack:** WordPress + Custom Plugin + Custom DB tables (không dùng WooCommerce).

> ⚠️ **Lưu ý kiến trúc quan trọng:** bản gốc (nttclass.onrender.com) chạy REST API JSON riêng (`/api/students`, `/api/sessions/batch`...), KHÔNG phải WordPress. Nội bộ code gốc đặt tên class là `PinkyClassApp`. Việc build lại thành WP plugin (`wp_ajax_*` + `$wpdb`) là QUYẾT ĐỊNH KIẾN TRÚC CỦA TA, không phải port nguyên. Khi đối chiếu bundle.js/HAR của bản gốc, chỉ lấy **field/logic nghiệp vụ**, tự map lại sang pattern AJAX + `wp_ntt_*` bên dưới — không cố match tên endpoint 1-1.

---

## CẤU TRÚC PLUGIN

```
hinteach/
├── hinteach.php                    ★ Main file — constants, activation (dbDelta), roles, enqueue
├── CLAUDE.md                      ← FILE NÀY (đọc trước tiên, luôn luôn)
│
├── assets/
│   ├── CLAUDE.md                  ← Context cho JS/CSS
│   ├── dashboard-core.js          Core: state, routing giữa các tab, API client (fetch AJAX)
│   ├── dashboard-shell.js         UI: sidebar, topbar, tab panels, modals, responsive
│   ├── modules/
│   │   ├── classes.js             CRUD lớp học (3 billingMode: session/course/monthly)
│   │   ├── students.js            CRUD học sinh, import file
│   │   ├── schedule.js            Thời khoá biểu, lặp lịch (daily/weekly/monthly), ghi buổi học
│   │   ├── tuition.js             Học phí, phiếu thu, phụ thu/giảm phí
│   │   └── grades.js              Điểm số, nhật ký học tập
│   └── style.css
│
├── includes/
│   ├── CLAUDE.md                  ← Context cho backend PHP
│   ├── db-schema.php              ★ dbDelta() — định nghĩa TẤT CẢ bảng, chạy khi activate
│   ├── roles-capabilities.php     Định nghĩa role + capability + quyền trợ giảng chi tiết theo module
│   ├── shortcodes.php             [hinteach_dashboard] — render toàn bộ SPA theo role đăng nhập
│   ├── ajax-classes.php           AJAX: CRUD lớp học
│   ├── ajax-students.php          AJAX: CRUD học sinh + import Excel/CSV/Word
│   ├── ajax-schedule.php          AJAX: buổi học, lặp lịch (giống recurring event)
│   ├── ajax-tuition.php           AJAX: tính học phí (3 chế độ), phiếu thu, phụ thu/giảm phí
│   ├── ajax-grades.php            AJAX: điểm số, nhật ký học tập
│   ├── pdf-export.php             Xuất phiếu học phí PDF/ảnh
│   └── admin/
│       └── license.php            Hạn sử dụng tài khoản
│
└── modules/
    └── quiz-engine-DEFERRED/      ← HOÃN, giữ spec cũ để dùng sau, không code bây giờ
        └── CLAUDE.md
```

---

## ⚡ HIỆU NĂNG — MỤC TIÊU BẮT BUỘC

Mục tiêu: chạy mượt gần bằng bản gốc (`nttclass.onrender.com` — static bundle, không PHP chen giữa mỗi thao tác). Rút kinh nghiệm từ `thiep-builder` (Hinlove) từng bị chậm do enqueue rời rạc, load thừa trên toàn site.

**Chi tiết bắt buộc đọc trước khi code:**
- Frontend (bundle/minify, lazy-load module, không jQuery, font tự host) → `assets/CLAUDE.md` mục "⚡ HIỆU NĂNG FRONTEND".
- Backend (enqueue có điều kiện, dọn hook WP thừa, cache transient Dashboard, index DB) → `includes/CLAUDE.md` mục "⚡ HIỆU NĂNG BACKEND".

**Quyết định site riêng biệt:** HinTeach chạy trên 1 cài WordPress + domain + database HOÀN TOÀN riêng, KHÔNG chung site với `hinlove.store`. Lý do: tránh rủi ro ảnh hưởng site đang chạy thật (Hinlove có khách hàng/thanh toán thật), khác đối tượng người dùng, dễ deploy/rollback độc lập. Chỉ cài đúng 1 plugin (`hinteach`) trên site này, không cài thêm page builder/SEO plugin thừa.

---

## PHÂN QUYỀN (ROLES)

| Role | Capability chính | Xem được gì |
|---|---|---|
| `hinteach_admin` | `manage_hinteach_all` | Toàn bộ tài khoản, hạn sử dụng, mọi lớp, có thể "impersonate" (đăng nhập giả danh) tài khoản giáo viên để hỗ trợ |
| `hinteach_teacher` | `manage_hinteach_classes` | Lớp/học sinh/buổi học/học phí/điểm do mình phụ trách |
| `hinteach_assistant` | quyền CHI TIẾT theo từng module (xem bên dưới) | Chỉ những module được giáo viên bật, KHÔNG phải all-or-nothing |

> **Xác nhận từ bundle.js:** quyền trợ giảng không phải 1 cụm cứng — bản gốc có danh sách bật/tắt riêng từng mục:
> `dashboard, scheduler, tuition, students, classProfiles` (và tương đương). Khi build `roles-capabilities.php`, thiết kế bảng `hinteach_assistant_permissions` (assistant_user_id, module_key, enabled) thay vì 1 role tĩnh.

**Bỏ role `hinteach_student` khỏi phạm vi hiện tại** (gắn với quiz-engine đang hoãn). Nếu học sinh cần xem tiến độ, làm sau cùng với quiz.

---

## NGUYÊN TẮC DỮ LIỆU

1. **Không dùng `wp_postmeta`/`wp_usermeta` cho dữ liệu quan hệ** — dùng custom DB tables (`wp_hinteach_*`).
2. **Mọi bảng đều có `deleted_at` (soft delete)**.
3. **`session_id` là trung tâm tính học phí — NHƯNG CHỈ KHI `billing_mode = 'session'`.** Với `course`/`monthly`, học phí là số cố định lưu tĩnh theo kỳ, KHÔNG derive từ session — xem chi tiết `includes/CLAUDE.md`.
4. **Lặp lịch** — khi sửa 1 buổi trong chuỗi lặp, luôn hỏi "chỉ buổi này" hay "buổi này và các buổi sau", KHÔNG tự động áp dụng cho toàn chuỗi.

---

## 🔴 PHÁT HIỆN QUAN TRỌNG TỪ BUNDLE.JS — BẮT BUỘC ÁP DỤNG

### 1. Lớp học có 3 chế độ thu phí hoàn toàn khác nhau (không chỉ là "cách hiển thị")
```
billing_mode = 'session'   → Học phí = Σ (buổi đã học × phí/buổi), TÍNH ĐỘNG
billing_mode = 'course'    → Học phí = 1 khoản CỐ ĐỊNH cho cả khóa (gắn course_start_date/course_end_date)
billing_mode = 'monthly'   → Học phí = 1 khoản CỐ ĐỊNH mỗi THÁNG, không phụ thuộc số buổi
```
Với `course`/`monthly`: trạng thái thanh toán lưu theo `period_key` riêng (`YYYY-MM` cho monthly, `course:{start}:{end}` cho course) trong bảng riêng (`wp_hinteach_billing_payments`), KHÔNG dùng chung logic với `wp_hinteach_payments` của chế độ `session`.

### 2. Chế độ `session`: nếu 1 buổi có nhiều học sinh, phí có thể CHIA ĐỀU
Nếu buổi không có `fee_override` riêng cho học sinh đó → `phí học sinh = session.price / số học sinh đang trả tiền buổi đó` (không phải 1 mức cố định nhân số buổi).

### 3. Lớp học có thể có phụ thu ngay lúc tạo lớp
Form tạo lớp có sẵn field "Tên khoản phụ thu" + "Mức phụ thu" — độc lập với hệ thống phụ thu/giảm phí theo tháng (`wp_hinteach_tuition_adjustments`). Cần làm rõ 2 cơ chế phụ thu này quan hệ thế nào trước khi code (khả năng: phụ thu lúc tạo lớp = giá trị mặc định, tự tạo 1 record adjustment ban đầu).

### 4. Lịch cố định (`schedule_type = 'fixed'`) chọn nhiều thứ trong tuần + giờ bắt đầu/kết thúc ngay từ lúc tạo lớp — độc lập với phần "lặp lịch" khi ghi buổi học ở Thời khoá biểu. Xác nhận rõ quan hệ 2 luồng này trước khi code (khả năng: tạo lớp fixed → tự sinh buổi lặp theo lịch này).

---

## ══════════════════════════════════════════
## ĐIỀU LUẬT CHO AI — ĐỌC TRƯỚC KHI CAN THIỆP
## ══════════════════════════════════════════

### 🔴 TUYỆT ĐỐI KHÔNG làm những điều sau

1. **KHÔNG tạo bảng DB ngoài `includes/db-schema.php`.**
2. **KHÔNG tính lại học phí `session` bằng cách sửa trực tiếp bảng tuition** — luôn derive từ `wp_hinteach_session_students` + adjustments. Với `course`/`monthly`, ngược lại: số tiền LÀ lưu tĩnh, không được tự ý đổi sang tính động.
3. **KHÔNG gộp logic học sinh và giáo viên vào chung 1 dashboard view.**
4. **KHÔNG code bất kỳ phần nào của quiz-engine ở giai đoạn hiện tại** trừ khi được yêu cầu rõ ràng mở lại — kể cả khi task khác "tiện thể" đụng tới điểm số/type='quiz'.
5. **KHÔNG giả định endpoint/tên field của bản gốc là chuẩn để code theo 1-1** — bản gốc dùng REST API riêng, ta build AJAX WP; chỉ lấy business logic, tự đặt tên theo convention `wp_hinteach_*`.

### 🟡 PHẢI LÀM trước khi sửa

1. Đọc `CLAUDE.md` của folder liên quan trước khi chỉnh file trong folder đó.
2. Khi thêm bảng/cột mới → cập nhật ngay bảng schema trong `includes/CLAUDE.md`.
3. Khi thêm AJAX action mới → cập nhật bảng endpoint trong `includes/CLAUDE.md`.
4. Nếu task chạm tới `billing_mode` → xác nhận đang xử lý ĐÚNG 1 trong 3 chế độ, không viết code dùng chung công thức cho cả 3.

### 🟢 WORKFLOW ĐỀ XUẤT

```
1. Đọc CLAUDE.md root → CLAUDE.md folder liên quan
2. Nếu đụng tới DB: kiểm tra includes/db-schema.php trước
3. Nếu đụng tới quyền: xác nhận capability đúng role, và với assistant — đúng module permission
4. Nếu đụng tới học phí: xác định rõ billing_mode nào đang xử lý
5. Code phần được giao, không refactor phần không liên quan
6. Cập nhật CLAUDE.md tương ứng nếu thêm endpoint/bảng/route mới
```

---

## GIAI ĐOẠN PHÁT TRIỂN (thứ tự ưu tiên — quiz đã đẩy xuống cuối, tạm hoãn)

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Scaffold: `hinteach.php`, `db-schema.php`, roles, shortcode rỗng | Chưa làm |
| 2 | Lớp học + Học sinh (CRUD, 3 billing_mode, phụ thu lúc tạo lớp, import file) | Đang ưu tiên |
| 3 | Thời khoá biểu (buổi học, lặp lịch daily/weekly/monthly, giới hạn 366) | Đang ưu tiên |
| 4 | Học phí (3 công thức, phụ thu/giảm phí, phiếu thu PDF) | Đang ưu tiên |
| 5 | Điểm số + Nhật ký học tập (BTVN dạng %, ý thức dạng text tự do) | Đang ưu tiên |
| 6 | Quản lý tài khoản + license + quyền trợ giảng chi tiết theo module + impersonate | Đang ưu tiên |
| ~~7~~ | ~~Quiz engine~~ | **HOÃN — xem `modules/quiz-engine-DEFERRED/`** |
| 8 | UI/UX/branding | Sau cùng |

---

## VIỆC CÒN THIẾU DỮ LIỆU — CẦN HAR THẬT (đã login + thao tác)

Không suy được từ bundle.js/HTML (chỉ có ở server, không ship ra client):
1. Payload POST/PUT thật khi tạo lớp cả 3 `billingMode` (đặc biệt field `courseStartDate`/`courseEndDate`, cấu trúc `billingPayments` khi qua API)
2. Response khi xác nhận thanh toán cho `course`/`monthly`
3. Validate lỗi phía server (vượt 366 buổi, thiếu field bắt buộc, import quá 500 dòng)

Xem chi tiết hướng dẫn tải HAR ở lịch sử trao đổi trước — tách theo 3 nhóm trên, KHÔNG cần tách theo từng hàm JS riêng lẻ vì HTML+bundle.js đã đủ trả lời phần field/thuật toán.
