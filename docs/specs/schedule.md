# Specification — Thời khoá biểu / Buổi học

> Module: Schedule | Status: **NOT STARTED** (GĐ3)
> Xem `STATUS.md` cho trạng thái hiện tại.

---

## Business Rules

### Thuật toán sinh ngày lặp (xác nhận từ bundle.js thật)

```
daily:   mỗi ngày liên tiếp từ ngày sau ngày bắt đầu đến ngày kết thúc (inclusive)

weekly:  chỉ những thứ trong tuần đã tick (checkbox T2..T7,CN), lặp mỗi tuần
         đến ngày kết thúc

monthly: theo "thứ N của tháng" — VD chọn thứ 3, ngày bắt đầu rơi vào tuần thứ 2
         của tháng đó → lặp vào thứ 3 tuần thứ 2 MỖI THÁNG tiếp theo.
         Nếu tháng đó không đủ N tuần chứa thứ đó → lùi về occurrence CUỐI CÙNG
         của thứ đó trong tháng (không skip tháng).

GIỚI HẠN CỨNG: tối đa 366 buổi — chặn NGAY TRONG VÒNG LẶP sinh ngày (dừng sinh khi
đủ 366), KHÔNG sinh hết rồi cắt bớt. Áp dụng ở CẢ client (UX) và server (bảo mật thật,
không tin client báo "chưa đủ 366").
```

### Lặp lịch (`repeat_group_id`)
- Sửa/xoá 1 buổi thuộc chuỗi lặp → LUÔN hỏi rõ: "chỉ buổi này" hay "buổi này và các buổi sau".
- "Chỉ buổi này": tách khỏi group (`repeat_group_id = NULL` hoặc `is_exception = true`).
- "Buổi này và các buổi sau": chỉ update record có `date >= ngày hiện tại` trong cùng group, KHÔNG động vào buổi đã qua.

### Điểm danh & học phí
- `wp_hinteach_session_students` là nguồn DUY NHẤT tính số buổi/số giờ/học phí (chế độ `session`).
- Xoá 1 buổi → xoá/soft-delete kèm `session_students` liên quan. Nếu lớp `billing_mode='session'`, học phí tháng tự tính lại (tính động). Nếu `course`/`monthly`, KHÔNG có gì để tính lại — chỉ ảnh hưởng lịch sử điểm danh.

### Trùng lịch
- Tạo buổi mới, học sinh đã có buổi khác cùng giờ (lớp khác) → cảnh báo, không chặn cứng.

### Loại buổi
- `type = 'riêng'` (1 học sinh) hoặc `'chung'` (nhóm) — ảnh hưởng màu mặc định hiển thị.

### Ảnh hưởng tới học phí
- CHỈ ảnh hưởng nếu lớp `billing_mode = 'session'`. Với `course`/`monthly`, thêm/xoá buổi KHÔNG đổi số tiền.

### DB Schema
- KHÔNG tạo bảng/cột mới ngoài `includes/db-schema.php`.

---

## Permissions
- Quyền `scheduler` (assistant) hoặc `manage_hinteach_classes`.
- Filter theo teacher ownership.

---

## Files (chưa tạo)

| Backend | Frontend |
|---|---|
| `includes/ajax-schedule.php` | `assets/modules/schedule.js` |

---

## Test Expectations

- [ ] Tạo buổi đơn lẻ → hiện đúng trên lịch tuần/tháng
- [ ] Lặp `daily` từ A đến B → đúng số buổi liên tiếp
- [ ] Lặp `weekly` chọn T2/T4/T6 → đúng số buổi
- [ ] Lặp `monthly` "thứ 3 tuần 2" → đúng ngày, xử lý tháng thiếu tuần
- [ ] Lặp vượt 366 buổi → dừng đúng ở 366
- [ ] Sửa buổi giữa chuỗi, "chỉ buổi này" → các buổi khác không đổi
- [ ] Sửa buổi giữa chuỗi, "buổi này và sau" → chỉ buổi tương lai đổi
- [ ] Xoá buổi đã điểm danh, `billing_mode='session'` → học phí giảm
- [ ] Xoá buổi, `billing_mode='monthly'` → học phí KHÔNG đổi
- [ ] Trùng lịch giữa 2 lớp → cảnh báo, vẫn cho lưu nếu xác nhận
