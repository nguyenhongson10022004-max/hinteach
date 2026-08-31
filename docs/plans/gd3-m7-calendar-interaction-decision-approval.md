# GĐ3 M7 — Calendar Interaction — Decision Approval Note

**Status:** APPROVED
**Base:** `main` @ `5ea6753` (tag `gd3-m6-completed`)
**Scope:** GĐ3 M7 — Calendar Interaction (Drag Create + Drag Move)
**Verification method:** Owner + Claude tự mở lại `har-gd3-17-dullicate_drag-session.har`, `har-gd3-18-...har`, và grep trực tiếp `app-bundle.js` — không dựa vào tóm tắt trung gian.

---

## Evidence re-verified trực tiếp (2026-08-31)

| Claim | Nguồn verify | Kết quả |
|---|---|---|
| Drag Create payload = giống hệt create thường, `recurrenceGroupId: null` | `POST /api/sessions` trong HAR 18 | ✅ Khớp |
| Drag Move payload = full session object + `updateScope` | `PUT /api/sessions/:id` trong HAR 17 | ✅ Khớp, response `{"scope":"single","updatedCount":1}` |
| `CAL_HOUR_HEIGHT = 44`, `SNAP_MINUTES = 30` dùng chung cho cả 2 thao tác | grep `app-bundle.js` | ✅ Khớp (dòng ~7128, ~8489) |
| `DRAG_THRESHOLD = 6px` | grep `app-bundle.js` | ✅ Khớp |
| `moveSessionByDrag()` luôn gọi `requestRecurrenceScope()` trước update | đọc source `app-bundle.js` dòng 7306-7339 | ✅ Đúng, nhưng hàm tự resolve `'single'` không hỏi nếu `getFollowingRecurringSessions(session).length <= 1` — chỉ hỏi khi thật sự có buổi lặp phía sau |
| Client-side pre-check overlap (`findOverlappingSession`) có logic đặc biệt `overlapMovesTogether` cho scope=following | đọc source dòng 7315-7323 | ✅ Đúng, chi tiết hơn plan gốc mô tả |
| `moveSessionByDrag` không gọi GET-by-id, dùng thẳng `this.sessions` | đọc source + verify response `GET /api/sessions` trong HAR 17 | ✅ Đúng — vì list endpoint của reference trả **full object** (`price, studentIds, content, homeworkContent, generalComment, recurrenceGroupId, recurrenceSequence, studentDetails`), không phải vì họ tối ưu bỏ qua fetch |
| `hinteach_session_list` (BE của HinTeach) chỉ SELECT 10 field nhẹ | **CHƯA verify trong phiên này** — nguồn là checkpoint đọc source ở phiên trước | ⚠️ **Cần grep lại `includes/ajax-schedule.php` thật trước khi implement D-M7-g** — quyết định đó phụ thuộc hoàn toàn vào claim này |

---

## Decision #M7-1 — Calendar coordinate model / Time-grid

**✅ APPROVED — Phương án A: thêm time-grid tối thiểu**, phạm vi chỉ trong view tuần/ngày (`_buildCalendarHtml`, CSS calendar), không đổi API/DB/module khác.

**Lý do chốt lại (không giữ bản "mềm hóa" — chỉ approve nguyên tắc mapping):**
Cơ chế kéo-thả gốc (cả Drag Create lẫn Drag Move) xây hoàn toàn trên một trục pixel↔phút cho toàn bộ ngày (`pxPerMinute`, `CAL_HOUR_HEIGHT`). Một mapping tồn tại "ở tầng logic" nhưng không hiển thị cho người dùng thấy giờ nào tương ứng vị trí nào là vô dụng về mặt UX — người dùng không thể nhắm đúng 08:00 hay 08:30 nếu không có mốc giờ hiển thị. Do đó nguyên tắc "chỉ cần pixel/time mapping, chưa cần khóa time-grid" không đưa ra được target implementable. Chốt cứng Phương án A, giữ đúng constraint: không đổi API, DB, không ảnh hưởng module khác ngoài `schedule.js`/`style.css`.

## Decision #M7-2 — Drag Move trên session thuộc recurrence

**✅ APPROVED** — Reuse `_askScope()`/pattern M4. Auto-fallback về `single` khi không có buổi lặp phía sau (không hỏi thừa), chỉ hỏi khi thật sự có ≥1 buổi following. Khớp hành vi `requestRecurrenceScope()` đã verify.

## Decision #M7-3 — Conflict handling

**✅ APPROVED — server 409 là source of truth cho phase đầu.**
Ghi chú bổ sung sau verify: nếu sau này có thêm client pre-check, cần implement đúng edge case `overlapMovesTogether` (scope=following + overlap cùng `repeat_group_id` + sequence sau không bị coi là conflict) — không chỉ check overlap đơn giản, tránh false-positive khi cả nhóm cùng dời lịch.

## Decision #M7-4 — Rollback UI

**✅ APPROVED** — Không tạo undo state riêng, dùng `_render()` reload từ server sau mọi kết quả API (thành công hoặc lỗi).

## D-M7-g — Drag Move và `hinteach_session_get`

**✅ RESOLVED — APPROVED. Case A xác nhận bằng cách đọc trực tiếp `includes/ajax-schedule.php` (2026-08-31).**

`hinteach_ajax_session_list()` (dòng 80-156) SELECT có chủ đích chỉ:
```
s.id, s.class_id, s.date, s.start_time, s.end_time, s.type,
s.session_name, s.display_color, c.name AS class_name, c.color AS class_color
```
Comment gốc trong code (dòng 119): *"Chỉ SELECT field cần thiết cho M1 — không lấy price/content/repeat_group_id/is_exception"*. Đây là thiết kế có chủ đích (Design Decision D2, dòng 160-161): tách riêng `hinteach_ajax_session_get()` để giữ list nhẹ cho calendar.

`hinteach_ajax_session_get()` (dòng 177-260+) trả `s.*` (toàn bộ cột session) + `class_name/class_color` + danh sách `students` (fee_amount, paid, homework, attitude, individual_comment, note) + `grades` + **`following_count`** đã tính sẵn theo đúng predicate `(repeat_group_id, date, start_time, id)` dùng cho M4.

**Kết luận:** `this._sessions` (state từ list) **thiếu** `price/student_ids/content/homework_content/general_comment/repeat_group_id/following_count`. Drag Move **bắt buộc** gọi `hinteach_ajax_session_get` (action `hinteach_session_get`) để lấy đủ payload + `following_count` (dùng luôn cho quyết định #M7-2, không cần tính lại ở FE) trước khi build update payload và trước khi gọi `_askScope()`.

Gate đã được gỡ — **implementation có thể bắt đầu.**

---

## Final Table

| Decision | Status |
|---|---|
| M7-1 Time-grid (Phương án A) | ✅ Approved (chốt cứng, không mềm hóa) |
| M7-2 Recurrence scope on drag move | ✅ Approved |
| M7-3 Conflict handling (server 409) | ✅ Approved + ghi chú edge case overlapMovesTogether |
| M7-4 Rollback via `_render()` | ✅ Approved |
| D-M7-g `hinteach_session_get` trước update | ✅ Resolved — Case A xác nhận, bắt buộc gọi `hinteach_session_get`, đồng thời lấy luôn `following_count` cho M7-2 |

**✅ READY FOR IMPLEMENTATION — tất cả decision đã resolved, không còn gate nào chặn.**