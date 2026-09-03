import { expect, test } from "@playwright/test";

const address = "0x71f4a8b62d77c91402ce1a10bc65c9dff17892ac";
const fixtureInbox = `/wallet/${address}?fixture=1`;

test("renders and filters the settlement inbox", async ({ page }) => {
  await page.goto(fixtureInbox);
  await expect(page.getByRole("heading", { name: "settlement inbox" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Position lifecycle" })).toContainText("ready 2");
  await expect(page.locator(".ledger-row")).toHaveCount(5);

  await page.getByRole("tab", { name: "claimable 2" }).click();
  await expect(page.locator(".ledger-row")).toHaveCount(2);
  await expect(page.getByText("SOMI/USDso")).toBeHidden();

  await page.getByRole("tab", { name: "all 5" }).click();
  await expect(page.getByText("SOMI/USDso")).toBeVisible();
});

test("opens a safe, non-signing claim preview", async ({ page }) => {
  await page.goto(fixtureInbox);
  await page.getByRole("button", { name: "review claim →" }).click();
  await expect(page.getByText("transaction plan")).toBeVisible();
  await expect(page.getByText("module-wide")).toBeVisible();
  await expect(page.getByRole("button", { name: "approve module →" })).toBeDisabled();
  await expect(page.getByText("no transaction will be sent")).toBeVisible();
});

test("shows settlement evidence and copies proof values", async ({ page }) => {
  await page.goto(`/markets/0x${"12".repeat(32)}?fixture=1`);
  await expect(page.getByRole("heading", { name: "verifiable evidence ladder" })).toBeVisible();
  await expect(page.getByText("2,411.80", { exact: true })).toBeVisible();
  await expect(page.getByText("2,406.12", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "copy" }).first().click();
  await expect(page.getByRole("button", { name: "copied" })).toBeVisible();
});

test("serves discovery and validated API errors", async ({ request }) => {
  const discovery = await request.get("/api/v1/openapi.json");
  await expect(discovery).toBeOK();
  expect((await discovery.json()).openapi).toBe("3.1.0");

  const invalid = await request.get("/api/v1/wallets/not-an-address/positions");
  expect(invalid.status()).toBe(400);
  expect(await invalid.json()).toMatchObject({
    schemaVersion: "1",
    error: { code: "invalid_address" },
  });

  const invalidPrepare = await request.post("/api/v1/claims/prepare", {
    data: { owner: "not-an-address" },
  });
  expect(invalidPrepare.status()).toBe(400);

  const invalidSubmission = await request.post("/api/v1/claims/submissions", {
    data: { planHash: "0x1234" },
  });
  expect(invalidSubmission.status()).toBe(400);

  const invalidReceipt = await request.get("/api/v1/claims/not-a-claim-id");
  expect(invalidReceipt.status()).toBe(400);

  const insecureWebhook = await request.post("/api/v1/subscriptions/challenges", {
    data: {
      owner: address,
      kind: "webhook",
      destination: "http://agent.example.test/claimrail",
      eventTypes: ["wallet.claimable"],
    },
  });
  expect(insecureWebhook.status()).toBe(400);

  const invalidVerification = await request.post("/api/v1/subscriptions/verify", {
    data: { challengeId: "not-a-uuid", message: "challenge", signature: "0x1234" },
  });
  expect(invalidVerification.status()).toBe(400);

  const browserConfig = await request.get("/api/v1/subscriptions/browser/config");
  await expect(browserConfig).toBeOK();
  expect(await browserConfig.json()).toMatchObject({ available: false, publicKey: null });

  const invalidBrowserSubscription = await request.post(
    "/api/v1/subscriptions/browser/challenges",
    {
      data: {
        owner: address,
        kind: "browser",
        subscription: {
          endpoint: "http://push.example.test/subscription",
          keys: { p256dh: "a".repeat(65), auth: "b".repeat(22) },
        },
        eventTypes: ["wallet.claimable"],
      },
    },
  );
  expect(invalidBrowserSubscription.status()).toBe(400);

  const invalidTelegramSubscription = await request.post(
    "/api/v1/subscriptions/telegram/challenges",
    { data: { owner: "not-an-address", kind: "telegram", eventTypes: [] } },
  );
  expect(invalidTelegramSubscription.status()).toBe(400);

  const invalidAccessChallenge = await request.post("/api/v1/access/challenges", {
    data: { owner: "not-an-address" },
  });
  expect(invalidAccessChallenge.status()).toBe(400);

  const unauthorizedDeliveries = await request.get("/api/v1/deliveries");
  expect(unauthorizedDeliveries.status()).toBe(401);

  const invalidDelivery = await request.get("/api/v1/deliveries/not-a-uuid", {
    headers: { authorization: `Bearer ${"a".repeat(43)}` },
  });
  expect(invalidDelivery.status()).toBe(400);
});

test("documents the settlement and signing boundary", async ({ page }) => {
  await page.goto("/docs");
  await expect(
    page.getByRole("heading", { name: "the missing settlement delivery layer." }),
  ).toBeVisible();
  await expect(page.getByText("Approval is broad. Redemption is exact.")).toBeVisible();
  await expect(page.getByText("/api/v1/claims/prepare", { exact: true })).toBeVisible();
  await expect(page.getByText("/api/v1/deliveries", { exact: true })).toBeVisible();
  await expect(page.getByText("ClaimRail stores no wallet private key")).toBeVisible();
});

test("renders an independently verified settlement receipt", async ({ page }) => {
  await page.goto(`/claims/claim:0x${"12".repeat(32)}?fixture=1`);
  await expect(page.getByRole("heading", { name: "funds delivered." })).toBeVisible();
  await expect(page.getByText("independently verified")).toBeVisible();
  await expect(page.getByText("1,494.00 USDso").first()).toBeVisible();
  await expect(page.getByText("post-state reconciliation")).toBeVisible();
  await expect(page.getByRole("link", { name: "download receipt JSON ↓" })).toBeVisible();
});

test("shows honest position and claim history without invented PnL", async ({ page }) => {
  await page.goto(`/wallet/${address}/history?fixture=1`);
  await expect(
    page.getByRole("heading", { name: "performance, without pretend math." }),
  ).toBeVisible();
  await expect(page.getByText("1,494.00 USDso").first()).toBeVisible();
  await expect(
    page.getByText("Cost-basis completeness: unavailable", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("incomplete", { exact: true }).first()).toBeVisible();
});

test("mobile navigation is operable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only control");
  await page.goto(fixtureInbox);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation" })).toBeVisible();
});

test("presents notification delivery without overstating unfinished adapters", async ({ page }) => {
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Don’t watch the market." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signed webhook" })).toBeVisible();
  await expect(page.getByText("message signature only · no gas")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browser" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
  await expect(page.getByRole("button", { name: "connect", exact: true })).toHaveCount(2);
  await expect(page.getByText("next adapter")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "connect owner wallet →" })).toBeVisible();
});

test("inspects and filters the developer delivery ledger", async ({ page }) => {
  await page.goto("/developers/deliveries?fixture=1");
  await expect(page.getByRole("heading", { name: "Developer Delivery Console" })).toBeVisible();
  await expect(page.getByText("verified UI fixture · no live delivery data")).toBeVisible();
  await expect(page.locator(".delivery-table tbody tr")).toHaveCount(5);
  await expect(page.getByRole("region", { name: "Selected delivery inspector" })).toContainText(
    "claim.failed",
  );
  await expect(page.getByText("attempt 5")).toBeVisible();
  await expect(page.getByRole("button", { name: "▷ replay dead letter" })).toBeDisabled();

  await page
    .locator(".delivery-table tbody tr")
    .first()
    .getByRole("button", { name: "inspect" })
    .click();
  await expect(page.getByRole("region", { name: "Selected delivery inspector" })).toContainText(
    "wallet.claimable",
  );

  await page.getByRole("button", { name: "retrying 1" }).click();
  await expect(page.locator(".delivery-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".delivery-table tbody tr")).toContainText("market.finalized");

  await page.getByRole("button", { name: "dead 1" }).click();
  await expect(page.locator(".delivery-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".delivery-table tbody tr")).toContainText("claim.failed");
  await page.getByRole("button", { name: "inspect" }).click();
  await expect(page.getByRole("region", { name: "Selected delivery inspector" })).toContainText(
    "attempt 5",
  );
});
