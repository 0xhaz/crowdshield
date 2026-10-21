import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("signed-out users are sent to sign-in; wrong passwords are refused", async ({ page }) => {
  await page.goto("/bank/alerts");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel("Email").fill("analyst@nusabank.demo");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
});

test("each role lands on its own portal and can't open the other", async ({ page }) => {
  await signIn(page, "owner@majuvista.demo");
  await expect(page).toHaveURL(/\/sme$/);
  await page.goto("/bank/alerts");
  await expect(page).toHaveURL(/\/sme$/);
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await signIn(page, "analyst@nusabank.demo");
  await expect(page).toHaveURL(/\/bank$/);
  await expect(page.getByRole("heading", { name: "Alert queue" })).toBeVisible();
});

test("the landing page is public and sends signed-in users to their own portal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("The bank sees the transfer");
  await expect(
    page.getByRole("heading", { name: "Classic reporting vs CrowdShield" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true }).first()).toBeVisible();
  await signIn(page, "owner@majuvista.demo");
  await page.goto("/");
  await page.getByRole("link", { name: "Open your dashboard" }).first().click();
  await expect(page).toHaveURL(/\/sme$/);
});
