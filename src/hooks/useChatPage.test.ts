// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const nav = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn() },
  params: new URLSearchParams("new=1"),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => nav.params,
}));

const auth = vi.hoisted(() => ({ user: { uid: "u1" } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));

vi.mock("@/lib/client-analytics-event", () => ({ postClientAnalyticsEvent: vi.fn() }));
vi.mock("@/lib/chatHistory", () => ({ updateChatSession: vi.fn(), createChatSession: vi.fn() }));
vi.mock("@/lib/client-bearer-auth", () => ({ firebaseBearerAuthHeader: vi.fn() }));
vi.mock("@/lib/chat/upload-attachments", () => ({ uploadChatAttachments: vi.fn() }));

import { useChatPage } from "./useChatPage";

/** Let the ?new=1 effect's async body (it awaits endSessionAnalytics) run to completion. */
const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

beforeEach(() => {
  nav.router.replace.mockReset();
  nav.params = new URLSearchParams("new=1");
});

describe("useChatPage — New Chat (?new=1)", () => {
  it("resets and redirects exactly once instead of re-running on every render", async () => {
    renderHook(() => useChatPage());
    await flush();

    expect(nav.router.replace).toHaveBeenCalledTimes(1);
    expect(nav.router.replace).toHaveBeenCalledWith("/chat");
  });

  it("does not redirect back to /chat after the user has already navigated away", async () => {
    const { unmount } = renderHook(() => useChatPage());
    unmount();
    await flush();

    expect(nav.router.replace).not.toHaveBeenCalled();
  });
});
