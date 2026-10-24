import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Demo steps 3–4: payee check with the live call → alert → confirm mule → confirmed for everyone.
test("live-call payee check raises an alert, and confirming the mule updates the graph", async ({
  page,
}) => {
  await signIn(page, "analyst@nusabank.demo");
  await page.goto("/bank/payee-check?preset=live");
  await page.getByRole("button", { name: "Check payee" }).click();
  await expect(page.getByText("Hold the transfer and call the customer back")).toBeVisible();
  await expect(page.getByText(/on a call with a number reported for scams/)).toBeVisible();

  await page.getByRole("link", { name: /Alert raised/ }).click();
  await expect(page.getByText(/The customer was on a call/)).toBeVisible();
  await page
    .getByLabel(/Note/)
    .first()
    .fill("Account opened 9 days ago; 14 inbound transfers from strangers.");
  await page.getByRole("button", { name: "Confirm mule" }).click();
  // the alert closes: its status chip updates and the decision buttons are replaced
  await expect(page.getByText("Confirmed Mule").first()).toBeVisible();
  await expect(page.getByText(/This alert is closed/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("article", { name: "Verdict: Confirmed scam" })).toBeVisible();
  await expect(page.getByText("Confirmed by a member bank")).toBeVisible();
});

test("case detail shows the timeline and money trail; entity detail shows the graph", async ({
  page,
}) => {
  await signIn(page, "analyst@nusabank.demo");
  await page.goto("/bank/cases?withLoss=1&scamType=macau_impersonation");
  await page
    .getByRole("link", { name: /NSRC-2026-10-118274|Oct/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Money trail" })).toBeVisible();
  await page.goto("/bank/entities?type=bank_account&tier=confirmed");
  await page
    .getByRole("link", { name: /MBB \*\*\*\*8812/ })
    .first()
    .click();
  await expect(
    page.getByRole("img", { name: "Links between this entity and others" }),
  ).toBeVisible();
});

test("an analyst records a transfer their bank traced; the receiving account is flagged at once", async ({
  page,
}) => {
  await signIn(page, "analyst@nusabank.demo");
  await page.goto("/bank/cases?withLoss=1&scamType=macau_impersonation");
  await page.getByRole("link", { name: /Oct/ }).first().click();
  await page.getByText("Add a transfer your bank traced").click();
  await page.getByLabel("From account").selectOption({ label: "HLB ****3365" });
  await page.getByLabel("To bank").selectOption("Bank Islam");
  await page.getByLabel("Account number").fill("1201 7788 4410");
  await page.getByLabel("Amount (RM)").fill("9000");
  await page.getByLabel("Frozen (RM)").fill("4000");
  await page.getByRole("button", { name: "Add to the money trail" }).click();
  await expect(page.getByRole("status")).toContainText(
    /BIMB \*\*\*\*4410 is now “(Be careful|High risk|Reported)/,
  );
  await expect(page.getByText("BIMB ****4410").first()).toBeVisible();
  await expect(page.getByText("Frozen RM 4,000.00")).toBeVisible();
});
