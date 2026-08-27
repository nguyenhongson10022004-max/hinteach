# assets/ — FRONTEND CONTEXT
> Thuộc plugin `hinteach` | Đọc `../CLAUDE.md` trước file này
> Cập nhật: 2026-08-27 — sửa references cho khớp cấu trúc docs/ mới.

---

## KIẾN TRÚC

Dashboard là SPA nhẹ, KHÔNG dùng React/build step — vanilla JS + AJAX.

```
dashboard-core.js    → HT.api.call(action, payload)   — wrapper fetch tới admin-ajax.php
                     → HT.state                        — state toàn cục (currentUser, currentRole, activeTab)
                     → HT.router                        — chuyển tab, không reload trang

dashboard-shell.js   → render sidebar/topbar theo role (ẩn tab không có quyền — với assistant,
                       ẩn theo TỪNG module bật/tắt riêng, không phải all-or-nothing)
                     → modal system dùng chung (openModal(id), closeModal(id))

modules/*.js         → mỗi file chỉ biết render + xử lý sự kiện cho ĐÚNG 1 domain,
                       gọi HT.api.call(...), không tự ý gọi module khác trực tiếp
                       (phát event qua HT.events.emit/on nếu cần)
```

---

## STATE & QUYỀN TRÊN CLIENT

`HT.state.currentRole` chỉ dùng để ẩn/hiện UI, KHÔNG phải cơ chế bảo mật thật (nằm ở PHP AJAX handler). Với `hinteach_assistant`, ẩn/hiện UI theo **danh sách module được bật** (`HT.state.assistantPermissions`), không phải theo role tĩnh — khớp `assistantPermissionDefinitions()` quan sát từ bản gốc: `dashboard, scheduler, tuition, students, classProfiles`.

---

## MODULE LỚP HỌC (`modules/classes.js`) — 3 CHẾ ĐỘ THU PHÍ

Form tạo/sửa lớp có 4 phần, đúng thứ tự quan sát từ bản gốc:
1. Thông tin lớp: tên, màu (color picker hex)
2. Học phí: chọn `billingMode` (session/course/monthly) → label và field động đổi theo:
   - `session` → hiện "Học phí/buổi"
   - `course` → hiện "Học phí/khóa" + 2 field ngày bắt đầu/kết thúc khóa
   - `monthly` → hiện "Học phí/tháng"
   - Kèm field phụ thu mặc định (tên + mức) ngay trong form này — xem `includes/CLAUDE.md` và `docs/specs/tuition.md` phần quan hệ với `tuition_adjustments`
   - Sau khi lớp đã có buổi học, `billingMode` + phí bị KHOÁ (hiện note cảnh báo), phải sửa riêng theo từng học sinh qua `fee_override`
3. Lịch học: `scheduleType` = `flexible` (mặc định) hoặc `fixed` (chọn thứ trong tuần + giờ bắt đầu/kết thúc)
4. Chọn học sinh: multi-select, có nút tạo nhanh học sinh mới ngay trong modal

**Khi render form/preview học phí, PHẢI dispatch theo đúng `billingMode`** — không dùng chung 1 hàm cho cả 3. Xem công thức chi tiết ở `includes/CLAUDE.md` và `docs/specs/tuition.md`.

---

## MODULE THỜI KHOÁ BIỂU (`modules/schedule.js`) — LẶP LỊCH

3 kiểu tần suất, thuật toán xác nhận từ bundle.js:
- `daily`: mỗi ngày từ ngày bắt đầu đến ngày kết thúc
- `weekly`: chỉ những thứ trong tuần đã chọn (checkbox T2-CN)
- `monthly`: theo "thứ N của tháng" (VD: thứ 3 tuần 2 mỗi tháng) — thuật toán `nthWeekdayOfMonth`, xử lý cả trường hợp tháng không đủ N tuần bằng cách lùi về tuần cuối
- Giới hạn **366 buổi** chặn ngay trong vòng lặp sinh ngày (không chỉ validate sau khi sinh xong) — implement tương tự ở PHP, KHÔNG chỉ chặn ở JS

Mỗi buổi có `type`: `riêng` (1 học sinh) hoặc `chung` (nhóm) — ảnh hưởng màu mặc định khi hiển thị lịch.

---

## ⚡ HIỆU NĂNG FRONTEND — BẮT BUỘC ÁP DỤNG

> Mục tiêu: chạy mượt gần bằng bản gốc (nttclass.onrender.com — static bundle, không PHP chen giữa). Rút kinh nghiệm từ `thiep-builder` (Hinlove) từng bị nặng do enqueue rời rạc.

1. **Build gộp + minify, không thả rời từng file JS.** `dashboard-core.js` + `dashboard-shell.js` build thành 1 bundle lõi duy nhất (esbuild/Vite). Không enqueue 7-8 file JS riêng lẻ như cấu trúc thư mục — cấu trúc file trong repo có thể tách để dễ đọc/maintain, nhưng lúc build ra `assets/dist/` phải gộp lại.
2. **Lazy-load module theo tab đang mở**, dùng `import()` động: bấm "Học phí" mới tải `tuition.js`, chưa bấm thì chưa tải. Giáo viên hiếm khi cần cả 5 module cùng lúc lúc mới mở trang.
3. **Không dùng jQuery.** Toàn bộ vanilla JS như đã định hướng — không kéo thêm `jquery`/`jquery-migrate` làm dependency.
4. **Không hardcode gọi Google Fonts CDN trực tiếp** — tự host file font trong `assets/fonts/`, kèm `font-display: swap`, tránh chặn render như từng gặp ở Hinlove.
5. **Versioning asset bằng `filemtime()`**, không dùng số version cố định (`?ver=1.0`) — để trình duyệt cache đúng và tự invalidate khi file đổi:
   ```php
   wp_enqueue_script('hinteach-dashboard', $url, [], filemtime($path), true);
   ```
6. **`HT.api.call()` không được gọi trùng lặp cho cùng 1 dữ liệu trong 1 lần render tab** — cache tạm trong `HT.state` nếu 2 module cùng cần chung 1 tập dữ liệu (VD: danh sách lớp), tránh gọi AJAX 2 lần cho cùng thông tin.

---

## 🔴 RIÊNG CHO FOLDER NÀY

- **KHÔNG gọi trực tiếp `fetch()`/`jQuery.ajax()` rải rác trong từng module** — luôn qua `HT.api.call()`.
- **KHÔNG hardcode màu/theme trong module JS** — để trống, chờ giai đoạn thiết kế UI sau.
- **KHÔNG viết code cho module quiz/học sinh tự làm bài** ở giai đoạn hiện tại — xem `../CLAUDE.md`.
- **KHÔNG gộp logic hiển thị học phí của 3 billingMode vào 1 hàm render** — tách rõ theo mode, dễ maintain và đúng bản chất khác nhau (tính động vs tính tĩnh).
