# HINTEACH — ROOT CONTEXT
> Plugin: `hinteach` | Kiến trúc tham chiếu: `thiep-builder` (Hinlove) | v0.2.0-scaffold
> Cập nhật: 2026-08-27 — tái cấu trúc tài liệu, xác minh trạng thái từ code/git thật.

---

## THỨ TỰ SOURCE OF TRUTH

1. **Code hiện tại** (và `git log`) — bằng chứng cuối cùng nếu tài liệu lệch.
2. **`STATUS.md`** — nguồn DUY NHẤT về trạng thái hiện tại (GĐ nào COMPLETED/NOT STARTED/DEFERRED).
3. **`docs/specs/`** — business rules, data rules, permissions, edge cases.
4. **`CLAUDE.md`** (file này) — kiến trúc tổng, conventions, điều luật.
5. **`docs/history/`** — tài liệu lịch sử, chỉ dùng hiểu quá khứ.

Nếu tài liệu lịch sử mâu thuẫn với code hiện tại → code hiện tại thắng.

---

## MỤC ĐÍCH

HinTeach là nền tảng **quản lý lớp học cá nhân cho giáo viên** (tái dựng lại từ project cũ của team, đi theo kiến trúc plugin WordPress giống Hinlove). Giáo viên quản lý học sinh, lớp học, thời khoá biểu, học phí, điểm số, nhật ký học tập.

**⏸️ HOÃN LẠI: module bài tập trắc nghiệm (quiz-engine) và tài khoản học sinh tự làm bài.**
Xem `modules/quiz-engine-DEFERRED/SPEC.md` — giữ nguyên spec cũ để dùng lại sau, KHÔNG code phần này ở giai đoạn hiện tại dù được yêu cầu tiện thể.

**Giai đoạn hiện tại:** tái hiện đầy đủ FUNCTION/LOGIC trước. Giao diện, màu sắc, logo, branding thiết kế lại sau — KHÔNG ưu tiên pixel-perfect UI, ưu tiên đúng nghiệp vụ và đúng dữ liệu.

**Stack:** WordPress + Custom Plugin + Custom DB tables (không dùng WooCommerce).

> ⚠️ **Lưu ý kiến trúc quan trọng:** bản gốc (nttclass.onrender.com) chạy REST API JSON riêng, KHÔNG phải WordPress. Nội bộ code gốc đặt tên class là `PinkyClassApp`. Việc build lại thành WP plugin (`wp_ajax_*` + `$wpdb`) là QUYẾT ĐỊNH KIẾN TRÚC CỦA TA, không phải port nguyên. Khi đối chiếu bundle.js/HAR của bản gốc, chỉ lấy **field/logic nghiệp vụ**, tự map lại sang pattern AJAX + `wp_ntt_*` bên dưới — không cố match tên endpoint 1-1.

---

## CẤU TRÚC PLUGIN

```
hinteach/
├── hinteach.php                    ★ Main file — constants, activation (dbDelta), roles, enqueue
├── CLAUDE.md                      ← FILE NÀY (đọc trước tiên, luôn luôn)
├── STATUS.md                      ← Trạng thái duy nhất — GĐ nào done/chưa/deferred
│
├── docs/
│   ├── development.md             Cách chạy local, quy trình dev, tài khoản test
│   ├── specs/
│   │   ├── students-classes.md    Business rules: CRUD lớp/học sinh, import, billing_mode
│   │   ├── schedule.md            Business rules: buổi học, lặp lịch, repeat_group_id
│   │   ├── tuition.md             Business rules: 3 công thức học phí, phụ thu/giảm phí
│   │   └── grades-journal.md      Business rules: điểm số, BTVN %, ý thức, nhật ký
│   └── history/
│       └── phase-1-2-completed.md Lịch sử GĐ1+2 (COMPLETED — không implement lại)
│
├── assets/
│   ├── CLAUDE.md                  ← Context cho JS/CSS
│   ├── dashboard-core.js          Core: state, routing, API client (fetch AJAX)
│   ├── dashboard-shell.js         UI: sidebar, topbar, tab panels, modals, responsive
│   ├── modules/
│   │   ├── classes.js             CRUD lớp học (3 billingMode: session/course/monthly)
│   │   ├── students.js            CRUD học sinh, import file
│   │   ├── schedule.js            Thời khoá biểu, lặp lịch
│   │   ├── tuition.js             Học phí, phiếu thu, phụ thu/giảm phí
│   │   └── grades.js              Điểm số, nhật ký học tập
│   └── style.css
│
├── includes/
│   ├── CLAUDE.md                  ← Context cho backend PHP
│   ├── db-schema.php              ★ dbDelta() — TẤT CẢ bảng, chạy khi activate
│   ├── roles-capabilities.php     Role + capability + quyền trợ giảng chi tiết
│   ├── shortcodes.php             [hinteach_dashboard] — render SPA theo role
│   ├── ajax-classes.php           AJAX: CRUD lớp học
│   ├── ajax-students.php          AJAX: CRUD học sinh + import
│   ├── ajax-schedule.php          AJAX: buổi học, lặp lịch
│   ├── ajax-tuition.php           AJAX: học phí, phiếu thu, phụ thu/giảm phí
│   ├── ajax-grades.php            AJAX: điểm số, nhật ký
│   ├── pdf-export.php             Xuất phiếu học phí PDF/ảnh
│   └── admin/
│       └── license.php            Hạn sử dụng tài khoản
│
└── modules/
    └── quiz-engine-DEFERRED/      ← HOÃN, giữ spec, không code bây giờ
        └── SPEC.md
```

---

## ⚡ HIỆU NĂNG — MỤC TIÊU BẮT BUỘC

Mục tiêu: chạy mượt gần bằng bản gốc. Rút kinh nghiệm từ `thiep-builder` (Hinlove) từng bị chậm.

**Chi tiết bắt buộc đọc trước khi code:**
- Frontend (bundle/minify, lazy-load module, không jQuery, font tự host) → `assets/CLAUDE.md` mục "⚡ HIỆU NĂNG FRONTEND".
- Backend (enqueue có điều kiện, dọn hook WP thừa, cache transient, index DB) → `includes/CLAUDE.md` mục "⚡ HIỆU NĂNG BACKEND".

**Quyết định site riêng biệt:** HinTeach chạy trên 1 WordPress + domain + database HOÀN TOÀN riêng, KHÔNG chung site với `hinlove.store`. Chỉ cài đúng 1 plugin (`hinteach`) trên site này.

---

## PHÂN QUYỀN (ROLES)

| Role | Capability chính | Xem được gì |
|---|---|---|
| `hinteach_admin` | `manage_hinteach_all` | Toàn bộ tài khoản, hạn sử dụng, mọi lớp, impersonate |
| `hinteach_teacher` | `manage_hinteach_classes` | Lớp/học sinh/buổi học/học phí/điểm do mình phụ trách |
| `hinteach_assistant` | quyền CHI TIẾT theo từng module | Chỉ module được giáo viên bật, KHÔNG all-or-nothing |

> **Xác nhận từ bundle.js:** quyền trợ giảng có danh sách bật/tắt riêng từng mục:
> `dashboard, scheduler, tuition, students, classProfiles`. Thiết kế bảng `hinteach_assistant_permissions` (assistant_user_id, module_key, enabled) thay vì 1 role tĩnh.

**Bỏ role `hinteach_student` khỏi phạm vi hiện tại** (gắn với quiz-engine đang hoãn).

---

## NGUYÊN TẮC DỮ LIỆU

1. **Không dùng `wp_postmeta`/`wp_usermeta` cho dữ liệu quan hệ** — dùng custom DB tables (`wp_hinteach_*`).
2. **Mọi bảng đều có `deleted_at` (soft delete)**.
3. **`session_id` là trung tâm tính học phí — NHƯNG CHỈ KHI `billing_mode = 'session'`.** Với `course`/`monthly`, học phí là số cố định, KHÔNG derive từ session — xem `docs/specs/tuition.md`.
4. **Lặp lịch** — khi sửa 1 buổi trong chuỗi lặp, luôn hỏi "chỉ buổi này" hay "buổi này và các buổi sau", KHÔNG tự động áp dụng cho toàn chuỗi.

---

## 🔴 PHÁT HIỆN QUAN TRỌNG TỪ BUNDLE.JS — BẮT BUỘC ÁP DỤNG

### 1. Lớp học có 3 chế độ thu phí hoàn toàn khác nhau
```
billing_mode = 'session'   → Học phí = Σ (buổi đã học × phí/buổi), TÍNH ĐỘNG
billing_mode = 'course'    → Học phí = 1 khoản CỐ ĐỊNH cho cả khóa
billing_mode = 'monthly'   → Học phí = 1 khoản CỐ ĐỊNH mỗi THÁNG
```
Chi tiết công thức → `docs/specs/tuition.md`.

### 2. Chế độ `session`: nếu 1 buổi có nhiều học sinh, phí có thể CHIA ĐỀU
Không có `fee_override` riêng → `phí = session.price / số HS đang trả tiền buổi đó`.

### 3. Lớp học có thể có phụ thu ngay lúc tạo lớp
Quan hệ với `tuition_adjustments` → xem `docs/specs/tuition.md`.

### 4. Lịch cố định chọn nhiều thứ trong tuần ngay từ lúc tạo lớp
Quan hệ với lặp lịch → xem `docs/specs/schedule.md`.

---

## ══════════════════════════════════════════
## ĐIỀU LUẬT CHO AI — ĐỌC TRƯỚC KHI CAN THIỆP
## ══════════════════════════════════════════

### 🔴 TUYỆT ĐỐI KHÔNG làm những điều sau

1. **KHÔNG tạo bảng DB ngoài `includes/db-schema.php`.**
2. **KHÔNG tính lại học phí `session` bằng cách sửa trực tiếp bảng tuition** — luôn derive từ `session_students` + adjustments. Với `course`/`monthly`, số tiền LÀ lưu tĩnh, không tự ý đổi sang tính động.
3. **KHÔNG gộp logic học sinh và giáo viên vào chung 1 dashboard view.**
4. **KHÔNG code bất kỳ phần nào của quiz-engine ở giai đoạn hiện tại** trừ khi được yêu cầu rõ ràng mở lại.
5. **KHÔNG giả định endpoint/tên field của bản gốc là chuẩn để code theo 1-1** — chỉ lấy business logic, tự đặt tên theo convention `wp_hinteach_*`.

### 🟡 PHẢI LÀM trước khi sửa

1. Đọc `CLAUDE.md` của folder liên quan trước khi chỉnh file trong folder đó.
2. Khi thêm bảng/cột mới → cập nhật ngay bảng schema trong `includes/CLAUDE.md`.
3. Khi thêm AJAX action mới → cập nhật bảng endpoint trong `includes/CLAUDE.md`.
4. Nếu task chạm tới `billing_mode` → xác nhận đang xử lý ĐÚNG 1 trong 3 chế độ.

### 🟢 WORKFLOW ĐỀ XUẤT

```
1. Đọc CLAUDE.md root → CLAUDE.md folder liên quan → docs/specs/ phù hợp
2. Nếu đụng tới DB: kiểm tra includes/db-schema.php trước
3. Nếu đụng tới quyền: xác nhận capability đúng role, và với assistant — đúng module permission
4. Nếu đụng tới học phí: xác định rõ billing_mode nào đang xử lý
5. Code phần được giao, không refactor phần không liên quan
6. Cập nhật CLAUDE.md tương ứng nếu thêm endpoint/bảng/route mới
7. Cập nhật STATUS.md nếu trạng thái module thay đổi
```

---

## PRE-DEPLOY CHECKLIST

Trước khi deploy, review code theo các mục sau:

### Phạm vi
- File nào bị sửa? Hàm/action nào thay đổi?
- Có code quiz-engine bị lẫn vào không? → Nếu CÓ: dừng, xác nhận lại.

### Dữ liệu & DB
- Có tạo bảng/cột ngoài `db-schema.php` không? → Vi phạm.
- Có xoá cứng thay vì soft delete không? → Vi phạm.

### Phân quyền
- AJAX handler có filter theo teacher_id sở hữu không? → Nếu KHÔNG: vi phạm nghiêm trọng.
- Với trợ giảng: có check đúng `assistant_permissions` theo module_key không? → Nếu chỉ check role: vi phạm.

### Học phí (nếu sửa ajax-tuition.php)
- Có XÁC ĐỊNH RÕ đang xử lý billing_mode nào? → Áp 1 mode cho cả 3: vi phạm.
- Mode `session` có lưu tĩnh? → Vi phạm.
- Mode `course`/`monthly` có tính động từ buổi? → Vi phạm.
- `fee_override` đúng thứ tự ưu tiên, chỉ mode `session`?

### Lịch lặp (nếu sửa ajax-schedule.php)
- Có hỏi "chỉ buổi này" / "buổi này và sau"?
- Có động vào buổi đã qua?
- Giới hạn 366 buổi chặn ở server (không chỉ client)?

---

## DEPLOYMENT — PRODUCTION ZIP

Source repo và production ZIP là hai thứ khác nhau.

**Production ZIP LOẠI TRỪ:**
- `.git/`, `.github/`, `node_modules/`, `docs/`, `tests/`
- `STATUS.md`, `CLAUDE.md`, `AI_TASK_*.md`, `HANDOFF_*.md`, `IMPLEMENTATION_PLAN.md`, `PROMPTS.md`
- `package.json`, `package-lock.json`, `composer.json`, `composer.lock`
- `build.mjs`, source map không cần production

**Production ZIP GIỮ:**
- `vendor/` — Composer autoload dùng thật lúc runtime (`file-parser.php` gọi `vendor/autoload.php`)
- `assets/dist/` — bundle JS thật sự được load
- `hinteach.php`, `includes/`, `assets/style.css`, `assets/modules/` (source, nếu cần debug)
- `modules/` (nếu có code thật, hiện chỉ có spec)

---

## GIAI ĐOẠN PHÁT TRIỂN

Xem `STATUS.md` cho trạng thái chi tiết. Tóm tắt:

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Scaffold | ✅ COMPLETED |
| 2 | Lớp học + Học sinh | ✅ COMPLETED |
| 3 | Thời khoá biểu | ❌ Not started |
| 4 | Học phí | ❌ Not started |
| 5 | Điểm số + Nhật ký | ❌ Not started |
| 6 | Tài khoản + License | ❌ Not started |
| ~~7~~ | ~~Quiz engine~~ | **⏸️ DEFERRED** |
| 8 | UI/UX/branding | Sau cùng |
