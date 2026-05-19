import {
  isValidProvisionedPassword,
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from "@/lib/auth-username";

export type ProvisionUserRole = "admin" | "contributor" | "user";

export interface CreateAdminUserBody {
  username: string;
  password: string;
  role?: ProvisionUserRole;
  displayName?: string;
}

export interface PatchAdminUserBody {
  role?: ProvisionUserRole;
  password?: string;
  disabled?: boolean;
  displayName?: string;
}

export function parseProvisionRole(value: unknown): ProvisionUserRole | null {
  if (value === "admin" || value === "contributor" || value === "user") {
    return value;
  }
  return null;
}

export function validateCreateAdminUserBody(
  body: unknown
): { ok: true; data: CreateAdminUserBody } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;
  const username = typeof b.username === "string" ? b.username : "";
  const password = typeof b.password === "string" ? b.password : "";
  const displayName =
    typeof b.displayName === "string" && b.displayName.trim()
      ? b.displayName.trim()
      : undefined;

  if (!isValidUsername(username)) {
    return {
      ok: false,
      message:
        "Username must be 3–32 characters (lowercase letters, numbers, . _ -).",
    };
  }
  if (!isValidProvisionedPassword(password)) {
    return { ok: false, message: "Password must be at least 8 characters." };
  }

  const roleRaw = b.role === undefined ? "user" : b.role;
  const role = parseProvisionRole(roleRaw);
  if (!role) {
    return { ok: false, message: "Invalid role" };
  }

  return {
    ok: true,
    data: {
      username: normalizeUsername(username),
      password,
      role,
      displayName,
    },
  };
}

export function validatePatchAdminUserBody(
  body: unknown
): { ok: true; data: PatchAdminUserBody } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;
  const data: PatchAdminUserBody = {};

  if ("role" in b) {
    const role = parseProvisionRole(b.role);
    if (!role) return { ok: false, message: "Invalid role" };
    data.role = role;
  }
  if ("password" in b) {
    const password = typeof b.password === "string" ? b.password : "";
    if (!isValidProvisionedPassword(password)) {
      return { ok: false, message: "Password must be at least 8 characters." };
    }
    data.password = password;
  }
  if ("disabled" in b) {
    if (typeof b.disabled !== "boolean") {
      return { ok: false, message: "disabled must be a boolean" };
    }
    data.disabled = b.disabled;
  }
  if ("displayName" in b) {
    data.displayName =
      typeof b.displayName === "string" ? b.displayName.trim() : "";
  }

  if (
    data.role === undefined &&
    data.password === undefined &&
    data.disabled === undefined &&
    data.displayName === undefined
  ) {
    return { ok: false, message: "No fields to update" };
  }

  return { ok: true, data };
}

export function buildAuthEmailForUsername(username: string): string {
  return usernameToAuthEmail(username);
}
