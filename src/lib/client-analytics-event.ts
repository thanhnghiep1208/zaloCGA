import type { User } from "firebase/auth";
import { firebaseBearerAuthHeader } from "@/lib/client-bearer-auth";
import type { ClientLoggedEventName } from "@/lib/analytics-events";

/** Fire-and-forget client telemetry via POST /api/events. */
export async function postClientAnalyticsEvent(
  user: User,
  eventName: ClientLoggedEventName,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const authHeader = await firebaseBearerAuthHeader(user);
    await fetch("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
      },
      body: JSON.stringify({ eventName, payload }),
    });
  } catch (e) {
    console.error(`Failed to log ${eventName}`, e);
  }
}
