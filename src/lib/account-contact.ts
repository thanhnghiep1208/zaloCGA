/** Contact shown on /login for account requests. Empty string = hidden. */
export interface AccountContact {
  email: string;
  zalo: string;
}

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZALO_PATTERN = /^\+?[0-9 ]{8,20}$/;

export function validateAccountContactBody(
  body: unknown
): { ok: true; data: AccountContact } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const zalo = typeof b.zalo === "string" ? b.zalo.trim() : "";

  if (email && (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
    return { ok: false, message: "Email không hợp lệ." };
  }
  if (zalo && !ZALO_PATTERN.test(zalo)) {
    return { ok: false, message: "Số Zalo chỉ gồm chữ số (8–20 ký tự, có thể bắt đầu bằng +)." };
  }
  return { ok: true, data: { email, zalo } };
}
