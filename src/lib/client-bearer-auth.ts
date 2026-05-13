import type { User } from "firebase/auth";

/** Firebase ID token as `Authorization: Bearer …` for same-origin API routes. */
export async function firebaseBearerAuthHeader(
  user: User | null | undefined
): Promise<{ Authorization: string }> {
  if (!user) {
    throw new Error("Not authenticated");
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}
