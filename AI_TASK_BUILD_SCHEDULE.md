# AI TASK — BUILD MODULE THỜI KHOÁ BIỂU / BUỔI HỌC
> Dùng khi làm/mở rộng: ghi buổi học, lặp lịch, điểm danh, sửa/xoá buổi trong chuỗi lặp
> Cập nhật 2026-08-23: đã đối chiếu thuật toán lặp lịch thật từ bundle.js

---

## BƯỚC 0 — ĐỌC TRƯỚC KHI LÀM GÌ

1. `CLAUDE.md` (root) — nguyên tắc `repeat_group_id`, "session là trung tâm tính học phí (CHỈ với billing_mode='session')"
2. `includes/CLAUDE.md` — schema `wp_hinteach_sessions`, `wp_hinteach_session_students`, endpoint

---

## PHÂN TÍCH TRƯỚC — VIẾT CODE SAU

**1. Đây là buổi đơn lẻ hay thao tác trên chuỗi lặp?**
Nếu chuỗi lặp: xác định tần suất — `daily`/`weekly`/`monthly` (theo thứ N của tháng) — mỗi loại thuật toán khác nhau, xem điều luật bên dưới.

**2. File và vùng code cần đụng vào?**
`ajax-schedule.php` / `modules/schedule.js`.

**3. Có ảnh hưởng tới tính toán học phí không?**
CHỈ ảnh hưởng nếu lớp đó `billing_mode = 'session'`. Với `course`/`monthly`, thêm/xoá buổi KHÔNG đổi số tiền — chỉ ảnh hưởng hiển thị lịch/điểm danh.

**4. Minimal patch là gì?**

---

## ĐIỀU LUẬT — KHÔNG ĐƯỢC VI PHẠM

### Thuật toán sinh ngày lặp — XÁC NHẬN TỪ BUNDLE.JS THẬT

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
- Xoá 1 buổi → xoá/soft-delete kèm `session_students` liên quan; nếu lớp `billing_mode='session'`, học phí tháng đó tự tính lại (vì tính động). Nếu lớp `course`/`monthly`, KHÔNG có gì để tính lại — chỉ ảnh hưởng lịch sử điểm danh.

### Trùng lịch
- Tạo buổi mới, học sinh đã có buổi khác cùng giờ (lớp khác) → cảnh báo, không chặn cứng.

### Loại buổi
- `type = 'riêng'` (1 học sinh) hoặc `'chung'` (nhóm) — ảnh hưởng màu mặc định khi hiển thị (dùng bảng màu theo `type`, xem `assets/CLAUDE.md`).

### DB Schema
- KHÔNG tạo bảng/cột mới ngoài `includes/db-schema.php`.

---

## SAU KHI ĐỀ XUẤT — LIỆT KÊ TEST CASES

- [ ] Tạo buổi đơn lẻ → hiện đúng trên lịch tuần/tháng
- [ ] Lặp `daily` từ ngày A đến ngày B → sinh đúng số buổi liên tiếp
- [ ] Lặp `weekly` chọn T2/T4/T6 → sinh đúng số buổi tới ngày kết thúc
- [ ] Lặp `monthly` chọn "thứ 3 tuần 2" → đúng ngày mỗi tháng, xử lý đúng tháng thiếu tuần
- [ ] Tạo lặp vượt 366 buổi (thử daily nhiều năm) → dừng đúng ở 366, không tạo dư
- [ ] Sửa 1 buổi giữa chuỗi, chọn "chỉ buổi này" → các buổi khác không đổi
- [ ] Sửa 1 buổi giữa chuỗi, chọn "buổi này và các buổi sau" → chỉ buổi tương lai đổi
- [ ] Xoá 1 buổi đã điểm danh, lớp `billing_mode='session'` → học phí tháng đó giảm tương ứng
- [ ] Xoá 1 buổi, lớp `billing_mode='monthly'` → học phí KHÔNG đổi, chỉ log điểm danh mất
- [ ] Học sinh trùng lịch giữa 2 lớp → cảnh báo, vẫn cho lưu nếu xác nhận
- [ ] (Thêm case cụ thể cho task đang làm)
