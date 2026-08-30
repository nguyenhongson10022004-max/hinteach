# GĐ3 M4 — Decision Approval Note

Tài liệu này chốt các quyết định còn mở trong GD3-M4-edit-delete-recurrence-plan.md, dựa trên review của owner ngày 2026-08-30.

Vai trò: ghi nhận quyết định, không phải code. Sau khi note này được lưu vào repo (docs/plans/), M4 mới được phép bắt đầu implement.

Không có quyết định nào trong note này tự suy ra thêm ngoài evidence đã có ở plan gốc — chỉ chốt lựa chọn giữa các option Claude đã trình bày.

## 1. Bảng quyết định chính thức

| ID | Quyết định CHỐT | Evidence label đúng | Ghi chú |
|---|---|---|---|
| D1 | Đổi thuật ngữ scope trong includes/CLAUDE.md từ this/this_and_future sang single/following | [HINTEACH DESIGN DECISION] — đồng bộ nội bộ, không phải HAR | Sửa doc trước khi code, theo đúng PRE-DEPLOY CHECKLIST của CLAUDE.md root |
| D2 | Chọn Option B: thêm action mới hinteach_session_get (GET theo id), không mở rộng SELECT của hinteach_session_list | [HINTEACH DESIGN DECISION] | Lý do owner: giữ session_list nhẹ cho calendar render; session_get tạo boundary rõ cho M5 (quick-entry/journal/score) tái sử dụng sau này. Action này chỉ phục vụ lấy chi tiết session hiện tại. Không thay đổi contract của hinteach_session_list và hinteach_session_save_recurring. Không thêm field database mới. |
| D3 | M4 chỉ cho sửa cột price ở mức tối giản (validate >= 0, giống M2). Không implement pricingChanged/preservePaidFee/repriceExistingFees/fee_amount auto-reprice | [HINTEACH DESIGN DECISION] | Không đụng session_students.fee_amount, không đụng payment/billing — để dành GĐ4 |
| D4 | Xoá dùng confirm() dialog đơn giản, không làm UX "hoàn tác 3 giây" | [HINTEACH DESIGN DECISION] | Thuần UX, không ảnh hưởng API contract |
| D5 | Kéo-thả di chuyển buổi (drag-to-move) nằm ngoài M4 | [HINTEACH DESIGN DECISION] | Xem thêm ràng buộc bổ sung ở Mục 2 bên dưới |
| D6 | Không implement "biến buổi đơn thành buổi lặp lúc sửa" (createRepeatDates trong edit) | [HINTEACH DESIGN DECISION] | Nếu cần, làm milestone riêng, tái dùng hinteach_session_save_recurring đã có |
| D7 | CÓ conflict check (409) khi sửa buổi (edit), áp dụng cho cả single lẫn following | [HINTEACH DESIGN DECISION] — KHÔNG được ghi là [HAR CONFIRMED] | HAR chỉ xác nhận 409 ở create/batch-create (HAR 3.6). Conflict-on-edit là mở rộng nội bộ, lý do: nhất quán với nguyên tắc 5b đã chốt cho single-create, và tránh double-booking khi dịch chuyển giờ cả chuỗi |
| D8 | Overlap check áp dụng cho toàn bộ tập session trong scope following (không chỉ buổi anchor), theo pattern all-or-nothing giống session_save_recurring (M3) | [HINTEACH DESIGN DECISION] — KHÔNG được ghi là [HAR CONFIRMED] | Bundle gốc chỉ check 1 lần cho buổi anchor — HinTeach chủ động làm chặt hơn tham khảo vì lý do an toàn dữ liệu |
| (bổ sung) | Đổi màu (display_color propagate current+following) không nằm trong M4 | [HINTEACH DESIGN DECISION] | Tách thành milestone riêng nếu cần (đề xuất đặt tên M4.2 hoặc gộp sau, xem Mục 3) |

**Lưu ý:** D7/D8 là quyết định thiết kế của HinTeach. Không được ghi chú hoặc commit message dưới dạng "HAR confirmed".

## 2. Ràng buộc bổ sung — khoá scope khỏi drag-to-move

Theo yêu cầu review của owner, bổ sung rõ vào Non-goals của M4 (không chỉ "không implement drag-to-move" mà còn):

Không mở rộng API hinteach_session_save (update) hoặc hinteach_session_delete với bất kỳ tham số/behavior nào chỉ để phục vụ kéo-thả trên lịch, dù về mặt kỹ thuật 2 action này có thể tái dùng được cho drag-drop (bundle gốc dùng chung updateScope/overlap logic cho cả edit-form và moveSessionByDrag).

Lý do ghi rõ: nếu không khoá, rất dễ có tình huống dev sau này thấy "đã có update API rồi, thêm field vào cho drag-drop luôn" → làm phình API contract của M4 ra ngoài phạm vi đã duyệt mà không qua review riêng. Nếu tương lai muốn làm drag-to-move, phải mở review/plan riêng — kể cả khi tái dùng lại đúng 2 action này.

## 3. Tác động lên Plan gốc (GD3-M4-edit-delete-recurrence-plan.md)

Các phần sau của plan gốc cần cập nhật khi chuyển sang implementation, theo đúng quyết định đã chốt ở Mục 1 — liệt kê ở đây để dev thực hiện đối chiếu, chưa sửa file plan gốc trong bước này (giữ plan gốc làm hồ sơ evidence nguyên trạng; note này là lớp quyết định chồng lên):

- **Mục 9.4** (Backend changes — field chi tiết session): chốt theo D2 → cần thêm mô tả action mới hinteach_session_get:
  - Input: session_id.
  - Output: đủ field cho modal Sửa — id, class_id, date, start_time, end_time, price, type, session_name, content, homework_content, general_comment, display_color, repeat_group_id, is_exception, student_ids[], studentDetails{} (tên field theo đúng convention cột đã có trong db-schema.php, không thêm field mới).
  - Ownership check giống các action khác (teacher_id, deleted_at IS NULL).
  - Đăng ký add_action('wp_ajax_hinteach_session_get', ...).
- **Mục 11** (API Contract): thêm block cho hinteach_session_get (GET) như trên; giữ nguyên phần hinteach_session_save (update) và hinteach_session_delete đã mô tả, nhưng conflict-409 giờ là chính thức trong scope (D7), không còn "chờ duyệt".
- **Mục 12** (Validation Rules): conflict check bắt buộc cho cả single và following (D7); với following, check theo toàn bộ tập freeze (D8), all-or-nothing — không update/xoá phần nào nếu có bất kỳ session nào trong tập bị conflict.
- **Mục 13** (Test cases #5, #6): đổi từ "nếu #D7/#D8 approved" → bắt buộc test, không còn điều kiện. Thêm 1 case: hinteach_session_get trả đúng field, ownership check đúng, session đã xoá trả 404.
- **Mục 14** (Commit Strategy): thêm 1 commit backend cho hinteach_session_get (đặt trước commit UPDATE, vì frontend cần gọi action này trước khi mở modal Sửa).
- **Non-goals**: bổ sung nguyên văn ràng buộc ở Mục 2 note này (khoá API khỏi drag-to-move).
- **Decision Log gốc**: đánh dấu D1–D8 + mục đổi màu là RESOLVED, giữ nguyên nội dung cũ làm lịch sử, không xoá.

## 4. Trạng thái

- Không cần reverse-engineer thêm HAR cho các hành vi đã nằm trong scope:
  - update single
  - update following
  - delete single
  - delete following

- `hinteach_session_get` là [HINTEACH DESIGN DECISION] theo D2, được chọn làm giải pháp kiến trúc để phục vụ modal Sửa và khả năng tái sử dụng cho các milestone sau. Đây không phải hành vi được xác nhận từ HAR.

- Evidence hiện tại đủ để chuyển sang implementation với scope đã duyệt.

Plan được duyệt để chuyển sang implementation, với điều kiện: mọi rule thuộc D7/D8 phải được code-comment đúng nhãn [HINTEACH DESIGN DECISION] (không ghi nhầm thành HAR CONFIRMED trong docstring/comment khi code thật — đúng tinh thần "no assumption dressed as evidence" mà project đang giữ xuyên suốt M2/M3/M4).

Bước tiếp theo đề xuất: lưu note này vào docs/plans/gd3-m4-decision-approval.md trong repo, sau đó mới giao code M4 theo đúng trình tự Commit Strategy đã cập nhật ở Mục 3.