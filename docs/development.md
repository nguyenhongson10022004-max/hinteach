# Development Environment — HinTeach

> Thông tin vận hành máy dev. Cập nhật: 2026-08-27.
> Không chứa business rule — xem `CLAUDE.md` root và `docs/specs/`.
> Không chứa tiến độ — xem `STATUS.md`.

---

## Local WordPress

- Chạy bằng **LocalWP**, tên site "hinteach", domain `hinteach.local`.
- **Symlink**: `C:\Users\nguye\Local Sites\hinteach\app\public\wp-content\plugins\hinteach` → `C:\CLASS\HinTeach-CLAUDE-md\HinTeach` (cùng 1 nơi vật lý, không copy tay).
- Trang chứa dashboard: slug `dashboard` (`hinteach.local/dashboard/`), nội dung trang chỉ có `[hinteach_dashboard]`.

---

## Quy trình dev

### PHP
Sửa file PHP → **có hiệu lực ngay** khi refresh trình duyệt.

### JavaScript
Sửa file JS → **BẮT BUỘC** chạy `npm run build` trước khi refresh:
```bash
cd C:\CLASS\HinTeach-CLAUDE-md\HinTeach
npm run build
```
Rồi `Ctrl+Shift+R` (xóa cache trình duyệt). Nếu quên bước `npm run build`, thay đổi JS sẽ KHÔNG có hiệu lực dù code đã sửa đúng.

### Cài lại dependencies
```bash
npm install                             # Node dependencies (esbuild)
composer install --ignore-platform-reqs # PHP dependencies (PhpSpreadsheet, PhpWord)
```

---

## Node.js & Build

- Node.js LTS đã cài (`node -v` → v24.19.0)
- Build tool: esbuild (qua `build.mjs`)
- Output: `assets/dist/hinteach-dashboard.min.js` + `assets/dist/modules/*.min.js`
- Terminal trong Antigravity mặc định là PowerShell, đã chạy `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

---

## Composer & PHP Libraries

- `phpoffice/phpspreadsheet` v5.9.0 — import Excel/CSV
- `phpoffice/phpword` v1.1.0 — import Word (.docx bảng)
- `vendor/` đã thêm vào `.gitignore`

---

## Tài khoản test

| Username | Role | Mục đích |
|---|---|---|
| `teacher_test` | HinTeach Giáo viên | Test giao diện giáo viên |
| `sonskt2002` | Admin gốc WP | Vào `wp-admin` full quyền (tạo trang, sửa user...) |

---

## Git

- Repo đã init, 4 commits trên `master`.
- `vendor/` và `node_modules/` đã untrack (`.gitignore`).
- `assets/dist/` cũng đã thêm vào `.gitignore`.
