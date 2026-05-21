# Analytics Reports

Dashboard telemetry nội bộ tại `/admin/reports` — chỉ tài khoản `role: "admin"`. Tài liệu này mô tả nguồn dữ liệu, cách tải/lọc, các chỉ số trên UI và file code liên quan.

Tổng quan kiến trúc app: [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

---

## Truy cập và bảo mật

- **Đường dẫn:** Sidebar → **Analytics Reports** (`/admin/reports`).
- **Client:** `ProtectedRoute` với `allowedRoles={["admin"]}`.
- **Firestore:** rules chỉ cho admin đọc `analyticsEvents` (và dữ liệu phụ trợ). User thường không vào được trang; fetch trả `permission-denied` nếu role sai.

---

## Collection `analyticsEvents`

Mỗi document:

| Field | Mô tả |
| --- | --- |
| `eventName` | Loại sự kiện (bảng dưới) |
| `payload` | Object tuỳ loại (thường có `user_id`) |
| `createdAt` | Server timestamp khi ghi |

**Quy tắc ghi:** chỉ server (Admin SDK) được `create`; client **không** ghi trực tiếp Firestore (`firestore.rules`: `write: false`).

### Các loại event

| `eventName` | Nguồn ghi | Payload chính |
| --- | --- | --- |
| `file_uploaded` | Client → `POST /api/events` (sau upload Storage, từ `/admin/upload`) | `file_type`, `size`, `user_id` |
| `parse_success` | Server → `/api/ingest` | `rule_count_extracted`, `latency_ms`, `user_id` |
| `query_sent` | Server → `/api/chat` | `query_text`, `type` (`guideline` \| `microcopy`), `user_id` |
| `response_delivered` | Server → `/api/chat` (sau stream xong) | `response_type`, `relevance_score`, `latency_ms`, `referenced_sources[]`, `user_id` |
| `user_feedback` | Client → `POST /api/events` (nút 👍/👎 trên `/chat`) | `feedback` (`thumbs_up` \| `thumbs_down`), `session_id`, `message_id`, `user_id` |
| `session_started` | Client → `POST /api/events` (tin chat đầu tạo session) | `session_id`, `user_id` |
| `session_ended` | Client → `POST /api/events` (unmount `/chat` hoặc idle 10 phút) | `session_id`, `duration_ms`, `query_count`, `user_id` |
| `response_copied` | Client → `POST /api/events` (nút copy câu trả lời) | `session_id`, `message_id`, `user_id` |

**Phân loại query:** `inferQueryType()` trong `src/lib/analytics-events.ts` — heuristic từ khóa (microcopy, toast, button, …); mặc định `guideline`.

**Relevance score:** `estimateRelevanceScore()` — overlap token đơn giản giữa câu hỏi và câu trả lời (0–1), không phải đánh giá LLM.

**API client telemetry:** `POST /api/events` chỉ whitelist `file_uploaded` và `user_feedback`; các event còn lại ghi từ server trong `/api/ingest` và `/api/chat`.

---

## Luồng dữ liệu (telemetry → dashboard)

```mermaid
flowchart LR
  upload[Upload + ingest] --> ae[analyticsEvents]
  chat[Chat API] --> ae
  clientEvents[POST /api/events] --> ae
  ae --> fetch[getDocs polling]
  cs[chatSessions sample] --> fetch
  users[users] --> fetch
  fetch --> filter[Time filter UTC]
  filter --> compute[compute metrics]
  compute --> ui[Reports UI]
```

1. Upload tài liệu → `file_uploaded`.
2. Ingest thành công → `parse_success`.
3. Chat → `query_sent`, sau stream → `response_delivered`.
4. 👍/👎 → `user_feedback`; copy câu trả lời → `response_copied`.
5. Phiên chat: tin đầu → `session_started`; rời trang / idle 10 phút → `session_ended`.
6. Trang reports **tải dữ liệu** (polling, **không** dùng `onSnapshot`):
   - Khi admin mở trang: `getDocs` — `analyticsEvents` (500 mới nhất), `users`, `chatSessions` (300 mới nhất).
   - **Tự động mỗi 6 giờ** (`REPORTS_AUTO_REFRESH_MS` trong hook).
   - Nút **Cập nhật** gọi cùng hàm fetch; hiển thị `Cập nhật lúc: …` (locale `vi-VN`).
7. **Bộ lọc thời gian** (client-side, **UTC**):
   - **Hôm nay** — từ 00:00 UTC ngày hiện tại.
   - **7 ngày** / **30 ngày** — rolling window từ thời điểm hiện tại.
   - Event: lọc theo `createdAt`. Session: lọc theo `updatedAt` (fallback max timestamp tin user nếu thiếu `updatedAt`).
8. **Chi tiết user:** nhấn dòng trong Top users → `UserAnalyticsDetailModal` dùng **cùng** tập event đã lọc.

### Giới hạn mẫu

| Nguồn | Limit | Ghi chú |
| --- | --- | --- |
| `analyticsEvents` | 500 | `orderBy createdAt desc` |
| `chatSessions` | 300 | `orderBy updatedAt desc` |

Filter 30 ngày chỉ áp trên mẫu đã tải — **không** query Firestore theo khoảng ngày. Traffic cao có thể khiến 500 event mới nhất không phủ đủ 30 ngày lịch sử.

---

## User Behavior (mục riêng trên UI)

| Chỉ số | Nguồn |
| --- | --- |
| Avg queries / session, avg duration | Ưu tiên `session_ended` trong mẫu event; fallback `chatSessions` |
| Re-query rate | Tin user trong `chatSessions`; hai lượt cách nhau ≤ 2 phút (`RE_QUERY_GAP_MS`) |
| DAU chart | Unique `user_id` từ `query_sent` theo ngày — 1 / 7 / 30 cột tùy filter |
| Top users | `query_sent`, relevance từ `response_delivered`, feedback từ `user_feedback` |
| Response copies | Đếm `response_copied` |

`query_sent` hiện **chưa** có `session_id` trong payload — re-query dựa `chatSessions`, không gắn trực tiếp event telemetry.

---

## Nhóm metric trên UI

### Upload & Parsing

| Chỉ số UI | Cách tính (tóm tắt) |
| --- | --- |
| Số lượng file upload | Đếm `file_uploaded` |
| PDF / Word / khác | Phân loại từ `payload.file_type` |
| Kích thước trung bình | Trung bình `payload.size` (KB) |
| Tỷ lệ parse thành công | `parse_success` / `file_uploaded` × 100% |
| Avg parse latency | Trung bình `latency_ms` trên `parse_success` |
| Coverage rules | Tổng / trung bình `rule_count_extracted` trên `parse_success` |

### Query & Response

| Chỉ số UI | Cách tính (tóm tắt) |
| --- | --- |
| Invocation count | Đếm `query_sent` (guideline vs microcopy) |
| Success rate (proxy) | 👍 / (👍 + 👎) × 100% — *không* phải tỷ lệ HTTP thành công |
| Response quality | Trung bình `relevance_score` trên `response_delivered` |
| Feedback rate | (👍 + 👎) / số `response_delivered` × 100% |
| Avg response latency | Trung bình `latency_ms` trên `response_delivered` |

### Hiệu suất & Retention

| Chỉ số UI | Cách tính (tóm tắt) |
| --- | --- |
| Latency by complexity | Avg latency theo `response_type` guideline / microcopy |
| Usage funnel | Upload→Parse, Parse→Query, Query→Accepted (%) |
| Retention D1 / D7 | % user quay lại ngày +1 / +7 sau ngày đầu có event |
| Top referenced sources | File trong `referenced_sources` của `response_delivered` |

Khi chọn filter **Hôm nay**, retention D1/D7 phản ánh cohort trong mẫu ngắn — diễn giải cẩn thận khi đọc số.

---

## Cấu trúc code

| Thành phần | Vai trò |
| --- | --- |
| `src/app/admin/reports/page.tsx` | UI sections, `useMemo` filter + compute |
| `src/hooks/useAnalyticsReportsData.ts` | `getDocs`, `refresh()`, interval 6h |
| `src/components/reports/ReportsToolbar.tsx` | Filter Hôm nay / 7 ngày / 30 ngày + Cập nhật |
| `src/components/UserAnalyticsDetailModal.tsx` | Timeline / query / feedback theo user |
| `src/lib/reports/date-utils.ts` | `ReportsTimeRange`, `eventInRange`, `sessionInRange` |
| `src/lib/reports/compute-user-behavior.ts` | User Behavior + DAU |
| `src/lib/reports/compute-event-summary.ts` | Upload, query, retention, funnel |
| `src/lib/reports/types.ts` | Limits: `ANALYTICS_EVENT_LIMIT` (500), `CHAT_SESSION_SAMPLE_LIMIT` (300) |
| `src/lib/analytics-events.ts` | Ghi event, `inferQueryType`, `estimateRelevanceScore` |

**Tests (Vitest):** `src/lib/reports/*.test.ts`, chạy `npm test`.

---

## Khi dashboard trống hoặc sai số

| Triệu chứng | Nguyên nhân thường gặp |
| --- | --- |
| Toàn trống / “Chưa có dữ liệu trong khoảng đã chọn” | Chưa có event trong filter; hoặc mẫu 500 event không có bản ghi trong khoảng 30 ngày |
| Không vào được trang | Role ≠ `admin` |
| Fetch lỗi | `permission-denied` hoặc mạng; xem banner lỗi + bấm **Cập nhật** |
| Số không đổi sau hoạt động mới | Đợi tối đa 6h auto-refresh hoặc bấm **Cập nhật** thủ công |
| Khác với Google Analytics | `NEXT_PUBLIC_GA_ID` (gtag) là kênh riêng — không đổ vào Reports |

---

## Smoke test (admin)

1. Đăng nhập admin → mở `/admin/reports`.
2. Đổi **Hôm nay** / **7 ngày** / **30 ngày** — số liệu và DAU chart thay đổi hợp lý.
3. Bấm **Cập nhật** — dòng *Cập nhật lúc* đổi.
4. (Sau traffic) Upload + ingest + chat + 👍/👎 → metrics > 0.
5. Nhấn một user trong Top users → modal mở, timeline khớp filter.

Chi tiết pre-live: [PRE_LIVE_ENV_CHECKLIST.md](./PRE_LIVE_ENV_CHECKLIST.md).

---

## File và API liên quan

- `src/app/api/events/route.ts` — client telemetry
- `src/app/api/chat/route.ts` — `query_sent`, `response_delivered`
- `src/app/api/ingest/route.ts` — `parse_success`
