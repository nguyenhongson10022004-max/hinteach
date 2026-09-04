# Specification — Thời khoá biểu / Buổi học

> Module: Schedule | Status: **IN PROGRESS** (GĐ3 — M1–M7 ✅ completed, M8 planned)
> Xem `STATUS.md` cho trạng thái hiện tại.
> Spec cập nhật: 2026-08-31 — cập nhật Mục 19 (M7 Calendar Interaction — COMPLETED, implementation + verification), cập nhật edge cases Mục 15 và roadmap.
> Nguồn ưu tiên: HAR thực tế > quyết định thiết kế HinTeach > spec cũ.

---

## Phân loại evidence

Mọi rule trong spec này được gán 1 trong 3 nhãn:

- **[HAR CONFIRMED]** — có bằng chứng trực tiếp từ HAR capture thực tế (HAR 3.x).
- **[HINTEACH DESIGN DECISION]** — quyết định thiết kế nội bộ của HinTeach, không phụ thuộc và không nhất thiết trùng behavior của nttclass/hệ thống tham khảo.
- **[CHƯA XÁC NHẬN]** — chưa có HAR hoặc quyết định dứt khoát; rule cũ được giữ tạm thời.

> ⚠️ Implementation detail của nttclass (tên field, flag, endpoint) **không** tự động trở thành requirement của HinTeach. Chỉ lấy business logic cốt lõi và tự map sang pattern HinTeach.

> ⚠️ **UI/behavior của hệ thống tham khảo (nttclass) không phải source of truth cho implementation.** HAR chỉ xác nhận API/payload/data behavior tồn tại ở hệ thống tham khảo. Nếu UI gốc hoạt động không ổn định hoặc có bug, HinTeach **không copy** bug đó — HinTeach tự implement lại theo đúng business logic cốt lõi đã xác nhận từ HAR.

---

## 1. Phạm vi GĐ3

GĐ3 bao gồm:

- Tạo buổi học đơn lẻ (1-1 và lớp nhiều học sinh).
- Tạo chuỗi buổi học lặp (daily / weekly / monthly / custom).
- Sửa buổi học theo scope "single" hoặc "following".
- Xoá buổi học theo scope "single" hoặc "following".
- Ghi nhanh nhật ký và điểm trong buổi học (quick-entry) — chỉ phần GĐ3 cần cung cấp; không triển khai toàn bộ GĐ5 ở đây.
- Đổi màu hiển thị buổi học trên lịch (Calendar Action — implementation riêng, xem Mục 10 và Mục 18).
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
Field nghiệp vụ cốt lõi **[HAR CONFIRMED — HAR 3.1–3.2]**:

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

> **[HAR CONFIRMED]** HAR recurrence đã quan sát `recurrenceSequence` trên các session trong chuỗi (base = 0, các buổi tiếp theo tăng dần). Đây là behavior/data quan sát từ hệ thống tham khảo, không đồng nghĩa HinTeach bắt buộc phải persist một cột tương đương.

> **`recurrenceSequence` — [HINTEACH DESIGN DECISION]:** HinTeach **không thêm** cột `recurrence_sequence` trong GĐ3. Thứ tự recurrence xác định bằng tuple `(repeat_group_id, date, start_time, id)` — xem chi tiết Mục 4.

### Per-student detail (`studentDetails`)

Mỗi học sinh trong buổi có detail riêng **[HAR CONFIRMED — HAR 3.1, 3.2]**:

| Field | Mô tả |
|---|---|
| `homework` | Tình trạng bài tập |
| `attitude` | Thái độ học tập |
| `individualComment` | Nhận xét riêng cho học sinh này |
| `note` | Ghi chú |
| `feeAmount` | Học phí per-student — xem quy tắc bên dưới |
| `paid` | Đã thu hay chưa |

### Quy tắc `feeAmount` (session_students) — [HINTEACH DESIGN DECISION]

- `session_students.fee_amount` **mặc định = `NULL`**.
- Giá thông thường được **tính động** khi cần: `session.price / số học sinh đang trả tiền trong buổi`.
- `fee_amount` chỉ được ghi vào DB khi có **manual override** hoặc **per-student override** (giá khác với chia đều).
- Không persist fee_amount chia đều vào DB — tránh denormalize và tránh phải cập nhật lại khi `price` thay đổi.

> HAR 3.1 quan sát `feeAmount học sinh = price buổi` (1 mẫu 1-1). HAR 3.2 quan sát `price = Σ feeAmount` (mẫu 3 HS × 250,000 = 750,000).
> Đây là **observation từ hệ thống tham khảo**, không phải rule bắt buộc HinTeach phải persist.

### Recurrence Group — [HAR CONFIRMED — HAR 3.3–3.6]

Chuỗi buổi lặp liên kết qua `recurrenceGroupId` dùng chung.

> **`recurrenceSequence` — [HINTEACH DESIGN DECISION]:** Không thêm cột này trong GĐ3. Thứ tự xác định bằng tuple `(repeat_group_id, date, start_time, id)` — xem Mục 4.

---

## 3. Tạo Buổi Học

### 3a. Buổi 1-1 (type = "riêng") — [HAR CONFIRMED — HAR 3.1]

- `type = "riêng"`.
- `studentIds` chứa đúng 1 học sinh.
- `recurrenceGroupId = null`.
- `studentDetails` có 1 entry tương ứng.
- `fee_amount = NULL` theo default (xem Mục 2 — Quy tắc feeAmount).

### 3b. Buổi lớp nhiều học sinh (type = "chung") — [HAR CONFIRMED — HAR 3.2]

- `type = "chung"`.
- `studentIds` chứa nhiều học sinh.
- `recurrenceGroupId = null` nếu không lặp.
- `studentDetails` có 1 entry per học sinh.
- `fee_amount = NULL` theo default; giá chia đều tính động khi cần, không persist.

> Phân chia feeAmount theo `billing_mode = 'session'` — xem `docs/specs/tuition.md` mục `session / fee_override`.

---

## 4. Recurrence / Lịch Lặp

### Business rule cốt lõi — [HAR CONFIRMED — HAR 3.3–3.6]

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

### Xác định "following" trong chuỗi — [HINTEACH DESIGN DECISION]

"following" = buổi đang chọn + tất cả session xếp sau nó trong cùng recurrenceGroupId,
theo thứ tự `(date, start_time, id)`.
Không dùng rule `date < today` — xem Mục 7b.

**Quyết định đã chốt — [HINTEACH DESIGN DECISION]:**

- Không thêm cột `recurrence_sequence` trong GĐ3.
- "following" xác định bằng tuple lexicographic `(repeat_group_id, date, start_time, id)`:

```sql
-- Predicate cho "current + following"
repeat_group_id = :target_group
AND deleted_at IS NULL
AND (
    date > :target_date
    OR (date = :target_date AND start_time > :target_start_time)
    OR (date = :target_date AND start_time = :target_start_time AND id >= :target_id)
)
```

- Không dùng `date >= X` một mình — phải đủ 3 tầng để xử lý đúng nhiều session cùng ngày/cùng giờ.

**Quy tắc FREEZE bắt buộc (UPDATE/DELETE scope=following và đổi màu propagate):**
1. Query và FREEZE danh sách target session IDs dựa trên giá trị **hiện tại** (trước bất kỳ thay đổi nào).
2. Thực hiện UPDATE/DELETE lên đúng tập ID đã freeze.
**KHÔNG** update `date`/`start_time` của session đang chọn trước rồi mới query lại following — sẽ làm sai lệch tập bị ảnh hưởng.

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

## 5. Conflict Detection

> **Rule cũ ĐÃ BỊ HAR BÁC BỎ:**
> ~~"Tạo buổi mới, học sinh đã có buổi khác cùng giờ → cảnh báo, không chặn cứng."~~

### 5a. Batch-create conflict — [HAR CONFIRMED — HAR 3.6]

- Khi tạo batch (chuỗi lặp), nếu xảy ra trùng lịch → **server trả `409 Conflict` và CHẶN thao tác lưu**.
- Response 409 chứa thông tin buổi xung đột: `id`, `date`, `startTime`, `endTime`, `sessionName`.
- Client phải xử lý 409 và hiển thị thông tin conflict để người dùng giải quyết (VD xoá buổi trùng) trước khi thử lại.

### 5b. Single-create conflict — [HINTEACH DESIGN DECISION]

- Khi tạo buổi đơn lẻ, nếu xảy ra trùng lịch → **server cũng trả `409 Conflict` và CHẶN lưu**.
- Áp dụng cùng behavior 409 như batch-create để đảm bảo nhất quán.
- HAR 3.6 chỉ xác nhận batch; HinTeach mở rộng sang single-create theo quyết định thiết kế nội bộ.

> **Conflict khi edit — [CHƯA XÁC NHẬN]:** HAR 3.6 chỉ xác nhận trong create. Behavior khi edit gây conflict chưa được đặc tả; sẽ xác định trong implementation plan.

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

### 7a. updateScope = "single" — [HAR CONFIRMED — HAR 3.7]

- Chỉ sửa đúng 1 buổi được chọn.
- Response: `updatedCount = 1, createdCount = 0, scope = "single"`.

> **Rule cũ ĐÃ BỊ HAR BÁC BỎ:**
> ~~"Chỉ buổi này: tách khỏi group (repeat_group_id = NULL hoặc is_exception = true)."~~

**Rule mới [HAR CONFIRMED — HAR 3.7]:** Buổi được sửa **giữ nguyên `recurrenceGroupId`**. Không bị tách khỏi chuỗi.

**`is_exception` — [HINTEACH DESIGN DECISION]:**
- Không xóa cột `is_exception` khỏi schema lúc này.
- **Không dùng `is_exception`** để biểu diễn semantics "single-edit detach" (HAR bác bỏ pattern này).
- `is_exception` không có ý nghĩa nghiệp vụ trong GĐ3; sẽ đánh giá lại trong giai đoạn sau nếu cần.

**6 implementation fields quan sát từ HAR nttclass — KHÔNG phải HinTeach requirement:**

> HAR 3.7 quan sát các field `pricingChanged`, `manualPriceOverride`, `sessionFeeChanged`,
> `repriceExistingFees`, `propagateDisplayColor`, `createRepeatDates` đi kèm request sửa trong nttclass.
> **HinTeach không coi đây là business contract bắt buộc.**
> Đây là implementation detail của hệ thống tham khảo; semantics chưa được xác nhận.
> HinTeach không implement các field này trừ khi business behavior thực sự cần.
> Riêng `propagateDisplayColor`: **không dùng trong generic session edit** — xem Mục 10.

### 7b. updateScope = "following" — [HAR CONFIRMED — HAR 3.8]

- Sửa buổi hiện tại + tất cả buổi sau trong cùng `recurrenceGroupId`.
- **"following" = buổi đang chọn + các session có position cao hơn trong chuỗi** (xem quyết định recurrence ordering ở Mục 4).
- Các buổi **trước** buổi hiện tại trong chuỗi không bị ảnh hưởng.
- Response: `updatedCount = N` (N = số buổi từ current trở đi), `scope = "following"`.
- HAR 3.8: session trước giữ nguyên; current + các session sau được cập nhật.

**[HINTEACH DESIGN DECISION] — Không dùng rule `date < today`:**
- "following" được xác định **hoàn toàn theo position trong chuỗi**, không phụ thuộc ngày hiện tại.
- Rule "không update buổi đã qua" (lọc theo `date < today`) **bị loại bỏ khỏi GĐ3**: chưa có evidence HAR và chưa có requirement sản phẩm rõ ràng.

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

**Quick-entry** là tính năng ghi nhanh nhật ký và điểm ngay trong màn hình buổi học **[HAR CONFIRMED — HAR 3.10]**.

### Scope quick-entry — [HINTEACH DESIGN DECISION]

- Quick-entry **chỉ áp dụng cho đúng `sessionId` đang mở**.
- **Không propagate** `content`, `homeworkContent`, `studentDetails`, `scoreGroups` sang các session following.
- Nếu cần cập nhật hàng loạt nội dung buổi, đó là feature riêng và phải spec riêng.

### Payload quick-entry — [HAR CONFIRMED — HAR 3.10]

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
  feeAmount: number    // chỉ ghi nếu có manual override; NULL = tính động
}
```

> **[HINTEACH DESIGN DECISION — M5]**
>
> Quick-entry implementation của HinTeach (M5) **không cập nhật**:
> - `feeAmount`
> - `paid`
>
> Các field này thuộc billing/payment boundary (GĐ4), không thuộc phạm vi quick-entry journal/score của M5.
> Block payload phía trên là HAR evidence đầy đủ (giữ nguyên để tham khảo), nhưng không đồng nghĩa M5 phải implement toàn bộ các field này.

**scoreGroups schema [HAR CONFIRMED — HAR 3.10]:**

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

### Implementation Status — GĐ3 M5 (commit `40ce7cd`, 2026-08-31)

Implemented:

- `hinteach_session_quick_entry` (ajax-schedule.php)
- Session record update (`content`/`homework_content`/`session_name`/`general_comment`)
- Student journal update (`session_students`: `homework`/`attitude`/`individual_comment`/`note`)
- Score creation via quick-entry (`wp_hinteach_grades`)
- Score reload trong edit modal khi mở lại session

Database:

- `wp_hinteach_grades.session_id` — dependency đã có sẵn trong schema trước M5; M5 là nơi đầu tiên **sử dụng** cột này để liên kết điểm với buổi học qua quick-entry
- `wp_hinteach_grades.score_type_label` — cột mới, thêm trong M5

Decision applied:

- **D3 Option B:** giữ nguyên `type ENUM(homework,test,final)` cố định cho phân loại nghiệp vụ, thêm `score_type_label` (tự do) song song để hiển thị nhãn loại điểm tùy biến — không thay `type` thành free-text để tránh phá vỡ logic dựa trên ENUM ở nơi khác.

---

## 10. Display Color — [HAR CONFIRMED] + [HINTEACH IMPLEMENTATION DECISION]

### Evidence

HAR 3.11 xác nhận hệ thống tham khảo (nttclass) có action đổi màu:

- Endpoint đổi màu riêng, tách khỏi generic session edit.
- Payload chỉ chứa `displayColor` (hex string, VD `#RRGGBB`).
- HAR 3.11 quan sát hệ thống tham khảo có behavior propagate: **current + following** trong cùng `recurrenceGroupId` được đổi màu; session trước không đổi. Đây là **business behavior được lấy làm evidence** — cách triển khai cụ thể của HinTeach được định nghĩa ở phần "HinTeach scope" bên dưới, không phải là copy nguyên implementation của hệ thống tham khảo.
- Mẫu HAR 3.11: target = session có position 1 (tính từ 0), `updatedCount = 3` (current + 2 following); session trước không đổi.

**[HAR CONFIRMED — HAR 3.11]**

### HinTeach scope

HinTeach implement đổi màu như một **Calendar Action riêng** (xem Mục 18), không nằm trong generic session edit.

Flow dự kiến:

```
Session
  → Context menu
  → Đổi màu
  → Chọn màu
  → Update display_color
```

### Recurrence behavior

Khi session thuộc recurrence group:

- Màu được áp dụng cho **current + following** session trong cùng `recurrenceGroupId`.
- Không ảnh hưởng session trước.
- Request không cần gửi scope riêng — server tự xử lý propagation.
- "following" cùng định nghĩa với Mục 7b/Mục 4: theo tuple `(repeat_group_id, date, start_time, id)`, **không theo `date < today`**.

**[HINTEACH DESIGN DECISION]**

### UI implementation

> ⚠️ **UI đổi màu của hệ thống tham khảo (nttclass) không được coi là source of truth.** Nếu UI gốc hiện đang hoạt động không ổn định hoặc có bug, HinTeach **không copy** hành vi đó.

HinTeach cần tự implement:

- Context menu action ("Đổi màu").
- Color picker.
- Update flow (gọi action đổi màu riêng, không qua generic edit endpoint).
- Refresh calendar sau khi đổi màu (cập nhật hiển thị current + following ngay trên UI).

Việc implement không phụ thuộc vào việc UI gốc của nttclass có hoạt động đúng hay không — chỉ business logic (propagation current + following) được lấy làm chuẩn từ HAR.

**`propagateDisplayColor` — [KHÔNG DÙNG trong generic edit]:**
- Field `propagateDisplayColor` quan sát từ HAR nttclass **không được tích hợp** vào generic session edit payload.
- HinTeach dùng action đổi màu riêng với propagation tự động "current + following".

**[HINTEACH DESIGN DECISION]**

### Out of scope

Không implement trong GĐ3:

- Đổi màu trong generic edit (đã tách riêng — xem trên).
- Field `propagateDisplayColor` trong session update payload.
- Scope đổi màu khác ("chỉ 1 buổi" khi thuộc chuỗi, hoặc "toàn bộ chuỗi bất kể vị trí") nếu chưa có evidence.

> **Các scope màu khác — [CHƯA XÁC NHẬN]:** Không tự thêm behavior "đổi chỉ 1 buổi" hay "đổi toàn bộ chuỗi" nếu chưa có bằng chứng.

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

**Quyết định schema liên quan GĐ3:**

| Cột | Quyết định |
|---|---|
| `is_exception` | **Giữ nguyên** — không xóa; **không dùng** để biểu diễn single-edit detach (xem Mục 7a) |
| recurrence_sequence | **[HINTEACH DESIGN DECISION]** — Không thêm trong GĐ3, xem Mục 4
| `fee_amount` (session_students) | **Giữ nguyên** — default `NULL`; chỉ ghi khi có override (xem Mục 2) |

---

## 15. Edge Cases

| Case | Trạng thái |
|---|---|
| Monthly fallback: tháng thiếu occurrence (VD tháng 2 không có tuần 5) | **[CHƯA XÁC NHẬN]** — giữ rule cũ: lùi về occurrence cuối cùng của thứ đó trong tháng, không skip tháng |
| Hard limit 366 buổi | **[CHƯA XÁC NHẬN]** — giữ rule cũ: chặn tại vòng lặp sinh ngày, cả client lẫn server |
| Daily: ngày nằm giữa khoảng không xuất hiện trong repeatDates (HAR 3.4) | **[CHƯA XÁC NHẬN]** lý do — cần thêm HAR hoặc test nội bộ |
| Conflict khi edit (không phải create) gây trùng lịch | **[CHƯA XÁC NHẬN]** — HAR 3.6 chỉ xác nhận create/batch; sẽ xác định trong implementation plan |
| Recurrence renumber sau delete following | **[HINTEACH DESIGN DECISION]** — Không áp dụng: HinTeach không persist `recurrence_sequence`, nên không có gì để renumber; thứ tự luôn tính động theo tuple ở Mục 4
| Fee phân chia giữa các học sinh trong buổi chung (rule tổng quát) | **[HINTEACH DESIGN DECISION]** — fee_amount = NULL mặc định; tính động khi cần; xem `docs/specs/tuition.md` |
| Copy field nào khi Sao chép buổi học | **[HAR CONFIRMED + BUNDLE CONFIRMED]** — xem Mục 18 (`sessionName`, `content`, `homeworkContent`, `generalComment`, `type`, `studentIds`, `studentDetails`, `price`; không copy `displayColor`/`recurrenceGroupId`/`recurrenceSequence`) |
| Paste tạo session mới qua API nào | **[HAR CONFIRMED + BUNDLE CONFIRMED]** — Paste mở create form, prefill dữ liệu; không auto create — xem Mục 18 |
| Duplicate: mở form prefill hay tạo ngay | **[HAR CONFIRMED + BUNDLE CONFIRMED]** — Tạo session mới trực tiếp sau khi tìm slot trống, không mở form — xem Mục 18 |
| Recurrence khi copy/paste/duplicate (có tạo group mới không) | **[HAR CONFIRMED + BUNDLE CONFIRMED]** — Copy/Paste không giữ `recurrenceGroupId` của session gốc; Duplicate không giữ `recurrenceGroupId` của session gốc. **[HINTEACH DESIGN DECISION]** Các session tạo từ copy/paste/duplicate là session độc lập — xem Mục 18 |
| Conflict handling khi paste/duplicate trùng lịch | **[CHƯA XÁC NHẬN]** — xem Mục 18 |
| Drag move recurrence scope (có hỏi single/following không) | **[HINTEACH DESIGN DECISION — RESOLVED trong M7]** — Có hỏi `updateScope` (single/following), reuse dialog scope Mục 7 — xem Mục 19 |
| Drag create save behavior | **[HAR CONFIRMED — HAR 3.18]** — mở create form, prefill thời gian, không auto-create — xem Mục 19 |
| Drag move conflict handling | **[HINTEACH DESIGN DECISION — RESOLVED trong M7]** — Server trả 409, client rollback vị trí cũ trên UI — xem Mục 19 |
| Resize session | **[CHƯA XÁC NHẬN]** — chưa có HAR, không implement, chuyển sang GĐ3 M8 nếu có nhu cầu — xem Mục 19 |

---

## 16. Files (chưa tạo)

| Backend | Frontend |
|---|---|
| `includes/ajax-schedule.php` | `assets/modules/schedule.js` |

> **Potential files cho M6 (Calendar Actions)** — chỉ tham khảo, **không tạo file mới nếu chưa có plan** (`docs/plans/gd3-calendar-actions-plan.md`):
> - `assets/modules/schedule.js`
> - `assets/style.css`
> - `includes/ajax-schedule.php`

---

## 17. Acceptance Criteria / Test Expectations

- [ ] Tạo buổi đơn type="riêng" (1 HS) → `recurrenceGroupId = null`, `fee_amount = NULL` trong DB **[HAR CONFIRMED]**
- [ ] Tạo buổi đơn type="chung" (nhiều HS) → `studentDetails` đúng per-HS, `fee_amount = NULL` **[HAR CONFIRMED]**
- [ ] Lặp `daily` từ A đến B → đúng số buổi liên tiếp, cùng `recurrenceGroupId` **[HAR CONFIRMED]**
- [ ] Lặp `weekly` chọn T2/T4/T6 → đúng số buổi, đúng thứ, cùng group **[HAR CONFIRMED]**
- [ ] Lặp `monthly` "thứ 3 tuần 2" → đúng ngày theo rule "thứ N của tháng" **[HAR CONFIRMED một phần]**
- [ ] Lặp `custom` chọn tay ngày → tạo đúng danh sách, cùng group
- [ ] Lặp vượt 366 buổi → dừng đúng ở 366 **[CHƯA XÁC NHẬN — giữ rule]**
- [ ] Conflict batch-create: tạo batch trùng → server 409, không lưu, client hiển thị conflict **[HAR CONFIRMED]**
- [ ] Conflict single-create: tạo buổi đơn trùng → server 409, không lưu **[HINTEACH DESIGN DECISION]**
- [ ] Duration: client gửi duration sai → server lưu đúng theo `startTime`/`endTime` **[HAR CONFIRMED]**
- [ ] Sửa "single" → `updatedCount=1`, `recurrenceGroupId` giữ nguyên, buổi khác không đổi **[HAR CONFIRMED]**
- [ ] Sửa "following" → current + following theo position đổi, buổi trước không đổi, **không lọc theo ngày hôm nay** **[HINTEACH DESIGN DECISION]**
- [ ] Xoá "single" → `deletedCount=1`, buổi khác trong chuỗi không đổi **[HAR CONFIRMED]**
- [ ] Xoá "following" → current + following theo position xoá, buổi trước không đổi **[HAR CONFIRMED + HINTEACH DESIGN DECISION]**
- [ ] Xoá buổi `billing_mode='session'` → học phí giảm **[CHƯA XÁC NHẬN — giữ rule]**
- [ ] Xoá buổi `billing_mode='monthly'` → học phí KHÔNG đổi **[CHƯA XÁC NHẬN — giữ rule]**
- [ ] Quick-entry: chỉ cập nhật đúng `sessionId` đang mở, không propagate sang following **[HINTEACH DESIGN DECISION]**
- [ ] Quick-entry: lưu journal + `scoreGroups` → server tạo score records gắn `sessionId` **[HAR CONFIRMED]**
- [x] Đổi màu (action riêng, tự implement UI): buổi trong chuỗi → current + following đổi màu theo position, buổi trước không đổi **[HAR CONFIRMED + HINTEACH IMPLEMENTATION DECISION]** — ✅ M6
- [x] Đổi màu buổi đơn lẻ (không thuộc chuỗi) → chỉ buổi đó đổi — ✅ M6
- [x] Context menu session (chuột phải) → hiện đúng 4 mục: Đổi màu / Sao chép / Nhân bản / Xóa — ✅ M6, xem Mục 18
- [x] Context menu vùng trống (chuột phải) → hiện đúng 2 mục: Thêm buổi học / Dán (disabled nếu chưa copy) — ✅ M6, xem Mục 18
- [x] Duplicate session → tạo flow nhân bản đúng theo Decision Log M6 — ✅ M6, xem Mục 18
- [x] Drag create: kéo vùng trống → mở create form, prefill thời gian, không auto-create **[HAR CONFIRMED — HAR 3.18]** — ✅ M7, xem Mục 19
- [x] Drag move: kéo session → hỏi `updateScope` nếu thuộc recurrence, PUT update theo Mục 7 — ✅ M7, xem Mục 19
- [x] Drag move conflict: vị trí mới trùng lịch → server 409, client rollback về vị trí cũ — ✅ M7, xem Mục 19
- [ ] Resize session — **[CHƯA XÁC NHẬN]**, chuyển GĐ3 M8
- [ ] Filter lịch — **[CHƯA XÁC NHẬN]**

---

## 18. Calendar Context Actions — M6

> Implementation status: ✅ COMPLETED
>
> Commit: `80dc690`
>
> Tag: `gd3-m6-completed`
>
> Manual verification:
> - Context menu
> - Display color
> - Copy/Paste
> - Duplicate
> - Delete shortcut

Nguồn evidence:

- HAR 3.13 — context menu
- HAR 3.14 — change color context flow
- HAR 3.15 — copy session
- HAR 3.16 — paste session
- HAR 3.17 — duplicate + drag session

Bundle:

- context menu handler
- `calendarSessionClipboard`
- `duplicateCalendarSession`

### Session context menu

**[HAR CONFIRMED]**

Chuột phải vào session:

```
Buổi học
│
├── 🎨 Đổi màu
├── 📋 Sao chép
├── ⊕ Nhân bản
└── 🗑 Xóa
```

Không implement: `✂ Cắt`

**[BUNDLE CONFIRMED]** Cut trong hệ thống tham khảo = copy + delete. HinTeach không đưa cut vào scope M6 vì kéo theo semantics move/reschedule (xem Mục 19 — Drag move).

### Đổi màu (Display Color)

**[HAR CONFIRMED — HAR 3.14]**

Đổi màu là Calendar Action riêng, không đi qua generic session edit.

Behavior:

- Session thường: update đúng 1 session.
- Session thuộc recurrence: current + following trong cùng recurrence group. Không ảnh hưởng session trước.

**[HINTEACH DESIGN DECISION]** Frontend không tự xử lý propagation. Server chịu trách nhiệm xác định following theo rule recurrence ordering (xem Mục 4).

### Sao chép (Copy)

**[HAR CONFIRMED + BUNDLE CONFIRMED]**

Copy không gọi API. Client lưu state trong `calendarSessionClipboard`.

Behavior:

- Lưu trong memory frontend.
- Reload trang mất clipboard.
- Không lưu database.

### Dán (Paste)

**[HAR CONFIRMED + BUNDLE CONFIRMED]**

Flow:

```
Copy
  ↓
Paste
  ↓
Mở create session form
  ↓
Prefill data
  ↓
User xác nhận
  ↓
Create session
```

Paste **không** tự động tạo session.

Field được copy **[HAR/BUNDLE CONFIRMED]**:

- `sessionName`
- `content`
- `homeworkContent`
- `generalComment`
- `type`
- `studentIds`
- `studentDetails`
- `price`

Field **không** được copy:

- `displayColor`
- `recurrenceGroupId`
- `recurrenceSequence`

Paste tạo session độc lập (không tham gia recurrence group của session gốc).

### Nhân bản (Duplicate)

**[HAR CONFIRMED + BUNDLE CONFIRMED]**

Duplicate khác Paste. Flow:

```
Duplicate
  ↓
Tìm slot trống
  ↓
POST tạo session mới
```

Behavior:

- Tạo ngay, không mở form.
- Copy dữ liệu session.
- Không giữ recurrence.

**[HINTEACH DESIGN DECISION]** Duplicate một session thuộc recurrence → tạo session độc lập, không tham gia `recurrenceGroupId` cũ.

**[CHƯA XÁC NHẬN]**

- Behavior khi không tìm được slot trống.
- Conflict handling chi tiết khi duplicate.

### Xóa (Delete shortcut)

Reuse flow xóa ở Mục 7b. Không tạo delete logic mới.

### Empty calendar context menu (chuột phải vào vùng trống)

**[HAR CONFIRMED]**

```
Vị trí trống
│
├── ＋ Thêm buổi học
└── 📌 Dán
```

Behavior:

- Chưa copy → "Dán" disabled.
- Có clipboard → "Dán" active.

---

## 19. Calendar Interaction — M7

> Implementation status: ✅ COMPLETED
>
> Commit: `<d9a5bc7>`
>
> Tag: `gd3-m7-completed`
>
> Manual verification:
> - Time-grid render
> - Drag Create
> - Drag Move
> - Recurrence single/following
> - Conflict 409 rollback
> - Regression: click edit, context menu, copy/paste, duplicate

Nguồn evidence:

- HAR 3.17 — drag session
- HAR 3.18 — drag create session (kéo vùng thời gian trống để tạo nhanh buổi học)

### Time-grid Calendar

**[HINTEACH IMPLEMENTATION DECISION]**

Calendar chuyển sang hiển thị dạng time-grid (06:00–24:00), session render dưới dạng block định vị tuyệt đối theo thời gian, để hỗ trợ thao tác kéo-thả (drag create/drag move).

### Drag Create Session

**[HAR CONFIRMED — HAR 3.18]**

Kéo một vùng thời gian trống trên calendar → tạo nhanh buổi học với `startTime`/`endTime` lấy từ vùng kéo.

Flow:

```
User chọn vùng thời gian trống trên calendar
  ↓
Calendar tính: date, startTime, endTime
  ↓
Mở form tạo buổi học
  ↓
Prefill thời gian đã chọn
  ↓
User nhập: class, students, type, price...
  ↓
Lưu
  ↓
POST tạo session
```

**Điểm quan trọng:** Không phải "kéo chuột → tự động tạo session". Mà là "kéo chuột → mở create modal → user confirm → tạo session".

Behavior:

- Chỉ áp dụng cho vùng trống.
- Không thay đổi session hiện có.
- Snap 30 phút khi kéo chọn vùng thời gian.

Backend: **reuse** action tạo session đã có ở Mục 3 (`hinteach_session_save`). **Không tạo endpoint mới, không schema mới, không validation mới** — đây chỉ là UX shortcut frontend cho flow tạo buổi học đã tồn tại ở M2.

### Drag Move

**[HAR CONFIRMED — HAR 3.17]**

Flow:

```
Drag session
  ↓
Ghost block preview (snap 30 phút)
  ↓
Thả chuột
  ↓
PUT session update
```

Reuse API sửa buổi học (Mục 7). Payload liên quan: `date`, `startTime`, `endTime`, `updateScope`.

**Điểm đã xác định trong M7 implementation [HINTEACH DESIGN DECISION]:**

- Drag session thuộc recurrence: hỏi `updateScope` (single/following) qua cùng dialog scope dùng ở Mục 7, không tự ý mặc định một trong hai.
- Conflict khi kéo: nếu vị trí mới trùng lịch → server trả `409 Conflict` (đồng nhất với Mục 5), client rollback session về vị trí cũ trên UI và hiển thị thông tin conflict.
- Duration không đổi khi drag move (chỉ dịch chuyển `date`/`startTime`/`endTime` theo cùng độ dài buổi học ban đầu) — resize (đổi duration) là tính năng riêng, xem bên dưới.

### Resize

**[CHƯA XÁC NHẬN — KHÔNG IMPLEMENT TRONG M7]**

Chưa có HAR xác nhận behavior resize (kéo dãn để đổi duration). Không implement trong M7; chuyển sang đánh giá lại ở GĐ3 M8 nếu có nhu cầu + evidence.

### Out of scope — chuyển sang GĐ3 M8 (đã giải quyết tại M8)

- Week/Month view switch (hoàn thành tại M8 Phase 4)
- Calendar summary dashboard (hoàn thành tại M8 Phase 3)
- Daily revenue summary (hoàn thành tại M8 Phase 3)
- Advanced recurrence date-shift behavior (hoàn thành tại M8 Phase 1)

---

## 20. Calendar Enhancement — M8

> Implementation status: ✅ COMPLETED
>
> Commits:
> - `714bf8b` — feat(schedule): add recurrence drag following delta
> - `f9446a9` — feat(schedule): expose price and recurrence in session list
> - `35dff6b` — feat(schedule): enhance week calendar view
> - `46d0145` — feat(schedule): add month calendar view
> - `7f7a373` — style(schedule): stabilize full-width calendar layout
>
> QA verification:
> - Automated QA Phase 3 (8 passed, 0 failed)
> - Automated QA Phase 4 (12 passed, 0 failed, 2 accepted fixture skips)
> - Manual mutation regression: standalone Week drag move, recurring Following delta, Week drag create (PASS)
> - Phase 5 live width inspection (1920px, 1440px, 1280px, 1024px) — zero body horizontal overflow

### 20.1 Week View Enhancements

**[HINTEACH IMPLEMENTATION CONFIRMED]**

- **Architecture**:
  - Thứ Hai đầu tuần (Monday-first), 7 ngày hiển thị từ T2 đến CN.
  - Time-grid 06:00–24:00 (18 khung giờ, mỗi giờ 48px, tổng chiều cao 864px).
  - Snap bước kéo: 30 phút (`SNAP_MINUTES = 30`).
- **Drag Create & Drag Move**:
  - Drag Create: kéo vùng trống trên cột ngày tạo nhanh buổi học qua create modal.
  - Drag Move: kéo thả session block sang ngày/giờ mới, có ghost preview, kiểm tra conflict (409) rollback an toàn.
- **Recurrence Scope Behavior & Discriminator**:
  - Khi kéo session thuộc chuỗi lặp, hệ thống hỏi phạm vi cập nhật qua dialog: `single` (chỉ buổi này) hoặc `following` (buổi này và các buổi sau).
  - **M8 Following Drag Delta Path**: sử dụng cờ `drag_move=true` gửi lên backend `wp_ajax_hinteach_session_save`.
  - Phân biệt nghiệp vụ:
    - **Edit Following (từ form modal)**: giữ nguyên ngữ nghĩa giá trị tuyệt đối (user nhập trực tiếp `start_time`/`end_time` mới, tất cả các buổi sau nhận cùng giờ/phút tuyệt đối đó).
    - **Drag Following (từ calendar kéo thả)**: tính toán độ lệch ngày (`dayDelta`) và độ lệch phút (`timeDelta`) so với vị trí ban đầu của session bị kéo, sau đó dịch chuyển đồng bộ tất cả các buổi sau theo delta đó:
      `new_date = orig_date + dayDelta`
      `new_start = orig_start + timeDelta`
      `new_end = orig_end + timeDelta`
    - Cập nhật schedule-only (chỉ cập nhật ngày giờ trên bảng `wp_hinteach_sessions`, không resync danh sách học sinh).
    - Thực thi trong 1 database transaction (all-or-nothing rollback nếu có lỗi).
    - Từ chối nếu delta làm buổi học vượt quá nửa đêm (cross-midnight rejection).
    - Kiểm tra conflict trùng lịch cho từng buổi trong chuỗi.
- **Summary Cards (4 chỉ số tuần)**:
  - `TỔNG BUỔI`: tổng số buổi học nằm trong tuần đang xem.
  - `TỔNG GIỜ`: tổng thời lượng dạy (giờ) tính theo `end_time - start_time`.
  - `1-1/LỚP HỌC`: tỷ lệ số buổi kèm riêng (`type === 'riêng'`) / số buổi lớp chung (`type === 'chung'`).
  - `TỔNG TIỀN`: tổng doanh thu học phí các buổi trong tuần (format tiền tệ VNĐ).
- **Daily Revenue**:
  - Hiển thị doanh thu ngày ngay dưới header ngày trong lưới tuần (`formatCurrency(dayTotal)`).
- **Session Block Visuals**:
  - Hiển thị icon lặp `↻` (`.ht-session-block__repeat`) ở góc trên session block nếu `repeat_group_id > 0`.
  - Hiển thị học phí (`.ht-session-block__price`) nếu `price > 0`.
- **Navigation Controls**:
  - Nút "Hôm nay" (`#ht-cal-today`): quay nhanh về tuần chứa ngày hiện tại.
  - Nút chuyển chế độ xem "Tuần / Tháng" (`.ht-cal__view-switch`).

### 20.2 Month View

**[HINTEACH IMPLEMENTATION CONFIRMED]**

- **Matrix**:
  - Lưới cố định 42 ô (7 cột × 6 hàng, Monday-first), bao gồm các ngày thuộc tháng hiện tại và các ngày đệm (adjacent filler dates) từ tháng trước và tháng sau.
  - Đảm bảo layout ổn định không bị giật chiều cao khi chuyển giữa các tháng 28, 29, 30, hoặc 31 ngày.
- **Filler Dates & Sessions**:
  - Các ô ngày thuộc tháng trước/tháng sau được gắn class `.ht-cal-month__cell--adjacent` với tone màu nhạt hơn.
  - Buổi học thuộc ngày filler vẫn được hiển thị trên ô lịch, nhưng **bị loại trừ** khỏi thống kê 4 card tóm tắt của tháng.
- **Anchor Month Summary**:
  - 4 thẻ tóm tắt (Tổng buổi, Tổng giờ, 1-1/Lớp học, Tổng tiền) khi ở Month View chỉ tính toán cho các buổi học có ngày thuộc đúng tháng đang xem (`isCurrentMonthDate(s.date)`), đồng bộ với tiêu đề "Tháng M, YYYY".
- **Session Pills & Overflow**:
  - Mỗi ô ngày hiển thị tối đa 3 session pill.
  - Nếu ô có từ 4 buổi học trở lên: hiển thị 2–3 pill đầu và 1 nhãn `+N buổi khác` (`.ht-cal-month__overflow-label`).
- **Interactions**:
  - Click vào session pill: mở modal chi tiết/chỉnh sửa buổi học (reuse flow edit M4/M5).
  - Click vào khoảng trống trong ô ngày: tự động chuyển sang chế độ Week View chứa ngày được click.
  - Không hỗ trợ Drag Move hoặc Drag Create trên Month View (thao tác kéo thả chỉ dành riêng cho Week time-grid).
  - Không mở context menu trên Month View.
- **Safe Month Navigation**:
  - Khi bấm nút `‹` (tháng trước) hoặc `›` (tháng sau), thuật toán điều hướng luôn gán ngày về ngày 1 của tháng kế tiếp (`new Date(year, month ± 1, 1)`) để ngăn chặn triệt để bug nhảy cóc tháng trên các ngày 29, 30, 31.

### 20.3 Layout & WordPress Integration

**[HINTEACH IMPLEMENTATION CONFIRMED]**

- **WordPress Page Template**:
  - Trang HinTeach sử dụng template WordPress chuyên dụng: `HinTeach Full Width` (`page-template-hin-teach-full-width`), loại bỏ post title, metadata, và comments wrapper từ theme.
- **Block Theme Width Unconstrain**:
  - WordPress Twenty Twenty-Four block theme mặc định áp đặt `max-width: 620px` lên các element con của `.entry-content.is-layout-constrained` và đệm ngang `padding: 0 102.4px` qua `.has-global-padding`.
  - CSS HinTeach unconstrain có chọn lọc thông qua:
    `body.page-template-hin-teach-full-width .entry-content`, `.entry-content:has(#hinteach-app)`, và `.is-layout-constrained:has(#hinteach-app)`.
  - `#hinteach-app.ht-app` được thiết lập `width: 100% !important; max-width: 100% !important; margin: 0 !important;` loại bỏ hoàn toàn tình trạng co hẹp 620px.
- **Root Anti-Shrink & Flex Sizing**:
  - `.ht-sidebar`: Cố định 240px (`position: fixed; top: 0; left: 0;`).
  - `.ht-main`: Chiếm toàn bộ không gian còn lại: `margin-left: var(--ht-sidebar-width); width: calc(100% - var(--ht-sidebar-width)); min-width: 0;`.
  - `.ht-content`, `.ht-module`, `#ht-schedule-calendar`: Đều sử dụng `width: 100%; min-width: 0;` với `box-sizing: border-box`.
  - Không tạo thanh cuộn ngang cấp trang (`body`) ở các độ phân giải desktop chuẩn (1024, 1280, 1440, 1920).
- **Local Overflow Safeguards**:
  - Week Grid giữ safeguard `min-width: 888px`, thanh cuộn ngang chỉ xuất hiện cục bộ bên trong `#ht-schedule-calendar` khi màn hình < 888px.
  - Month Grid giữ safeguard `min-width: 768px`, thanh cuộn ngang chỉ xuất hiện cục bộ bên trong `.ht-cal-month__wrapper` khi màn hình < 768px.

---

## Roadmap tham khảo (GĐ3 Schedule)

```
M1 ✅ Calendar Shell
M2 ✅ Create Session
M3 ✅ Recurrence
M4 ✅ Edit/Delete Recurrence
M5 ✅ Quick Entry + Session Record + Score
    - Quick entry session
    - Student details
    - Score records
M6 ✅ Calendar Actions
    - Context menu (session + empty area)
    - Display color propagation
    - Copy/Paste workflow
    - Duplicate session
    - Delete shortcut (reuse M4)
M7 ✅ Calendar Interaction
    - Time-grid calendar
    - Drag create (reuse M2 hinteach_session_save — no new backend)
    - Drag move (reuse M4 edit API, updateScope prompt, 409 conflict rollback)
    - Resize — CHƯA CÓ HAR, không implement
M8 ✅ Calendar Enhancement
    - Recurrence Drag Following delta (drag_move=true)
    - Session list price + repeat_group_id payload
    - Week View enhancements (summary cards, Hôm nay, daily revenue, repeat/price visuals)
    - Month View (42 cells, anchor month summary, 3-pill max, edit flow, safe navigation)
    - Full-width / layout stabilization (Twenty Twenty-Four unconstrain, root anti-shrink)
```