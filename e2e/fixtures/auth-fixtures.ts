/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const USER_STATE = path.join(__dirname, "../.auth/user.json");
const ADMIN_STATE = path.join(__dirname, "../.auth/admin.json");

/** Login via the UI and return. Throws if login page shows an error. */
async function loginViaUI(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: /đăng nhập/i }).click();
  await page.waitForURL(/\/chat/, { timeout: 15_000 });
}

type AuthFixtures = {
  /** Page already authenticated as a regular user */
  userPage: Page;
  /** Page already authenticated as an admin user */
  adminPage: Page;
};

export const test = base.extend<AuthFixtures>({
  userPage: async ({ browser }, use) => {
    const storageState = fs.existsSync(USER_STATE) ? USER_STATE : undefined;
    const ctx = await browser.newContext({ storageState });
    const page = await ctx.newPage();

    // If credentials env vars are set and no saved state, login now
    if (!storageState && process.env.E2E_USER_USERNAME) {
      await loginViaUI(page, process.env.E2E_USER_USERNAME!, process.env.E2E_USER_PASSWORD!);
    }

    await use(page);
    await ctx.close();
  },

  adminPage: async ({ browser }, use) => {
    const storageState = fs.existsSync(ADMIN_STATE) ? ADMIN_STATE : undefined;
    const ctx = await browser.newContext({ storageState });
    const page = await ctx.newPage();

    if (!storageState && process.env.E2E_ADMIN_USERNAME) {
      await loginViaUI(page, process.env.E2E_ADMIN_USERNAME!, process.env.E2E_ADMIN_PASSWORD!);
    }

    await use(page);
    await ctx.close();
  },
});

export { expect };
