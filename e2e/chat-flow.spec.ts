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

test.describe("Visual prototype in the answer", () => {
  test.skip(
    !process.env.E2E_USER_USERNAME,
    "Set E2E_USER_USERNAME and E2E_USER_PASSWORD to run authenticated tests"
  );

  // Ca nặng nội dung: title + body + 3 bullet + helper + 3 nút.
  // Bản dựng phải hiện ĐỦ, đây là thứ từng bị lược mất.
  const SPEC = {
    pattern: "bottom-sheet",
    messageType: "error",
    title: "Không gửi được ảnh vì kết nối mạng bị ngắt",
    body: "Ảnh của bạn chưa được gửi đi. Hệ thống đã thử lại tự động 3 lần nhưng vẫn thất bại.",
    bullets: ["Kiểm tra Wi-Fi hoặc dữ liệu di động", "Ảnh phải nhỏ hơn 10MB", "Định dạng hỗ trợ: JPG, PNG"],
    helperText: "Bản nháp được lưu trong 24 giờ.",
    actions: [
      { label: "Thử lại ngay", kind: "primary" },
      { label: "Chọn ảnh khác", kind: "secondary" },
      { label: "Để sau", kind: "text" },
    ],
  };

  /** Canned NDJSON so this test never depends on the model actually complying. */
  function cannedChatStream(): string {
    return (
      JSON.stringify({ t: "s", d: [{ fileName: "guideline.pdf", excerpt: "quy tắc" }] }) +
      "\n" +
      JSON.stringify({ t: "x", d: "### Recommended final version\n\nDùng snackbar báo lỗi.\n\n" }) +
      "\n" +
      JSON.stringify({ t: "x", d: "[SOURCES_USED: guideline.pdf]" }) +
      "\n" +
      JSON.stringify({ t: "p", d: SPEC }) +
      "\n"
    );
  }

  test("renders the prototype from the stream without leaking raw JSON", async ({ userPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/x-ndjson; charset=utf-8" },
        body: cannedChatStream(),
      })
    );

    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Viết snackbar báo lỗi gửi ảnh");
    await composer.press("Enter");

    const prototype = page.getByTestId("prototype-preview");
    await expect(prototype).toBeVisible({ timeout: 15_000 });

    // Chips carry the human labels for the two facets
    await expect(prototype.getByText("Lỗi", { exact: true })).toBeVisible();
    await expect(prototype.getByText("Bottom sheet", { exact: true })).toBeVisible();

    // MỌI thông tin phải có mặt — không được lược bớt gì
    await expect(prototype.getByText(SPEC.title)).toBeVisible();
    await expect(prototype.getByText(SPEC.body)).toBeVisible();
    for (const bullet of SPEC.bullets) {
      await expect(prototype.getByText(bullet)).toBeVisible();
    }
    await expect(prototype.getByText(SPEC.helperText)).toBeVisible();
    for (const action of SPEC.actions) {
      await expect(prototype.getByText(action.label, { exact: true })).toBeVisible();
    }

    // Không có cảnh báo "không chở hết nội dung" cho bottom sheet
    await expect(prototype.getByText(/không chở hết nội dung/i)).toHaveCount(0);

    // Honesty caption — this is a rebuild, not a screenshot and not a generated image
    await expect(prototype.getByText(/không phải ảnh chụp màn hình/i)).toBeVisible();

    // Raw transport must never reach the DOM
    await expect(page.locator("body")).not.toContainText("zalo-prototype");
    await expect(page.locator("body")).not.toContainText('"messageType"');
    await expect(page.locator("body")).not.toContainText("SOURCES_USED");
  });

  test("copies the microcopy text to the clipboard", async ({ userPage: page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/x-ndjson; charset=utf-8" },
        body: cannedChatStream(),
      })
    );

    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Viết snackbar báo lỗi gửi ảnh");
    await composer.press("Enter");

    const prototype = page.getByTestId("prototype-preview");
    await expect(prototype).toBeVisible({ timeout: 15_000 });
    await prototype.getByRole("button", { name: /copy chữ/i }).click();

    await expect(prototype.getByText(/đã copy chữ/i)).toBeVisible();
    // Chữ copy ra phải chở đủ mọi dòng, mọi bullet, mọi nút
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(
      [
        SPEC.title,
        SPEC.body,
        ...SPEC.bullets.map((b) => `• ${b}`),
        SPEC.helperText,
        SPEC.actions.map((a) => a.label).join("  ·  "),
      ].join("\n")
    );
  });

  test("exports the prototype as a real JPG file", async ({ userPage: page }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/x-ndjson; charset=utf-8" },
        body: cannedChatStream(),
      })
    );

    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Viết snackbar báo lỗi gửi ảnh");
    await composer.press("Enter");

    const prototype = page.getByTestId("prototype-preview");
    await expect(prototype).toBeVisible({ timeout: 15_000 });

    const download = page.waitForEvent("download", { timeout: 30_000 });
    await prototype.getByRole("button", { name: /tải jpg/i }).click();
    const file = await download;

    // Tên file mang theo pattern + messageType để dán vào ticket là biết ngay của cái gì
    expect(file.suggestedFilename()).toBe("zalo-bottom-sheet-error.jpg");

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const bytes = Buffer.concat(chunks);

    // JPEG thật: SOI marker FF D8 FF, và đủ lớn để không phải ảnh rỗng
    expect(bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  test("warns instead of silently dropping content the pattern cannot show", async ({ userPage: page }) => {
    const overloaded = { ...SPEC, pattern: "snackbar" };
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 200,
        headers: { "content-type": "application/x-ndjson; charset=utf-8" },
        body:
          JSON.stringify({ t: "s", d: [] }) +
          "\n" +
          JSON.stringify({ t: "x", d: "Dùng snackbar." }) +
          "\n" +
          JSON.stringify({ t: "p", d: overloaded }) +
          "\n",
      })
    );

    await page.goto("/chat");
    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Viết snackbar báo lỗi gửi ảnh");
    await composer.press("Enter");

    const prototype = page.getByTestId("prototype-preview");
    await expect(prototype).toBeVisible({ timeout: 15_000 });

    // Snackbar là toast một dòng — phải nói rõ phần nào chưa dựng được
    await expect(prototype.getByText(/không chở hết nội dung/i)).toBeVisible();
    await expect(prototype.getByText(/3 ý trong danh sách/i)).toBeVisible();
    await expect(prototype.getByText(/2 nút phụ/i)).toBeVisible();
  });

  test("asks the real model for a prototype end to end", async ({ userPage: page }) => {
    test.skip(
      !process.env.E2E_RUN_LLM_TESTS,
      "Set E2E_RUN_LLM_TESTS=1 to exercise the live model"
    );
    test.setTimeout(120_000);

    await page.goto("/chat");
    // Pin the scope so the model has no room to guess the pattern
    await page.getByRole("button", { name: /loại thông báo/i }).click();
    await page.getByRole("button", { name: "Lỗi", exact: true }).click();
    await page.getByRole("button", { name: /kiểu ui/i }).click();
    await page.getByRole("button", { name: "Snackbar", exact: true }).click();

    const composer = page.getByRole("textbox", { name: /nội dung tin nhắn/i });
    await composer.fill("Viết snackbar báo lỗi khi gửi ảnh thất bại vì mất mạng");
    await composer.press("Enter");

    await expect(page.getByTestId("prototype-preview")).toBeVisible({ timeout: 90_000 });
  });
});
