/**
 * E2E: Admin upload flow
 *
 * Prerequisites:
 *   - App running at E2E_BASE_URL (default: http://localhost:3000)
 *   - E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD set (Firebase account with admin role)
 *   - E2E_USER_USERNAME / E2E_USER_PASSWORD for non-admin access-guard test
 *
 * Run: npx playwright test e2e/admin-upload.spec.ts
 */

import { test, expect } from "./fixtures/auth-fixtures";

test.describe("Admin upload page — access guard", () => {
  test("redirects unauthenticated visitors to /login", async ({ page }) => {
    await page.goto("/admin/upload");
    await expect(page).toHaveURL(/\/login/);
  });

  test.skip(
    !process.env.E2E_USER_USERNAME,
    "Set E2E_USER_USERNAME to test non-admin access guard"
  );

  test("non-admin user cannot access admin upload page", async ({ userPage: page }) => {
    await page.goto("/admin/upload");
    // ProtectedRoute should redirect or show a forbidden message
    const isRedirectedOrForbidden =
      (await page.url()).includes("/chat") ||
      (await page.locator("text=/forbidden|không có quyền|403/i").count()) > 0;
    expect(isRedirectedOrForbidden).toBe(true);
  });
});

test.describe("Admin upload page — UI (authenticated admin)", () => {
  test.skip(
    !process.env.E2E_ADMIN_USERNAME,
    "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run admin tests"
  );

  test("shows mode switcher with Upload and Compose tabs", async ({ adminPage: page }) => {
    await page.goto("/admin/upload");
    await expect(page.getByRole("button", { name: /upload pdf/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /soan tai lieu/i })).toBeVisible();
  });

  test("upload tab shows file drop zone by default", async ({ adminPage: page }) => {
    await page.goto("/admin/upload");
    await expect(page.getByRole("button", { name: /upload pdf/i })).toBeVisible();
    // Drop zone / file input area
    const dropZone = page.locator("text=Select multiple files here");
    await expect(dropZone).toBeVisible();
  });

  test("switching to Compose tab shows the inline editor", async ({ adminPage: page }) => {
    await page.goto("/admin/upload");
    await page.getByRole("button", { name: /soan tai lieu/i }).click();
    // The inline editor has a Title field
    const titleInput = page.getByPlaceholder(/tieu de/i).or(page.locator('[placeholder*="title" i]'));
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
  });

  test("switching back to Upload tab hides inline editor", async ({ adminPage: page }) => {
    await page.goto("/admin/upload");
    await page.getByRole("button", { name: /soan tai lieu/i }).click();
    await page.getByRole("button", { name: /upload pdf/i }).click();
    const dropZone = page.locator("text=Select multiple files here");
    await expect(dropZone).toBeVisible();
  });

  test("selecting a file shows the file list panel", async ({ adminPage: page }) => {
    // Create a minimal test PDF in memory via the Blob API in the browser
    await page.goto("/admin/upload");

    // Use Playwright's file chooser to set a file
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('label').filter({ has: page.locator('input[type="file"]') }).click(),
    ]);
    await fileChooser.setFiles({
      name: "test-doc.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
    });

    // File list panel should appear
    await expect(page.locator("text=Selected Files")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=test-doc.pdf")).toBeVisible();
  });

  test("can fill description and tags after file selection", async ({ adminPage: page }) => {
    await page.goto("/admin/upload");

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('label').filter({ has: page.locator('input[type="file"]') }).click(),
    ]);
    await fileChooser.setFiles({
      name: "test-doc.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
    });

    await page.getByPlaceholder(/batch upload/i).fill("E2E test description");
    await page.getByPlaceholder(/policy, rules/i).fill("e2e, test");

    await expect(page.getByPlaceholder(/batch upload/i)).toHaveValue("E2E test description");
    await expect(page.getByPlaceholder(/policy, rules/i)).toHaveValue("e2e, test");
  });

  test("Clear All button removes all selected files", async ({ adminPage: page }) => {
    await page.goto("/admin/upload");

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('label').filter({ has: page.locator('input[type="file"]') }).click(),
    ]);
    await fileChooser.setFiles({
      name: "test-doc.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
    });

    await expect(page.locator("text=test-doc.pdf")).toBeVisible();
    await page.getByRole("button", { name: /clear all/i }).click();

    // Drop zone should reappear
    await expect(page.locator("text=Select multiple files here")).toBeVisible();
    await expect(page.locator("text=test-doc.pdf")).not.toBeVisible();
  });

  test("individual file remove button works", async ({ adminPage: page }) => {
    await page.goto("/admin/upload");

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('label').filter({ has: page.locator('input[type="file"]') }).click(),
    ]);
    await fileChooser.setFiles([
      { name: "doc1.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 a") },
      { name: "doc2.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 b") },
    ]);

    await expect(page.locator("text=doc1.pdf")).toBeVisible();
    await expect(page.locator("text=doc2.pdf")).toBeVisible();

    // Remove first file using its delete icon
    await page.locator("text=doc1.pdf").locator("..").locator("..").getByRole("button").click();
    await expect(page.locator("text=doc1.pdf")).not.toBeVisible();
    await expect(page.locator("text=doc2.pdf")).toBeVisible();
  });
});
