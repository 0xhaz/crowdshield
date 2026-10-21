import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.SEED_DEMO_PASSWORD || "crowdshield-demo";

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}
