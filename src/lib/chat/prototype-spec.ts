// Contract cho "bản dựng minh hoạ" (visual prototype) mà model xuất kèm câu trả lời.
//
// Model CHỈ cung cấp nội dung chữ + chọn pattern/messageType. Màu, icon, bo góc,
// spacing, font đều do component quyết định — chuẩn UI nằm trong code, không nằm
// trong trí tưởng tượng của LLM.
//
// NGUYÊN TẮC NỘI DUNG: bản dựng phải chở được ĐẦY ĐỦ thông tin bản gốc của user,
// chỉ sửa cách viết cho đúng guideline. Vì vậy schema có `bullets` và `actions[]`
// (không giới hạn 2 nút), và giới hạn độ dài đặt ở mức microcopy thật không bao
// giờ chạm tới — cắt chữ là làm mất thông tin, tệ hơn là layout hơi dài.
//
// Module này isomorphic: dùng chung cho /api/chat (server) và stream parser (client).

import { z } from "zod";
import {
  MESSAGE_TYPE_OPTIONS,
  UI_PATTERN_OPTIONS,
  type MessageType,
  type UiPattern,
} from "./scope-options";

/** Nguồn sự thật cho enum — derive từ scope-options để không bao giờ lệch. */
export const PROTOTYPE_UI_PATTERNS: UiPattern[] = UI_PATTERN_OPTIONS.map((o) => o.value);
export const PROTOTYPE_MESSAGE_TYPES: MessageType[] = MESSAGE_TYPE_OPTIONS.map((o) => o.value);

/** Giới hạn nới rộng: chỉ là chặn lạm dụng, microcopy thật không chạm tới. */
export const LIMITS = {
  title: 140,
  body: 900,
  bullet: 300,
  bulletCount: 10,
  helperText: 300,
  actionLabel: 48,
  actionCount: 4,
} as const;

const ACTION_KINDS = ["primary", "secondary", "text"] as const;

/** Cắt chỉ khi vượt ngưỡng lạm dụng — không phải cơ chế "gọt cho vừa layout". */
const capped = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((s) => (s.length > max ? s.slice(0, max).trimEnd() + "…" : s));

const ActionSchema = z.object({
  label: capped(LIMITS.actionLabel),
  kind: z.enum(ACTION_KINDS).default("secondary"),
});

/** Gộp field cũ (primaryAction/secondaryAction) vào actions[] để spec đã lưu vẫn đọc được. */
function foldLegacyActions(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const raw = { ...(input as Record<string, unknown>) };

  const legacy: unknown[] = [];
  if (typeof raw.primaryAction === "string") legacy.push({ label: raw.primaryAction, kind: "primary" });
  if (typeof raw.secondaryAction === "string") legacy.push({ label: raw.secondaryAction, kind: "secondary" });
  delete raw.primaryAction;
  delete raw.secondaryAction;

  if (legacy.length > 0) {
    const existing = Array.isArray(raw.actions) ? raw.actions : [];
    raw.actions = [...existing, ...legacy];
  }
  return raw;
}

const ShapeSchema = z
  .object({
    pattern: z.enum(PROTOTYPE_UI_PATTERNS),
    messageType: z.enum(PROTOTYPE_MESSAGE_TYPES),
    title: capped(LIMITS.title).optional(),
    body: capped(LIMITS.body).optional(),
    /** Danh sách / nhiều dòng trong bản gốc — đừng nhồi vào body rồi mất cấu trúc. */
    bullets: z.array(capped(LIMITS.bullet)).max(LIMITS.bulletCount).optional(),
    helperText: capped(LIMITS.helperText).optional(),
    /** Đủ mọi nút của bản gốc, không chỉ 2. */
    actions: z.array(ActionSchema).max(LIMITS.actionCount).optional(),
  })
  // z.object strips unknown keys by default — model hay thêm field, đừng vì thế mà loại spec.
  .refine((s) => Boolean(s.title || s.body || s.bullets?.length), {
    message: "prototype spec needs a title, a body, or bullets",
  });

export const PrototypeSpecSchema = z.preprocess(foldLegacyActions, ShapeSchema);

export type PrototypeAction = z.infer<typeof ActionSchema>;
export type PrototypeSpec = z.infer<typeof ShapeSchema>;

/**
 * Validate spec từ model hoặc từ Firestore. Trả null nếu không dùng được —
 * caller im lặng bỏ qua, câu trả lời markdown vốn đã đứng độc lập được.
 */
export function sanitizePrototypeSpec(input: unknown): PrototypeSpec | null {
  const parsed = PrototypeSpecSchema.safeParse(input);
  return parsed.success ? (parsed.data as PrototypeSpec) : null;
}

/** Microcopy dạng text để copy sang Figma/ticket — phải chở đủ mọi dòng. */
export function prototypeMicrocopy(spec: PrototypeSpec): string {
  const lines: string[] = [];
  if (spec.title) lines.push(spec.title);
  if (spec.body) lines.push(spec.body);
  for (const b of spec.bullets ?? []) lines.push(`• ${b}`);
  if (spec.helperText) lines.push(spec.helperText);
  const actions = (spec.actions ?? []).map((a) => a.label);
  if (actions.length) lines.push(actions.join("  ·  "));
  return lines.join("\n");
}

const patternList = PROTOTYPE_UI_PATTERNS.join(" | ");
const messageTypeList = PROTOTYPE_MESSAGE_TYPES.join(" | ");

/**
 * Đoạn prompt mô tả contract, sinh từ chính enum ở trên nên prompt và schema
 * không thể âm thầm lệch nhau (có test chặn).
 */
export const PROTOTYPE_PROMPT_SECTION = `### BẢN DỰNG MINH HOẠ (tuỳ chọn — chỉ dành cho Kiểu B)
Nếu — và CHỈ NẾU — bạn xác định được CHÍNH XÁC MỘT kiểu UI trong danh sách cho phép, hãy xuất thêm MỘT khối mã ngay TRƯỚC dòng [SOURCES_USED: ...]:

\`\`\`zalo-prototype
{"pattern":"bottom-sheet","messageType":"error","title":"Không gửi được ảnh","body":"Ảnh chưa được gửi vì kết nối mạng bị ngắt.","bullets":["Kiểm tra Wi-Fi hoặc dữ liệu di động","Ảnh phải nhỏ hơn 10MB","Định dạng hỗ trợ: JPG, PNG"],"helperText":"Ảnh vẫn được lưu trong máy của bạn.","actions":[{"label":"Thử lại","kind":"primary"},{"label":"Chọn ảnh khác","kind":"secondary"},{"label":"Để sau","kind":"text"}]}
\`\`\`

**QUY TẮC QUAN TRỌNG NHẤT — KHÔNG ĐƯỢC LÀM MẤT THÔNG TIN:**
- Bản dựng phải chở ĐẦY ĐỦ mọi thông tin có trong nội dung gốc của người dùng (lấy từ câu hỏi và/hoặc ảnh họ gửi): mọi dòng chữ, mọi nhãn, mọi nút, mọi ghi chú, mọi mục trong danh sách.
- Bạn CHỈ sửa cách viết cho đúng guideline (tone, xưng hô, thuật ngữ, độ dài từng nhãn). TUYỆT ĐỐI KHÔNG bỏ bớt, không gộp nhiều ý thành một, không lược thành "v.v.".
- Bản gốc có danh sách hoặc nhiều dòng → đưa vào \`bullets\`, mỗi ý một phần tử. Đừng nhồi hết vào \`body\` làm mất cấu trúc.
- Bản gốc có nhiều hơn 2 nút → liệt kê ĐỦ trong \`actions\` (tối đa ${LIMITS.actionCount}).
- Một thông tin không khớp field nào → đưa vào \`body\` hoặc \`bullets\`, đừng bỏ đi.
- Nếu bản gốc dài, cứ viết dài: khung máy tự giãn theo nội dung. Thà bản dựng cao hơn còn hơn thiếu thông tin.

Quy tắc kỹ thuật:
- \`pattern\` BẮT BUỘC, chọn một trong: ${patternList}
- \`messageType\` BẮT BUỘC, chọn một trong: ${messageTypeList}
- Ghi ĐÚNG chuỗi tiếng Anh ở trên: không dịch, không đổi hoa/thường, không bỏ dấu gạch nối.
- Field tuỳ chọn: \`title\` (≤${LIMITS.title} ký tự), \`body\` (≤${LIMITS.body}), \`bullets\` (≤${LIMITS.bulletCount} ý, mỗi ý ≤${LIMITS.bullet}), \`helperText\` (≤${LIMITS.helperText}), \`actions\` (≤${LIMITS.actionCount} nút, mỗi \`label\` ≤${LIMITS.actionLabel}).
- Mỗi action là \`{"label":"...","kind":"primary"|"secondary"|"text"}\` — đúng MỘT nút \`primary\` là hành động chính.
- Phải có ít nhất \`title\`, \`body\` HOẶC \`bullets\`.
- JSON hợp lệ: không comment, không trailing comma, không dấu \` bên trong.
- KHÔNG tự chọn màu, icon, kích thước, bo góc hay font — hệ thống tự áp chuẩn thiết kế.
- Nếu KHÔNG chắc chắn kiểu UI, hoặc câu hỏi thuộc Kiểu A: BỎ QUA hoàn toàn khối này và KHÔNG giải thích lý do bỏ qua.
- Tối đa MỘT khối cho mỗi câu trả lời.`;
