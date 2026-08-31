Xác nhận — file ajax-schedule.php không nằm trong bộ upload lần này (chỉ có checkpoint mô tả lại nó), nên bước grep đó tôi không tự làm được ở đây, cần chạy trong môi trường có source HinTeach thật (Antigravity hoặc máy bạn). Tôi sẽ khóa câu đó vào note để dev không lách qua được.

Edited a file, ran a command, read a file

Đã thêm gate cứng vào cuối file. Sẵn sàng để bạn:

git add docs/decisions/gd3-m7-calendar-interaction-decision-approval.md
git commit -m "docs: approve gd3 m7 calendar interaction decisions (pending D-M7-g verify)"

Còn đúng 1 việc trước khi đưa Antigravity implement: grep hinteach_ajax_session_list() trong includes/ajax-schedule.php thật, xác định Case A/B, rồi mới mở khóa D-M7-g và bắt đầu code.

Gd3 m7 calendar interaction decision approval
Document · MD 
ajax-schedule.php
PHP
Ran a command, viewed a file

Case A xác nhận rõ ràng — không phải suy đoán từ checkpoint nữa, mà đọc thấy tận mắt trong code. SELECT của hinteach_ajax_session_list():

s.id, s.class_id, s.date, s.start_time, s.end_time, s.type,
s.session_name, s.display_color, c.name AS class_name, c.color AS class_color

Đúng comment trong code (dòng 119): "Chỉ SELECT field cần thiết cho M1 — không lấy price/content/repeat_group_id/is_exception". Đây là thiết kế có chủ đích (D2, dòng 160-161), không phải sơ suất — họ tách riêng hinteach_ajax_session_get() để lấy đủ field cho modal Sửa, giữ list nhẹ cho calendar.

Check hinteach_ajax_session_get response fields more closely to confirm it returns everything Drag Move needs

Case A hoàn toàn xác nhận. Bổ sung: hinteach_ajax_session_get() (dòng 192-260) trả s.* (toàn bộ cột) + class_name/class_color + students + grades + following_count tính sẵn — tức là đã có đủ mọi field cần cho update payload, kể cả following_count mà D-M7-2 (hỏi scope) cần dùng. Cập nhật note và khóa D-M7-g: