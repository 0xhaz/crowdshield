import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Demo step 5, typed rather than uploaded so the test doesn't depend on Nebius.
test("a bank-detail change is caught, held, and rejecting it reports the account", async ({
  page,
}) => {
  await signIn(page, "owner@majuvista.demo");
  await page.goto("/sme/check");
  const fill = (label: string, value: string) =>
    page.getByLabel(label, { exact: true }).fill(value);
  await fill("Supplier name", "Keluvra Steel Supplies Sdn Bhd");
  await fill("SSM registration no.", "201901023456");
  await fill("Tax ID (TIN)", "C2584563200");
  await fill("Amount (RM)", "86500");
  await fill("Bank", "Hong Leong Bank");
  await fill("Account number", "2290 1847 3365");
  await fill("Contact phone on the invoice / email", "016-221 0934");
  await fill("Sent from (email)", "accounts@keluvra-steel-my.com");
  await page.getByLabel("Says the bank account has changed").check();
  await page.getByRole("button", { name: "Run checks" }).click();

  await expect(page).toHaveURL(/\/sme\/checks\//, { timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "Do not pay yet" })).toBeVisible();
  await expect(
    page.getByText("The account belongs to an individual, not a company."),
  ).toBeVisible();
  await expect(page.getByText(/Look-alike email domain/)).toBeVisible();

  await page.getByRole("link", { name: /open the callback checklist/ }).click();
  const hold = page.locator("article", { hasText: "Keluvra Steel Supplies Sdn Bhd" }).first();
  await hold.getByRole("button", { name: /Supplier confirmed: release payment/ }).click();
  await expect(hold.getByRole("alert")).toContainText("Call back");
  await hold.getByRole("button", { name: /Call Keluvra/ }).click();
  await hold.getByRole("button", { name: /reject and report/ }).click();
  await expect(hold.getByRole("status")).toContainText("reported to CrowdShield");
});
