# GĐ3 M5 — Decision Approval Note

Status: APPROVED

Approved date: 2026-08-31

Milestone:

GĐ3 M5 — Quick Entry / Session Record / Score

Based on:

- docs/plans/gd3-m5-quick-entry-plan.md
- HAR 3.10 session-journal-score analysis
- current HinTeach architecture


---

# Decision Log


## D1 — Quick Entry API boundary

### Question

Quick-entry nên:

- gộp vào `hinteach_session_save`
- hay tạo action riêng?


### Evidence

[HAR CONFIRMED]

nttclass sử dụng:


PUT /api/sessions/:id/quick-entry


Quick-entry chứa:

- content
- homeworkContent
- generalComment
- studentDetails
- scoreGroups


[HINTEACH DESIGN DECISION]

HinTeach hiện có:

- session update scope: single/following
- recurrence lifecycle

Quick-entry không được propagate sang recurrence.


### Proposal

Tạo action riêng:


hinteach_session_quick_entry


Không dùng:


hinteach_session_save



### Owner Decision

Status:

APPROVED

Decision:

Tạo action riêng:

hinteach_session_quick_entry

Không gộp vào hinteach_session_save.


---

# D2 — Score write location


### Question

Score tạo từ quick-entry ghi ở đâu?


Options:

A.

ajax-grades.php


B.

ajax-schedule.php


### Evidence

[HINTEACH DESIGN DECISION]

`wp_hinteach_grades.session_id` đã được chuẩn bị cho quick-entry GD3.


### Proposal

Quick-entry ghi trực tiếp:


ajax-schedule.php


vào:


wp_hinteach_grades



### Owner Decision

Status:

APPROVED

Decision:

Quick-entry ghi trực tiếp vào wp_hinteach_grades
thông qua ajax-schedule.php.

Không sử dụng ajax-grades.php trong M5.


---

# D3 — scoreType schema


### Question

HAR quan sát:


scoreType = "BTVN"


Nhưng schema hiện tại:


wp_hinteach_grades.type

ENUM(
homework,
test,
final
)



Có conflict.


### Options


## Option A

Đổi:


type ENUM


thành:


VARCHAR



Ưu:

- linh hoạt
- đúng UI thực tế


Nhược:

- mất taxonomy cố định


---

## Option B

Giữ:


type ENUM


Thêm:


score_type_label VARCHAR



Ví dụ:


type = homework

score_type_label = BTVN



Ưu:

- giữ phân loại hệ thống
- hỗ trợ GĐ5 analytics


### Owner Decision

Selected option:

Option B

Status:

APPROVED

Decision:

Chọn Option B.

Giữ:

wp_hinteach_grades.type ENUM(homework,test,final)

Thêm:

score_type_label VARCHAR(100)

Mapping:

type dùng cho hệ thống.

score_type_label lưu tên hiển thị tự do từ giáo viên.


---

# D4 — testGroupId


### Question

Có cần thêm:


test_group_id


vào database không?


### Evidence

[HAR CONFIRMED]

Server tạo:


session:<sessionId>



Nhưng chỉ có 1 mẫu HAR.


### Proposal

Không thêm column trong M5.

M5 chỉ lưu:


session_id


GĐ5 xử lý:

- group test
- edit group
- delete group


### Owner Decision

Status:

APPROVED

Decision:

Không thêm test_group_id trong GĐ3 M5.

M5 chỉ tạo grade records gắn session_id.

Quản lý test group lifecycle để GĐ5 xử lý.


---

# D5 — Quick-entry response


### Question

API có trả score records vừa tạo không?


### Evidence

HAR:

server tham khảo không trả.

Client phải GET lại:


/api/scores



### Proposal

HinTeach trả:


created_scores[]



để giảm request thừa.


### Owner Decision

Status:

APPROVED

Decision:

API quick-entry trả created_scores[] sau khi tạo thành công.


---

# D6 — Empty score entry


### Question

Nếu:


scoreValue = null


thì xử lý thế nào?


### Proposal

Không tạo grade record.


Chỉ lưu entry có điểm hợp lệ.


### Evidence

[BUNDLE CONFIRMED]

Client chỉ gửi group khi:


hasAnyScore = true



### Owner Decision

Status:

APPROVED

Decision:

Entry không có scoreValue hợp lệ không tạo grade record.

Chỉ lưu các entry có điểm hợp lệ.


---

# D7 — feeAmount / paid


### Question

Quick-entry có được sửa học phí không?


### Evidence

[HAR CONFIRMED]

Payload có:


feeAmount
paid



Nhưng:

M5 không thuộc billing.


### Proposal

Không dùng quick-entry để thay đổi học phí.

Chỉ lưu journal + score.


### Owner Decision

Status:

APPROVED

Decision:

Quick-entry M5 không thay đổi feeAmount/paid.

Các field này không thuộc phạm vi M5.

Billing logic giữ nguyên cho GĐ4.


---

# Approval Summary


Before implementation:

All decisions above have been resolved.

Implementation may proceed according to approved decisions.

Required approvals:

- D1 — APPROVED
- D2 — APPROVED
- D3 — APPROVED (Option B)
- D4 — APPROVED
- D5 — APPROVED
- D6 — APPROVED
- D7 — APPROVED


After approval:

Proceed to:

GĐ3 M5 Implementation