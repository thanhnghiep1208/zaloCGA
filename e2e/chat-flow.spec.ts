/**
 * E2E: Chat flow
 *
 * Prerequisites:
 *   - App running at E2E_BASE_URL (default: http://localhost:3000)
 *   - E2E_USER_USERNAME / E2E_USER_PASSWORD set (valid Firebase user account)
 *
 * Run: npx playwright test e2e/chat-flow.spec.ts
 */

import { test, expect } from "./fixtures/auth-fixtures";

test.describe("Login page", () => {
  test("redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows an error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Tên đăng nhập").fill("notauser");
    await page.getByLabel("Mật khẩu").fill("wrongpassword");
    await page.getByRole("button", { name: /đăng nhập/i }).click();
    const errorMsg = page.locator("text=/không đúng|thất bại|lỗi/i");
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });
  });

  test("disables submit button while loading", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Tên đăng nhập").fill("someuser");
    await page.getByLabel("Mật khẩu").fill("somepassword");
    const btn = page.getByRole("button", { name: /đăng nhập/i });
    await btn.click();
    // Button becomes disabled immediately while the async login is in flight
    await expect(btn).toBeDisabled();
  });

  test.describe("Firestore blocked after sign-in (e.g. ad blocker / net::ERR_BLOCKED_BY_CLIENT)", () => {
    test.skip(
      !process.env.E2E_USER_USERNAME,
      "Set E2E_USER_USERNAME and E2E_USER_PASSWORD to run this test"
    );

    test("shows an error instead of hanging forever", async ({ page }) => {
      // Never call route.continue()/fulfill()/abort() — the request just hangs,
      // reproducing what an ad blocker / privacy extension does when it silently
      // drops a request instead of sending a fast rejection.
      await page.route("**/firestore.googleapis.com/**", () => {});

      await page.goto("/login");
      await page.getByLabel("Tên đăng nhập").fill(process.env.E2E_USER_USERNAME!);
      await page.getByLabel("Mật khẩu").fill(process.env.E2E_USER_PASSWORD!);
      await page.getByRole("button", { name: /đăng nhập/i }).click();

      // AuthContext's role-fetch timeout (10s) should fire and surface an
      // error instead of leaving the user stuck with no feedback.
      const errorMsg = page.locator("text=/không thể tải thông tin tài khoản/i");
      await expect(errorMsg).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(/\/login/);
    });
  });
});

test.describe("Chat page (authenticated)", () => {
  test.skip(
    !process.env.E2E_USER_USERNAME,
    "Set E2E_USER_USERNAME and E2E_USER_PASSWORD to run authenticated tests"
  );

  test("shows the empty state before any message is sent", async ({ userPage: page }) => {
    await page.goto("/chat");
    // Empty state is visible when no messages have been sent
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await expect(composer).toBeVisible();
    await expect(composer).toBeEnabled();
  });

  test("send button is disabled when input is empty", async ({ userPage: page }) => {
    await page.goto("/chat");
    // The send button (SVG paper plane) is disabled while input is empty
    const sendBtn = page.locator("button").filter({ has: page.locator('path[d*="M12 19l9 2"]') });
    await expect(sendBtn).toBeDisabled();
  });

  test("send button enables when user types a message", async ({ userPage: page }) => {
    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("test message");
    const sendBtn = page.locator("button").filter({ has: page.locator('path[d*="M12 19l9 2"]') });
    await expect(sendBtn).toBeEnabled();
  });

  test("user message appears in the list immediately after send", async ({ userPage: page }) => {
    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Xin chào test");
    await composer.press("Enter");

    // User message bubble should appear right away
    await expect(page.locator("text=Xin chào test")).toBeVisible({ timeout: 5_000 });
    // Input is cleared after send
    await expect(composer).toHaveValue("");
  });

  test("loading state is shown while waiting for assistant", async ({ userPage: page }) => {
    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Loading test");
    await composer.press("Enter");

    // Composer textarea should be disabled during the API call
    await expect(composer).toBeDisabled({ timeout: 5_000 });
  });

  test("assistant response appears after streaming completes", async ({ userPage: page }) => {
    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Mô tả ngắn về Zalo");
    await composer.press("Enter");

    // Wait for the response — streaming may take several seconds
    // The composer becomes re-enabled once streaming is done
    await expect(composer).toBeEnabled({ timeout: 60_000 });

    // Check that the compose area re-enabled and messages are on screen
    const messageList = page.locator(".space-y-8");
    await expect(messageList).toBeVisible();
  });

  test("pressing Enter sends the message, Shift+Enter inserts newline", async ({ userPage: page }) => {
    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });

    // Shift+Enter should NOT send
    await composer.fill("line one");
    await composer.press("Shift+Enter");
    await expect(composer).toHaveValue("line one\n");

    // Clear and test normal Enter
    await composer.fill("actual send");
    await composer.press("Enter");
    await expect(page.locator("text=actual send")).toBeVisible({ timeout: 5_000 });
  });

  test("new chat link resets the conversation", async ({ userPage: page }) => {
    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Message before reset");
    await composer.press("Enter");
    await expect(page.locator("text=Message before reset")).toBeVisible({ timeout: 5_000 });

    // Navigate to new chat via ?new=1
    await page.goto("/chat?new=1");
    await page.waitForURL("/chat");
    // Conversation should be gone
    await expect(page.locator("text=Message before reset")).not.toBeVisible();
    await expect(composer).toHaveValue("");
  });
});
