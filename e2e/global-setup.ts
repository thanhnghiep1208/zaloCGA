import { test as setup } from "@playwright/test";
import * as path from "path";

export const USER_STATE = path.join(__dirname, ".auth/user.json");
export const ADMIN_STATE = path.join(__dirname, ".auth/admin.json");

/**
 * Logs in as a regular user and saves browser storage state.
 * Subsequent tests reuse this state instead of logging in each time.
 */
setup("authenticate as regular user", async ({ page }) => {
  const username = process.env.E2E_USER_USERNAME;
  const password = process.env.E2E_USER_PASSWORD;
  if (!username || !password) {
    console.warn("[E2E setup] E2E_USER_USERNAME/PASSWORD not set — skipping user auth save");
    return;
  }

  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: /đăng nhập/i }).click();
  await page.waitForURL(/\/chat/);

  await page.context().storageState({ path: USER_STATE });
});

setup("authenticate as admin", async ({ page }) => {
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!username || !password) {
    console.warn("[E2E setup] E2E_ADMIN_USERNAME/PASSWORD not set — skipping admin auth save");
    return;
  }

  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: /đăng nhập/i }).click();
  await page.waitForURL(/\/chat/);

  await page.context().storageState({ path: ADMIN_STATE });
});
