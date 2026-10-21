import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Phase 7 screens. Deterministic paths only (graph lookups, no model calls), so they run anywhere.

test("landing: anyone can check a number without signing in", async ({ page }) => {
  await page.goto("/#try");
  await page.getByRole("button", { name: "A scam caller" }).click();
  const card = page.locator("#try").getByRole("article", { name: "Verdict: Confirmed scam" });
  await expect(card).toBeVisible();
  await expect(card.getByText("+60 11-***-4821")).toBeVisible();
});

test("banking app: a transfer to a mule during a scam call is paused before the money moves", async ({
  page,
}) => {
  await page.goto("/demo/bank-app");
  await page.getByRole("button", { name: /Mule account, on a scam call/ }).click();
  await page.getByRole("button", { name: "Transfer" }).click();
  const screen = page.getByRole("alertdialog");
  await expect(screen).toBeVisible();
  await expect(screen.getByRole("heading")).toHaveText(/paused|stopped/);
  await expect(screen.getByText(/on a call with a number reported for scams/)).toBeVisible();
});

test("bank: case brief panel and campaign review are on hand", async ({ page }) => {
  await signIn(page, "analyst@nusabank.demo");
  await page.goto("/bank/campaigns");
  await expect(page.getByRole("heading", { name: "New campaigns to review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Look for new campaigns" })).toBeVisible();
  await page.goto("/bank/cases?withLoss=1&scamType=macau_impersonation");
  await page
    .getByRole("link", { name: /NSRC-2026-10-118274|Oct/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "AI case brief" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write the brief" })).toBeVisible();
});
