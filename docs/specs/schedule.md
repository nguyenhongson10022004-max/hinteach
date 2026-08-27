# Specification — Thời khoá biểu / Buổi học

> Module: Schedule | Status: **NOT STARTED** (GĐ3)
> Xem `STATUS.md` cho trạng thái hiện tại.
> Spec cập nhật: 2026-08-27 — đối chiếu HAR thực tế HAR 3.1–3.11 (nttclass.com).
> Nguồn ưu tiên: HAR thực tế > checkpoint phân tích > spec cũ.

---

## 1. Phạm vi GĐ3

GĐ3 bao gồm:

- Tạo buổi học đơn lẻ (1-1 và lớp nhiều học sinh).
- Tạo chuỗi buổi học lặp (daily / weekly / monthly / custom).
- Sửa buổi học theo scope "single" hoặc "following".
- Xoá buổi học theo scope "single" hoặc "following".
- Ghi nhanh nhật ký và điểm trong buổi học (quick-entry) — chỉ phần GĐ3 cần cung cấp; không triển khai toàn bộ GĐ5 ở đây.
- Đổi màu hiển thị buổi học trên lịch.
- Hiển thị lịch (tuần / tháng).
- Filter lịch — **CHƯA XÁC NHẬN TỪ HAR** (xem Mục 11).

GĐ3 **không** bao gồm:

- Toàn bộ logic GĐ5 (điểm số / nhật ký đầy đủ).
- Thanh toán / phiếu thu (GĐ4).
- Quiz engine (DEFERRED — xem `modules/quiz-engine-DEFERRED/SPEC.md`).

---

## 2. Data & Business Concepts

### Buổi học (Session)

Mỗi buổi học là 1 record DB, đại diện cho một khoảng thời gian giảng dạy cụ thể.
Field nghiệp vụ cốt lõi (xác nhận HAR 3.1–3.2):

| Field | Mô tả |
|---|---|
| `id` | Unique ID buổi học |
| `date` | Ngày diễn ra (YYYY-MM-DD) |
| `startTime` | Giờ bắt đầu |
| `endTime` | Giờ kết thúc |
| `duration` | **Phái sinh** từ startTime/endTime — xem Mục 6 |
| `type` | `riêng` (1-1) hoặc `chung` (lớp nhiều HS) |
| `sessionName` | Tên / tiêu đề buổi học |
| `classKey` | Liên kết lớp học (GĐ2) |
| `studentIds` | Danh sách ID học sinh tham gia |
| `price` | Tổng học phí buổi học |
| `displayColor` | Màu hiển thị trên lịch (hex string) |
| `content` | Nội dung bài học |
| `homeworkContent` | Nội dung bài tập về nhà |
| `generalComment` | Nhận xét chung |
| `completed` | Đã diễn ra hay chưa |
| `paid` | Trạng thái thanh toán chung |
| `recurrenceGroupId` | ID nhóm chuỗi lặp (`null` nếu buổi đơn lẻ) |
| `recurrenceSequence` | Vị trí trong chuỗi lặp (`null` nếu buổi đơn lẻ; base = 0) |

### Per-student detail (`studentDetails`)

Mỗi học sinh trong buổi có detail riêng (xác nhận HAR 3.1, 3.2):

| Field | Mô tả |
|---|---|
| `homework` | Tình trạng bài tập |
| `attitude` | Thái độ học tập |
| `individualComment` | Nhận xét riêng cho học sinh này |
| `note` | Ghi chú |
| `feeAmount` | Học phí của học sinh này trong buổi |
| `paid` | Đã thu hay chưa |

### Recurrence Group

Chuỗi buổi lặp liên kết qua `recurrenceGroupId` dùng chung.
`recurrenceSequence` tăng dần từ 0: base session = 0, các repeat = 1, 2, ...

---

## 3. Tạo Buổi Học

### 3a. Buổi 1-1 (type = "riêng") — xác nhận HAR 3.1

- `type = "riêng"`.
- `studentIds` chứa đúng 1 học sinh.
- `recurrenceGroupId = null`, `recurrenceSequence = null`.
- `studentDetails` có 1 entry tương ứng.
- **Quan sát fee (1 mẫu HAR):** `feeAmount` của học sinh = `price` buổi. Chưa đủ dữ liệu để khẳng định rule tổng quát — **CHƯA XÁC NHẬN**.

### 3b. Buổi lớp nhiều học sinh (type = "chung") — xác nhận HAR 3.2

- `type = "chung"`.
- `studentIds` chứa nhiều học sinh.
- `recurrenceGroupId = null`, `recurrenceSequence = null` nếu không lặp.
- `studentDetails` có 1 entry per học sinh.
- **Quan sát fee (mẫu 3 HS):** `price` (session) = tổng `feeAmount` các học sinh. Mẫu: 3 HS × 250,000 = 750,000. Chưa đủ dữ liệu để khẳng định rule phân chia tổng quát — **CHƯA XÁC NHẬN**.

> Việc phân chia feeAmount theo `billing_mode = 'session'` (chia đều hay không) cần xác nhận thêm. Xem `docs/specs/tuition.md` mục `session / fee_override`.

---

## 4. Recurrence / Lịch Lặp

### Business rule cốt lõi (xác nhận HAR 3.3–3.6)

**Frontend tính trước toàn bộ danh sách ngày lặp và gửi dạng `baseSession + repeatDates[]` lên server.**

Server **không** nhận một field `repeatType = "weekly"/"daily"/"monthly"/"custom"` để tự sinh chuỗi.
Server nhận đúng danh sách ngày cụ thể, tạo session và liên kết qua recurrence group.

```
Request tạo chuỗi lặp:
{
  baseSession: { date, startTime, endTime, type, studentIds, price, ... },
  repeatDates: ["YYYY-MM-DD", "YYYY-MM-DD", ...]
}

Response:
{
  createdCount: N,        // 1 (base) + số phần tử repeatDates
  recurrenceGroupId: "..."
}
```

- Tất cả session trong chuỗi chia sẻ cùng `recurrenceGroupId`.
- `recurrenceSequence` tăng dần từ 0 (base = 0, repeat = 1, 2, ...).

### UI phải hỗ trợ 4 kiểu sinh ngày lặp

UI GĐ3 chịu trách nhiệm tính và preview danh sách ngày lặp; sau đó gửi kết quả đã tính lên server:

| Kiểu | Logic sinh ngày ở UI |
|---|---|
| `daily` | Mỗi ngày liên tiếp từ ngày sau base đến endDate |
| `weekly` | Chỉ các thứ đã chọn (T2..T7, CN), lặp mỗi tuần đến endDate |
| `monthly` | Theo "thứ N của tháng" — xem mục Monthly bên dưới |
| `custom` | Người dùng chọn tay từng ngày |

> **Lưu ý kiến trúc:** Logic sinh ngày nằm hoàn toàn ở client (JS). Server chỉ nhận và lưu danh sách ngày.

### Thuật toán daily (xác nhận spec cũ + HAR 3.4)

```
daily: mỗi ngày liên tiếp từ ngày sau ngày bắt đầu đến ngày kết thúc (inclusive)
```

> **Lưu ý HAR 3.4:** Trong mẫu quan sát, một ngày nằm trong khoảng daily (2026-09-06) không xuất hiện trong `repeatDates`. Lý do chưa xác định — **CHƯA XÁC NHẬN**. Không tự suy diễn rule.

### Thuật toán weekly (xác nhận HAR 3.3)

```
weekly: chỉ những thứ trong tuần đã tick (checkbox T2..T7, CN), lặp mỗi tuần đến ngày kết thúc
```

### Thuật toán monthly (xác nhận một phần HAR 3.5)

```
monthly: theo "thứ N của tháng"
Ví dụ: base 2026-08-28 (thứ Sáu tuần 4 tháng 8)
→ repeatDates = thứ Sáu tuần 4 tháng 9, tháng 10, ...
Mẫu HAR 3.5: base 2026-08-28, repeatDates [2026-09-25, 2026-10-23] — phù hợp rule trên.
```

> **Monthly fallback — CHƯA XÁC NHẬN TỪ HAR:** Khi tháng tiếp theo không đủ occurrence (VD tháng 2 không có tuần 5),
> HAR chỉ có 1 mẫu và chưa cover case này. **Giữ nguyên rule cũ đến khi có bằng chứng bác bỏ:**
>
> ```
> Nếu tháng đó không đủ N tuần chứa thứ đó → lùi về occurrence CUỐI CÙNG
> của thứ đó trong tháng (không skip tháng).
> ```

### Hard limit recurrence — CHƯA XÁC NHẬN TỪ HAR

> HAR GĐ3 không có mẫu test giới hạn số buổi. **Giữ nguyên rule cũ:**
>
> ```
> GIỚI HẠN CỨNG: tối đa 366 buổi — chặn NGAY TRONG VÒNG LẶP sinh ngày
> (dừng khi đủ 366, KHÔNG sinh hết rồi cắt bớt).
> Áp dụng ở CẢ client (UX) và server (bảo mật thật, không tin client).
> ```

---

## 5. Conflict Detection (xác nhận HAR 3.6)

> **Rule cũ ĐÃ BỊ HAR BÁC BỎ:**
> ~~"Tạo buổi mới, học sinh đã có buổi khác cùng giờ → cảnh báo, không chặn cứng."~~

**Rule mới (xác nhận HAR 3.6):**

- Khi tạo lịch (đơn lẻ hoặc batch), nếu xảy ra trùng lịch → **server trả `409 Conflict` và CHẶN thao tác lưu**.
- Response 409 chứa thông tin buổi xung đột: `id`, `date`, `startTime`, `endTime`, `sessionName`.
- Client phải xử lý 409 và hiển thị thông tin conflict để người dùng giải quyết (VD xoá buổi trùng) trước khi thử lại.

> **Scope đã test:** HAR 3.6 xác nhận trong batch create. Behavior khi edit gây conflict — **CHƯA XÁC NHẬN**.

---

## 6. Duration Normalization (xác nhận HAR 3.7, 3.8)

**Server không tin giá trị `duration` client gửi lên. Duration được normalize từ `startTime` và `endTime`.**

Ví dụ quan sát từ HAR:

| HAR | startTime | endTime | Client gửi duration | Server trả duration |
|---|---|---|---|---|
| 3.7 | 16:00 | 19:15 | 3.3 | 3.25 (= 195 phút / 60) |
| 3.8 | 16:00 | 20:15 | 4.3 | 4.25 (= 255 phút / 60) |

**Quy tắc:**

- `startTime` và `endTime` là source of truth cho duration.
- `duration` trong DB luôn được tính từ `endTime - startTime` (đơn vị giờ, decimal).
- Client có thể gửi `duration` nhưng server bỏ qua / ghi đè bằng giá trị tính lại.

---

## 7. Edit Scopes

Khi sửa buổi thuộc chuỗi lặp, **LUÔN hỏi rõ scope**: "chỉ buổi này" hay "buổi này và các buổi sau".

### 7a. updateScope = "single" (xác nhận HAR 3.7)

- Chỉ sửa đúng 1 buổi được chọn.
- Response: `updatedCount = 1, createdCount = 0, scope = "single"`.

> **Rule cũ ĐÃ BỊ HAR BÁC BỎ:**
> ~~"Chỉ buổi này: tách khỏi group (repeat_group_id = NULL hoặc is_exception = true)."~~

**Rule mới (xác nhận HAR 3.7):** Buổi được sửa **giữ nguyên `recurrenceGroupId` và `recurrenceSequence`**. Không bị tách khỏi chuỗi.

Implementation cần hỗ trợ các flag đi kèm request sửa (xác nhận HAR 3.7):

- `pricingChanged`
- `manualPriceOverride`
- `sessionFeeChanged`
- `repriceExistingFees`
- `propagateDisplayColor`
- `createRepeatDates`

### 7b. updateScope = "following" (xác nhận HAR 3.8)

- Sửa buổi hiện tại + tất cả buổi sau trong cùng `recurrenceGroupId`.
- Các buổi **trước** buổi hiện tại (sequence nhỏ hơn) không bị ảnh hưởng.
- Response: `updatedCount = N` (N = số buổi từ current trở đi), `scope = "following"`.
- HAR 3.8: sequence 0 (trước) giữ nguyên; sequence 1 (current), 2, 3 được cập nhật.

> **Không động vào buổi đã qua:** Khi scope = "following", không update record có `date < ngày hiện tại`.

---

## 8. Delete Scopes (xác nhận HAR 3.9)

### Delete single

- Xoá đúng 1 buổi được chọn.
- Không cần extra scope parameter (hoặc scope = "single" mặc định).
- Response: `deletedCount = 1`.

### Delete following (current + các buổi sau)

- Xoá buổi hiện tại + tất cả buổi sau trong cùng recurrence chain.
- **Scope được truyền qua query parameter, không phải JSON body** (xác nhận HAR 3.9).
- Response: `deletedCount = N`, `scope = "following"`.
- `N` phụ thuộc vị trí buổi trong chuỗi (HAR quan sát deletedCount = 2 và 3 tùy trường hợp).

> **Không tự thêm "xoá toàn bộ chuỗi":** HAR 3.9 chỉ xác nhận 2 scope trên. Không implement scope "entire chain" nếu chưa có bằng chứng rõ ràng.

### Soft delete

- Mọi xoá phải là **soft delete** (`deleted_at`), không xoá cứng record.
- Phải soft-delete kèm `session_students` liên quan — xem Mục 13 về billing.

---

## 9. Session Journal & Score Integration (GĐ3 ↔ GĐ5 boundary)

**Quick-entry** là tính năng ghi nhanh nhật ký và điểm ngay trong màn hình buổi học (xác nhận HAR 3.10).

### Payload quick-entry

GĐ3 phải implement action quick-entry trong `ajax-schedule.php`:

| Field | Mô tả |
|---|---|
| `content` | Nội dung bài học |
| `homeworkContent` | Bài tập về nhà |
| `sessionName` | Tên buổi (có thể cập nhật) |
| `generalComment` | Nhận xét chung |
| `studentDetails` | Array per-student (xem bên dưới) |
| `scoreGroups` | Array nhóm điểm (xem bên dưới) |

**studentDetails per student:**

```
{
  studentId: "...",
  homework: "...",
  attitude: "...",
  individualComment: "...",
  note: "...",
  paid: bool,
  feeAmount: number
}
```

**scoreGroups schema (xác nhận HAR 3.10):**

```
scoreGroups: [
  {
    testGroupId: "",       // client gửi rỗng → server tự generate
    scoreType: "...",
    testName: "...",
    maxScore: N,
    entries: [
      {
        studentId: "...",
        scoreValue: N,
        scoreNote: "..."
      }
    ]
  }
]
```

- Server tự generate `testGroupId` theo quan hệ với session hiện tại (dạng `"session:<sessionId>"`).
- Score records được gắn `sessionId` của buổi học.

### Integration boundary với GĐ5

- **GĐ3 chịu trách nhiệm:** nhận và lưu quick-entry data; tạo score records qua quick-entry.
- **GĐ5 mở rộng trên data này:** quản lý điểm đầy đủ, nhật ký, báo cáo.
- **Không triển khai toàn bộ GĐ5 trong GĐ3.**
- `sessionId` trên score records là link chính giữa GĐ3 và GĐ5.

---

## 10. Display Color (xác nhận HAR 3.11)

- Mỗi session có `displayColor` (hex string, VD `#RRGGBB`).
- Action đổi màu nhận payload: `{ displayColor: "#RRGGBB" }`.

### Behavior trong recurrence chain (xác nhận HAR 3.11)

- Khi đổi màu session thuộc recurrence chain: **tự propagate cho current session + tất cả session sau (following)** trong cùng `recurrenceGroupId`.
- Request không cần gửi scope riêng — server tự xử lý propagation.
- Mẫu HAR 3.11: target = sequence 1, `updatedCount = 3` (sequence 1, 2, 3); sequence 0 không đổi.

> **Các scope màu khác — CHƯA XÁC NHẬN TỪ HAR:** Không tự thêm behavior "đổi chỉ 1 buổi",
> "đổi toàn bộ chuỗi", hay scope khác nếu chưa có bằng chứng.

---

## 11. Filter Lịch — CHƯA XÁC NHẬN TỪ HAR

HAR 3.12 không có evidence hợp lệ: UI filter trên nttclass không phản ứng khi test;
không thu được request/response có ý nghĩa.

**Không được suy ra:**

- API filter hay query params.
- Backend behavior.
- Coi nttclass là bằng chứng filter hoạt động.

**Trạng thái:** `CHƯA XÁC NHẬN TỪ HAR — sẽ xác định khi có HAR hợp lệ hoặc spec riêng.`

Nếu HinTeach cần filter lịch theo lớp / học sinh / khoảng giờ, requirement này cần được spec riêng
dựa trên quyết định thiết kế nội bộ, không phụ thuộc behavior của nttclass.

---

## 12. Permissions / Teacher Ownership

- Quyền `scheduler` (assistant) hoặc `manage_hinteach_classes` (teacher / admin).
- **Filter theo teacher ownership:** AJAX handler **PHẢI** filter session theo teacher_id sở hữu lớp.
  Không trả session của lớp người khác.
- Với `hinteach_assistant`: phải check `assistant_permissions` với `module_key = 'scheduler'` —
  xem `CLAUDE.md` và `includes/CLAUDE.md`.

---

## 13. Billing Mode Interaction — CHƯA XÁC NHẬN TỪ HAR

> **CHƯA XÁC NHẬN TỪ HAR:** HAR GĐ3 không có mẫu test nào tác động tới billing.
> Các rule bên dưới được giữ nguyên từ spec cũ và `CLAUDE.md` — chưa có bằng chứng HAR để xác nhận hoặc bác bỏ.

**CHƯA XÁC NHẬN TỪ HAR — giữ rule cũ:**
- `wp_hinteach_session_students` là nguồn DUY NHẤT tính số buổi / số giờ / học phí (chế độ `session`).

**Xoá 1 buổi — CHƯA XÁC NHẬN TỪ HAR, giữ rule cũ:**

- `billing_mode = 'session'`: xoá / soft-delete kèm `session_students` liên quan → học phí tháng tự tính lại (tính động).
- `billing_mode = 'course'` hoặc `'monthly'`: KHÔNG có gì để tính lại học phí — chỉ ảnh hưởng lịch sử điểm danh.

**Thêm buổi — CHƯA XÁC NHẬN TỪ HAR, giữ rule cũ:**

- CHỈ ảnh hưởng học phí nếu `billing_mode = 'session'`.
- Với `course` / `monthly`: thêm / xoá buổi KHÔNG đổi số tiền.

---

## 14. DB Schema

- **KHÔNG tạo bảng / cột mới ngoài `includes/db-schema.php`.**
- Xem `includes/db-schema.php` cho toàn bộ schema hiện tại.
- Nếu implementation GĐ3 phát hiện cần thêm field, phải cập nhật `db-schema.php` và
  `includes/CLAUDE.md` trước, không tự thêm ngoài file đó.

---

## 15. Edge Cases

| Case | Trạng thái |
|---|---|
| Monthly fallback: tháng thiếu occurrence (VD tháng 2 không có tuần 5) | **CHƯA XÁC NHẬN TỪ HAR** — giữ rule cũ: lùi về occurrence cuối cùng của thứ đó trong tháng, không skip tháng |
| Hard limit 366 buổi | **CHƯA XÁC NHẬN TỪ HAR** — giữ rule cũ: chặn tại vòng lặp sinh ngày |
| Daily: ngày nằm giữa khoảng không xuất hiện trong repeatDates (HAR 3.4) | **CHƯA XÁC NHẬN** lý do — cần thêm HAR hoặc test nội bộ |
| Conflict khi edit (không phải create) gây trùng lịch | **CHƯA XÁC NHẬN TỪ HAR** — HAR 3.6 chỉ xác nhận trong create/batch |
| Recurrence sequence sau delete following: các sequence còn lại có tự renumber không | **CHƯA XÁC NHẬN TỪ HAR** |
| Fee phân chia giữa các học sinh trong buổi chung (rule tổng quát) | **CHƯA XÁC NHẬN TỪ HAR** — xem `docs/specs/tuition.md` |

---

## 16. Files (chưa tạo)

| Backend | Frontend |
|---|---|
| `includes/ajax-schedule.php` | `assets/modules/schedule.js` |

---

## 17. Acceptance Criteria / Test Expectations

- [ ] Tạo buổi đơn type="riêng" (1 HS) → hiện đúng trên lịch, `recurrenceGroupId = null`
- [ ] Tạo buổi đơn type="chung" (nhiều HS) → hiện đúng, `studentDetails` đúng per-HS
- [ ] Lặp `daily` từ A đến B → đúng số buổi liên tiếp, cùng `recurrenceGroupId`, sequence tăng từ 0
- [ ] Lặp `weekly` chọn T2/T4/T6 → đúng số buổi, đúng thứ, cùng group
- [ ] Lặp `monthly` "thứ 3 tuần 2" → đúng ngày theo rule "thứ N của tháng"
- [ ] Lặp `custom` chọn tay ngày → tạo đúng danh sách, cùng group
- [ ] Lặp vượt 366 buổi → dừng đúng ở 366 *(CHƯA XÁC NHẬN TỪ HAR — giữ rule)*
- [ ] Conflict: tạo lịch trùng → server 409, không lưu, client hiển thị thông tin conflict
- [ ] Duration: client gửi duration sai → server lưu đúng theo `startTime`/`endTime`
- [ ] Sửa "single" → `updatedCount=1`, `recurrenceGroupId` giữ nguyên, buổi khác trong chuỗi không đổi
- [ ] Sửa "following" → current + future đổi, buổi trước không đổi
- [ ] Xoá "single" → `deletedCount=1`, buổi khác trong chuỗi không đổi
- [ ] Xoá "following" → current + future xoá, buổi trước không đổi
- [ ] Xoá buổi `billing_mode='session'` → học phí giảm *(CHƯA XÁC NHẬN TỪ HAR — giữ rule)*
- [ ] Xoá buổi `billing_mode='monthly'` → học phí KHÔNG đổi *(CHƯA XÁC NHẬN TỪ HAR — giữ rule)*
- [ ] Quick-entry: lưu journal + `scoreGroups` → server tạo score records gắn `sessionId`
- [ ] Đổi màu buổi trong chuỗi → current + following đổi màu, buổi trước không đổi
- [ ] Filter lịch — **CHƯA XÁC NHẬN TỪ HAR**
