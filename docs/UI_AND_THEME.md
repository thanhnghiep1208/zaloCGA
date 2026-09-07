# UI & theme (triển khai trong repo)

Tài liệu này mô tả **giao diện thực tế** của app (Next.js + Tailwind v4): font, token CSS, shell, và chỗ cần chỉnh khi làm màn mới.  
Để xem **hệ quy chiếu thương hiệu / cảm hứng Superhuman** (mô tả mang tính tham chiếu), xem `docs/DESIGN.md`.

## Hướng thiết kế ngắn

- **Tông:** SaaS tinh chỉnh, “glass-forward” — nền sáng có wash nhẹ, surface trong suốt một phần + `backdrop-blur`, viền hairline.
- **Thương hiệu Zalo:** giữ trục **xanh** (`--charcoal`, `--link`, `--accent`) và **mysteria** cho hero tối; không đổi logic màu semantic trong Firestore/UI role.

## Typography

- **Font UI:** [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) qua `next/font/google` trong `src/app/layout.tsx`.
  - Biến CSS: `--font-app-sans` (class + variable từ Next).
  - `html` gắn `plusJakarta.variable`; `body` gắn `plusJakarta.className`.
- **Tailwind `font-sans`:** map trong `@theme inline` (`src/app/globals.css`) tới `var(--font-app-sans), …`.
- **Body:** `src/app/globals.css` đặt `font-family: var(--font-ui)` với `--font-ui` trỏ cùng stack Jakarta.

## Token màu & độ sâu (CSS variables)

Nguồn sự thật: `src/app/globals.css` (`:root`, `[data-theme="light"]`, `[data-theme="dark"]`).

| Nhóm | Biến (semantic) | Ghi chú |
|------|-----------------|--------|
| Nền / chữ | `--background`, `--foreground` | Light: nền `#f4f6fb`; dark: nền `#12101f` |
| Surface / viền | `--surface`, `--border` | Dark: surface glass `rgba(…, 0.92)` |
| Nhấn / link | `--accent`, `--accent-hover`, `--link` | Xanh guideline Zalo |
| Thương hiệu tối | `--mysteria` | Hero / gradient landing |
| Shadow | `--shadow-xs`, `--shadow-sm`, `--shadow-md` | Card, header, CTA |
| Legacy / prose | `--cream`, `--charcoal`, `--parchment`, `--strong-color` | Nút, border hover, markdown chat |
| Scope picker (chat) | `--scope-info`, `--scope-error`, `--scope-warning`, `--scope-success`, `--scope-confirm`, `--scope-empty` | Dot màu + chip cho `ChatScopePicker` (`src/components/chat/ChatScopePicker.tsx`); dùng qua `color-mix()` cho nền tint, không dùng làm tín hiệu duy nhất (luôn kèm label chữ). Bản dựng minh hoạ dùng lại đúng bảng màu này qua `accentFor()` — **không tạo bảng map thứ hai** |
| Bản dựng minh hoạ | `--proto-surface`, `--proto-surface-2`, `--proto-text`, `--proto-text-muted`, `--proto-divider` | Bề mặt mock trong `src/components/chat/prototype/` — cố ý **không** dùng `--surface` của app, vì mock phải đọc ra như Zalo mobile chứ không phải chrome của chính app này |
| Overlay trong bản dựng | `--proto-overlay`, `--proto-on-overlay` | Snackbar & tooltip là overlay tối ở **cả hai theme** — chúng không lật màu theo app, nên hai biến này cố ý không phải là nghịch đảo của `--proto-text`/`--proto-surface` |
| Chrome Zalo trong bản dựng | `--proto-brand`, `--proto-bubble-out`, `--proto-chat-bg` | Xanh Zalo cho status bar/header, bong bóng tin nhắn gửi đi, nền luồng chat |

**Bản dựng minh hoạ (`src/components/chat/prototype/`):** chuẩn UI cho 8 kiểu pattern nằm trong `patterns.tsx` và được review qua PR — model chỉ đổ nội dung chữ vào, không bao giờ tự chọn màu/icon/kích thước. Mỗi pattern dựng trên một màn hình Zalo đầy đủ (status bar → header → luồng chat → thanh nhập liệu), khung `SCREEN_W`×`SCREEN_H` = 320×600. Xuất JPG/PNG ngay trên trình duyệt qua `src/lib/chat/prototype-image.ts`. Xem `docs/PROJECT_OVERVIEW.md` §5.7.

**Theme switch:** `src/context/ThemeContext.tsx` — DOM nhận `data-theme="light" | "dark"` (đồng bộ với token ở trên).

## Tailwind v4

- Cấu hình **CSS-first**: `@import "tailwindcss"` + `@theme inline { … }` trong `globals.css`.
- Màu dùng trong class dạng `bg-background`, `text-foreground`, `border-border`, v.v. — khớp với các key trong `@theme inline`.

## Shell & layout

| File | Vai trò |
|------|--------|
| `src/components/AppShell.tsx` | Layout sau login: sidebar + header; nền có radial gradient nhẹ; drawer mobile blur + shadow. |
| `src/components/Header.tsx` | Sticky, `backdrop-blur-md`, shadow token. |
| `src/components/Sidebar.tsx` | `bg-surface/95` + blur; nav bo `rounded-xl`. |

Trang **không** dùng shell: `/`, `/login` — chỉ children (xem điều kiện `isAuthPage` trong `AppShell`).

## Pattern component

- **Thẻ / khối nội dung:** class `.clay-card` (nền `var(--surface)`, viền, `border-radius: 16px`, shadow `--shadow-sm`).
- **Hover nhẹ:** `.clay-hover-playful` — opacity / border / shadow tinh chỉnh (tránh transform gắt).

Khi thêm màn admin hoặc form: ưu tiên `clay-card` + token `border-border`, `bg-surface`, `text-muted` để đồng bộ dark/light.

## Checklist khi thêm trang mới

1. Dùng semantic màu (`bg-background`, `text-foreground`, …), tránh hard-code hex trừ khi có lý do rõ (OG, brand asset).
2. Kiểm tra **dark mode** (`data-theme="dark"`).
3. Nút / link: giữ độ tương phản (WCAG) — accent xanh trên nền sáng thường ổn; chữ phụ dùng `text-muted`.
4. Sau khi sửa file **code** (không chỉ `.md`), chạy `graphify update .` theo rule dự án nếu có graphify.

## File liên quan (tham chiếu nhanh)

- `src/app/layout.tsx` — font, `lang="vi"`, providers.
- `src/app/globals.css` — theme, Tailwind `@theme`, clay utilities.
- `src/app/page.tsx`, `src/app/login/page.tsx` — landing & đăng nhập (card glass, gradient ambient; login: username/password, copy *Zalo Content Guidelines*, footer liên hệ cấp tài khoản).
- `src/context/ThemeContext.tsx` — toggle theme.
