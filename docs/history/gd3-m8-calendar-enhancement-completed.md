# GĐ3 M8 — Calendar Enhancement — Completed

**Status:** ✅ COMPLETED
**Date:** 2026-09-04
**Base milestone:** GĐ3 M7 — Calendar Interaction
**Scope:** Calendar Enhancement (Week enhancements, Month View, Recurrence Drag delta, Full-width layout)

---

## 1. Scope

GĐ3 M8 hoàn thiện các tính năng nâng cao cho module Schedule (Thời khoá biểu) nhằm đem lại trải nghiệm quản lý lịch dạy trực quan, tiện lợi và toàn diện:

1. **Recurrence Drag Following Delta**: Hỗ trợ di chuyển chuỗi lịch lặp bằng thao tác kéo thả với ngữ nghĩa độ lệch thời gian (delta).
2. **Session List Payload Exposure**: Bổ sung trường `price` và `repeat_group_id` trong payload danh sách buổi học để hỗ trợ giao diện nâng cao.
3. **Week View Enhancements**: Thêm thanh thống kê 4 card (Tổng buổi, Tổng giờ, 1-1/Lớp học, Tổng tiền), doanh thu ngày trên header, nút "Hôm nay", shell chuyển đổi chế độ xem Tuần/Tháng, icon lặp `↻` và hiển thị học phí trên session block.
4. **Month View**: Cung cấp chế độ xem lịch tháng hoàn chỉnh với lưới 42 ô cố định, thống kê anchor-month, tối đa 3 session pill + nhãn overflow, click xem chi tiết và click chuyển nhanh sang tuần.
5. **Layout & Full-Width Stabilization**: Khắc phục hiện tượng co hẹp 620px từ WordPress block theme, chống co rút flexbox, đồng bộ kích thước toàn giao diện và giữ vững an toàn responsive.

---

## 2. Baseline

- **Tiền đề GĐ3 M7**: Đã hoàn thành time-grid 06:00–24:00, Drag Create, Drag Move đơn lẻ và dialog chọn phạm vi lặp (`single` / `following`).
- **Nhu cầu M8**:
  - Tại M7, Drag Move cho chuỗi `following` tái sử dụng endpoint lưu thông thường (gán giờ tuyệt đối), chưa xử lý độ lệch ngày/giờ (delta) cho các buổi học có lịch giờ khác nhau trong tuần.
  - Chưa có chế độ xem Month View để giáo viên có cái nhìn bao quát cả tháng.
  - Giao diện Week View thiếu các thông tin tài chính (doanh thu ngày, tổng tiền, học phí từng buổi) và trạng thái chuỗi lặp.
  - Giao diện bị co hẹp ngang khi hiển thị bên trong WordPress block theme (Twenty Twenty-Four).

---

## 3. Phase 1 — Recurrence Drag Following Delta

- **Mục tiêu**: Khi kéo thả một buổi học thuộc chuỗi lặp và chọn "buổi này và các buổi sau" (`following`), tất cả các buổi sau phải được dịch chuyển theo đúng độ lệch ngày (`dayDelta`) và độ lệch giờ/phút (`timeDelta`) so với vị trí gốc của buổi bị kéo.
- **Cơ chế**:
  - Frontend gửi cờ `drag_move: true`, cùng `drag_orig_date` và `drag_orig_start_time` lên `wp_ajax_hinteach_session_save`.
  - Backend sử dụng cờ `drag_move` làm discriminator:
    - Nếu `drag_move == true`: Tính toán `dayDelta` và `timeDelta`, duyệt danh sách các buổi học sau và cập nhật:
      - `date = date + dayDelta`
      - `start_time = start_time + timeDelta`
      - `end_time = end_time + timeDelta`
    - Nếu `drag_move == false` (chỉnh sửa từ modal form): Giữ nguyên ngữ nghĩa tuyệt đối (tất cả các buổi sau nhận cùng giờ/phút mà người dùng nhập).
  - **Schedule-only update**: Chỉ cập nhật ngày/giờ trên bảng `wp_hinteach_sessions`, không đồng bộ lại danh sách học sinh.
  - **Transaction an toàn**: Toàn bộ thao tác cập nhật chuỗi diễn ra trong 1 database transaction (all-or-nothing rollback).
  - **Cross-midnight rejection**: Từ chối cập nhật nếu delta làm buổi học vượt quá 24:00 sang ngày hôm sau.
  - **Conflict check**: Kiểm tra trùng lịch độc lập cho từng buổi trong chuỗi.
- **Commit**: `714bf8b`

---

## 4. Phase 2 — Session List Enhancement

- **Mục tiêu**: Cung cấp đầy đủ dữ liệu tài chính và chuỗi lặp cho frontend render các thành phần trực quan.
- **Triển khai**:
  - Cập nhật câu query `wp_ajax_hinteach_session_list` trong `includes/ajax-schedule.php`.
  - Bổ sung `s.price` và `s.repeat_group_id` vào danh sách trường `SELECT`.
  - Giữ nguyên cấu trúc dữ liệu và logic phân quyền lọc theo `teacher_id`.
- **Commit**: `f9446a9`

---

## 5. Phase 3 — Week View Enhancement

- **Mục tiêu**: Nâng cấp giao diện hiển thị tuần với các chỉ số thống kê và điều hướng thuận tiện.
- **Triển khai**:
  - **Summary Cards**: Render thanh 4 thẻ tóm tắt trên đầu lịch:
    - *TỔNG BUỔI*: Tổng số buổi học trong tuần.
    - *TỔNG GIỜ*: Tổng thời lượng dạy (giờ).
    - *1-1/LỚP HỌC*: Phân loại số buổi kèm riêng (`riêng`) và lớp chung (`chung`).
    - *TỔNG TIỀN*: Tổng doanh thu học phí các buổi trong tuần (format VNĐ).
  - **Daily Revenue**: Tính tổng tiền của từng ngày và hiển thị ngay dưới header ngày trong lưới.
  - **Nút "Hôm nay"**: Nút `#ht-cal-today` cho phép quay nhanh về tuần chứa ngày thực tế.
  - **View Switcher Shell**: Cung cấp cụm nút "Tuần / Tháng" chuyển đổi giao diện.
  - **Session Block Visuals**:
    - Hiển thị ký hiệu `↻` ở góc trên bên phải nếu buổi học thuộc chuỗi lặp (`repeat_group_id > 0`).
    - Hiển thị giá tiền định dạng tiền tệ nếu `price > 0`.
- **Commit**: `35dff6b`
- **QA**: Automated QA Phase 3 (8 passed, 0 failed), manual mutation regression đạt chuẩn.

---

## 6. Phase 4 — Month View

- **Mục tiêu**: Xây dựng chế độ xem lịch tháng hoàn chỉnh cho giáo viên.
- **Triển khai**:
  - **Lưới 42 ô cố định**: Thiết kế lưới 7 cột × 6 hàng (bắt đầu từ Thứ Hai), luôn render đủ 42 ô bao gồm cả các ngày đệm lân cận (adjacent) của tháng trước và tháng sau.
  - **Anchor Month Summary**: Thống kê 4 card tóm tắt chỉ tính toán cho các buổi học thuộc đúng tháng đang xem (`anchor month`), loại trừ các buổi thuộc ngày đệm.
  - **Giới hạn 3 session pill & Overflow**: Mỗi ô ngày hiển thị tối đa 3 pill. Khi có từ 4 buổi học trở lên, hiển thị nhãn `+N buổi khác`.
  - **Tương tác**:
    - Click vào session pill: Mở modal xem/sửa chi tiết buổi học.
    - Click vào ô ngày (vùng trống): Tự động chuyển sang Week View chứa ngày đó.
    - Không mở context menu và không hỗ trợ kéo thả trên Month View.
  - **Safe Month Navigation**: Sử dụng `new Date(year, month ± 1, 1)` để tránh lỗi nhảy cóc tháng khi điều hướng vào các ngày cuối tháng (29, 30, 31).
- **Commit**: `46d0145`
- **QA**: Automated QA Phase 4 (12 passed, 0 failed, 2 accepted skips do fixture không có ngày >3 buổi), manual regression (standalone drag move, recurring following delta, drag create) toàn bộ PASS.

---

## 7. Phase 5 — Layout / Full-Width Stabilization

- **Mục tiêu**: Giải quyết triệt để lỗi giao diện Schedule bị co hẹp ngang (~300px) và tối ưu độ rộng full-width trên môi trường WordPress thật.
- **Nguyên nhân cốt lõi phát hiện**:
  - WordPress block theme (Twenty Twenty-Four) tự động áp đặt `max-width: 620px` lên các phần tử con trực tiếp của `.entry-content.is-layout-constrained` và thêm padding ngang `102.4px`.
  - Kết hợp với việc `.ht-main` trừ đi 240px sidebar, toàn bộ lịch bị co lại thành một cột hẹp và để trống khoảng lớn bên phải.
- **Giải pháp triển khai**:
  - Unconstrain WordPress content container có chọn lọc thông qua:
    `body.page-template-hin-teach-full-width .entry-content`, `.entry-content:has(#hinteach-app)`, `.wp-block-post-content:has(#hinteach-app)`.
  - Thiết lập `#hinteach-app.ht-app` chiếm trọn vẹn 100% viewport (`width: 100% !important; max-width: 100% !important; margin: 0 !important;`).
  - Áp dụng `min-width: 0; width: calc(100% - var(--ht-sidebar-width));` trên `.ht-main` để triệt tiêu flex auto min-width.
  - Thiết lập `width: 100%; min-width: 0;` đồng bộ trên `.ht-content`, `.ht-module`, toolbar, summary cards và calendar grid.
  - Tinh chỉnh nút icon điều hướng tròn 32×32px, summary cards chuyển sang 2×2 dưới 900px, thêm `:focus-visible` accessibility.
  - Giữ vững các safeguard thanh cuộn ngang cục bộ: Week View (888px) và Month View (768px), không tạo thanh cuộn ngang cấp trang (`body`).
- **Commit**: `7f7a373`
- **QA**: Live browser inspection trên các độ phân giải 1920px, 1440px, 1280px, 1024px đều PASS; Classes và Students layout ổn định; Tuition và Grades render router error fallback an toàn mà không bị co sụp layout hay crash trang (không claim tính đúng đắn nghiệp vụ); không có lỗi horizontal overflow.

---

## 8. Important Design Decisions

1. **Phân biệt Drag Following vs Edit Following**:
   - Thao tác kéo thả (drag) là tương tác không gian/thời gian trực tiếp trên lịch → di chuyển theo delta là trực quan nhất.
   - Thao tác sửa từ form modal là nhập liệu số liệu cụ thể → áp dụng giờ tuyệt đối cho toàn chuỗi theo đúng dữ liệu người dùng nhập.
2. **Ma trận 42 ô cố định cho Month View**:
   - Tránh việc lưới lịch bị thay đổi 5 hàng / 6 hàng làm giật chiều cao giao diện khi chuyển đổi giữa các tháng khác nhau trong năm.
3. **Phạm vi thống kê Anchor-month**:
   - Thống kê tháng chỉ phản ánh đúng số liệu của tháng đang xem, không bị sai lệch bởi các buổi học hiển thị hộ trên các ngày đệm lân cận.
4. **Không hỗ trợ kéo thả trên Month View**:
   - Ô tháng có không gian nhỏ, không có trục giờ 24h chi tiết; thao tác kéo thả chỉ có ý nghĩa trên time-grid của Week View.
5. **Giới hạn phạm vi Phase 5**:
   - Phase 5 tập trung vào ổn định layout full-width và chống co rút CSS cho Calendar; không biến thành đợt redesign toàn diện hệ thống.

---

## 9. Backend / Schema Impact

- **Database Schema**: Hoàn toàn **KHÔNG** thay đổi bảng hay thêm migration nào trong M8.
- **Backend AJAX**:
  - `wp_ajax_hinteach_session_save`: Thêm xử lý cờ `drag_move` cho nhánh `following`.
  - `wp_ajax_hinteach_session_list`: Bổ sung `price` và `repeat_group_id` trong câu `SELECT`.
  - Toàn bộ Phase 3, Phase 4, Phase 5 không thêm endpoint backend mới.

---

## 10. Files Changed

### Backend (PHP)
- `includes/ajax-schedule.php` (Phases 1 & 2)

### Frontend (JavaScript & CSS)
- `assets/modules/schedule.js` (Phases 1, 2, 3, 4)
- `assets/style.css` (Phases 3, 4, 5)

### Build
- `assets/dist/` (Tự động biên dịch qua `npm run build`)

---

## 11. QA / Regression Evidence

| Hạng mục test | Kết quả | Ghi chú |
|---|---|---|
| **Playwright QA Phase 3** | 8 passed, 0 failed | Read-only & Week View components |
| **Playwright QA Phase 4** | 12 passed, 0 failed | Month View matrix, navigation, pill render |
| **Accepted QA Skips** | 2 skipped | P4-8 và P4-11 (do database test chưa có ngày >3 buổi) |
| **Manual Mutation TC-M1** | PASS | Standalone Week drag move |
| **Manual Mutation TC-M2** | PASS | Recurring Following drag delta shift |
| **Manual Mutation TC-M3** | PASS | Week drag create |
| **Phase 5 Layout 1920px** | PASS | Main 1680px, Grid 1632px, no body scroll |
| **Phase 5 Layout 1440px** | PASS | Main 1200px, Grid 1152px, no body scroll |
| **Phase 5 Layout 1280px** | PASS | Main 1040px, Grid 992px, no body scroll |
| **Phase 5 Layout 1024px** | PASS | Main 784px, Week 888px local scroll, Month 768px local scroll |
| **Cross-module Smoke** | PASS | Classes và Students layout ổn định; Tuition và Grades render router error fallback an toàn, không sập layout hay crash trang (không claim nghiệp vụ) |

---

## 12. Known Non-Blocking Limitations

1. **Thiếu fixture >3 buổi/ngày**: Môi trường test tự động hiện tại chưa có dữ liệu mẫu ngày >3 buổi để tự động trigger nhãn `+N buổi khác`, các test case liên quan được tạm skip nhưng logic hiển thị đã được code review xác nhận.
2. **Giao diện tổng thể HinTeach**: Visual hiện tại theo phong cách tối giản, đáp ứng đúng nghiệp vụ và layout responsive. Công việc redesign toàn diện UI/UX / Design System được bảo lưu cho giai đoạn chuyên trách tương lai.
3. **Không chặn tiến độ**: Các giới hạn trên không ảnh hưởng đến tính đúng đắn của logic nghiệp vụ hay độ ổn định của hệ thống.

---

## 13. Commit References

- `714bf8b` — feat(schedule): add recurrence drag following delta
- `f9446a9` — feat(schedule): expose price and recurrence in session list
- `35dff6b` — feat(schedule): enhance week calendar view
- `46d0145` — feat(schedule): add month calendar view
- `7f7a373` — style(schedule): stabilize full-width calendar layout

---

## 14. Final Status

**GĐ3 M8 COMPLETE**
