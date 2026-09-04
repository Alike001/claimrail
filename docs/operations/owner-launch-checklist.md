# ClaimRail owner launch checklist

This is the part of the build that requires a human owner: creating accounts, holding testnet assets,
approving wallet prompts, and storing deployment secrets. Complete it in order. Stop after any failed
check instead of guessing.

## Never share these

- Wallet seed phrase or private key.
- Database URL or password.
- `CLAIMRAIL_SECRET_ENCRYPTION_KEY`.
- VAPID private key.
- Telegram bot token or webhook secret.
- The one-time webhook signing secret shown after route activation.

Store secrets in the hosting provider's encrypted environment-variable panel. Do not commit them,
paste them into chat, put them in screenshots, or save them in a public note.

It is safe to share a public wallet address, market ID, transaction hash, block number, public site
URL, VAPID public key, or Telegram bot username.

## Responsibility split

| You do                                            | ClaimRail code/automation does                  |
| ------------------------------------------------- | ----------------------------------------------- |
| Create the test wallet and approve its prompts    | Scan public positions without a signature       |
| Obtain STT and test collateral                    | Reconcile DreamDEX indexer data against Somnia  |
| Create hosting, PostgreSQL, and Telegram accounts | Validate configuration and database state       |
| Store secrets in the provider                     | Encrypt notification destinations at rest       |
| Make the final small testnet claim                | Simulate the exact claim and verify its receipt |
| Confirm messages arrived on your devices          | Queue, retry, audit, and display deliveries     |

## Stage 1 — Prepare a dedicated Shannon test wallet

- [ ] Create a **new testnet-only wallet** in a trusted browser wallet. Do not reuse a wallet that
      holds real assets.
- [ ] Back up its recovery phrase offline. Never enter that phrase into ClaimRail.
- [ ] Add or select Somnia Testnet with these values:
  - Network name: `Somnia Testnet (Shannon)`
  - Chain ID: `50312`
  - Currency symbol: `STT`
  - RPC URL: `https://dream-rpc.somnia.network`
  - Explorer: `https://shannon-explorer.somnia.network`
- [ ] Visit the [official Somnia testnet portal](https://testnet.somnia.network/) or use the official
      Somnia developer-community route to request STT.
- [ ] Check the public address in the Shannon explorer. The STT balance must be non-zero before a
      claim transaction can be tested.
- [ ] Create only a **small** Event Contract position on Shannon. The production DreamDEX app signs
      into chain `5031` and cannot see Shannon tUSDC. In local development, open
      `/tools/shannon-position`, connect the dedicated MetaMask wallet, preview a live market, and
      approve the capped 1 tUSDC transaction. Do not use real funds and do not claim it yet.
- [ ] Record the public wallet address and market ID in a private project note. These two values are
      safe to share for debugging.

Pass condition: the dedicated wallet is on chain `50312`, has STT for gas, and has at least one small
DreamDEX test position.

## Stage 2 — Choose the three deployment resources

Create or choose:

- [ ] A managed PostgreSQL database with TLS and a connection string.
- [ ] A Node.js web host that can run the Next.js application on Node 24.
- [ ] An always-on Node.js worker service. A serverless request function is not enough for the
      polling/retry worker.
- [ ] One public HTTPS domain for the web application.

The web and worker must reach the same PostgreSQL database. The worker must remain running after the
web request ends. Do not deploy until all four boxes are satisfied.

## Stage 3 — Generate notification credentials locally

From the repository root, run:

```bash
openssl rand -base64 32
pnpm --filter @claimrail/worker exec web-push generate-vapid-keys
openssl rand -hex 32
```

Store the three outputs immediately:

1. First output → `CLAIMRAIL_SECRET_ENCRYPTION_KEY`.
2. VAPID outputs → `CLAIMRAIL_VAPID_PUBLIC_KEY` and `CLAIMRAIL_VAPID_PRIVATE_KEY`.
3. Final hexadecimal output → `CLAIMRAIL_TELEGRAM_WEBHOOK_SECRET`.

Then:

- [ ] Open Telegram's verified `@BotFather` account.
- [ ] Run `/newbot`, choose the ClaimRail bot name/username, and store the returned token as
      `CLAIMRAIL_TELEGRAM_BOT_TOKEN`.
- [ ] Store the username without `@` as `CLAIMRAIL_TELEGRAM_BOT_USERNAME`.
- [ ] Set `CLAIMRAIL_VAPID_SUBJECT` to a contact URI such as `mailto:you@example.com`.

Pass condition: all seven notification values exist in a private secret manager. None appears in
Git or chat.

## Stage 4 — Configure and deploy

Use this exact environment split:

| Variable                            | Web | Worker |
| ----------------------------------- | :-: | :----: |
| `DATABASE_URL`                      | yes |  yes   |
| `CLAIMRAIL_SECRET_ENCRYPTION_KEY`   | yes |  yes   |
| `CLAIMRAIL_VAPID_SUBJECT`           | no  |  yes   |
| `CLAIMRAIL_VAPID_PUBLIC_KEY`        | yes |  yes   |
| `CLAIMRAIL_VAPID_PRIVATE_KEY`       | no  |  yes   |
| `CLAIMRAIL_TELEGRAM_BOT_USERNAME`   | yes |   no   |
| `CLAIMRAIL_TELEGRAM_BOT_TOKEN`      | yes |  yes   |
| `CLAIMRAIL_TELEGRAM_WEBHOOK_SECRET` | yes |   no   |

The encryption key must be identical on web and worker. The VAPID key pair must stay unchanged after
users subscribe; rotating it invalidates existing browser routes.

- [ ] Install with `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm verify` before deployment.
- [ ] Apply migrations once with
      `DATABASE_URL="<private-url>" pnpm --filter @claimrail/db db:migrate` from a trusted shell or
      provider release job. Do not put the real URL in documentation.
- [ ] Build/start the web service with `pnpm --filter @claimrail/web build` and
      `pnpm --filter @claimrail/web start`.
- [ ] Start the worker with `pnpm dev:worker`.
- [ ] Open `/api/v1/openapi.json`; it must return an OpenAPI document.
- [ ] Open `/api/v1/subscriptions/browser/config`; it must say `available: true`.
- [ ] Open `/`; the live site must not show a fixture banner.

## Stage 5 — Register Telegram only after the HTTPS site is live

Telegram requires an HTTPS webhook and sends the configured secret in
`X-Telegram-Bot-Api-Secret-Token`. Use the deployed URL ending in
`/api/v1/subscriptions/telegram/webhook`.

Run this locally so the values are not committed:

```bash
read -r -s CLAIMRAIL_SETUP_BOT_TOKEN
read -r -s CLAIMRAIL_SETUP_WEBHOOK_SECRET
read -r CLAIMRAIL_SETUP_PUBLIC_URL
curl --fail --silent --show-error \
  "https://api.telegram.org/bot${CLAIMRAIL_SETUP_BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=${CLAIMRAIL_SETUP_PUBLIC_URL}/api/v1/subscriptions/telegram/webhook" \
  --data-urlencode "secret_token=${CLAIMRAIL_SETUP_WEBHOOK_SECRET}"
unset CLAIMRAIL_SETUP_BOT_TOKEN CLAIMRAIL_SETUP_WEBHOOK_SECRET CLAIMRAIL_SETUP_PUBLIC_URL
```

Expected result: Telegram returns JSON containing `"ok":true`. If it does not, stop and inspect the
error before linking a chat.

## Stage 6 — Prove real notification delivery safely

- [ ] Open `/notifications` on the deployed site.
- [ ] Connect the dedicated test wallet.
- [ ] Enable Browser and accept the browser permission prompt.
- [ ] Create the Telegram link, sign the readable ownership message, open the link, and press Start.
- [ ] Optional: activate a public HTTPS webhook route and save its return-once signing secret.
- [ ] Open `/developers/deliveries` and sign the readable, gas-free access message.
- [ ] Confirm the screen shows at least one active route.
- [ ] Click **send test notification** once.
- [ ] Confirm the received event is `notification.test` and explicitly says it is not a settlement
      or claimable payout.
- [ ] Return to the delivery console and confirm each route becomes `delivered`. If one retries,
      inspect the stored attempt instead of repeatedly pressing the test button.

The endpoint has a 60-second owner cooldown. It sends through every active verified route even when
that route subscribes only to financial lifecycle events; this exception applies only to the
explicit test event.

## Stage 7 — Perform the controlled manual-claim proof

- [ ] Wait until the small DreamDEX position is actually finalized or void-refundable.
- [ ] Enter the public wallet address in ClaimRail and verify it appears under **claimable**, not
      merely locked or awaiting settlement.
- [ ] Open its settlement evidence. Check market ID, outcome, payout vector, verified block, and
      explorer links.
- [ ] Open the claim review. Verify the owner, recipient, expected payout, exclusions, and plan
      expiry.
- [ ] If prompted for `setOperator`, read the warning: this is a persistent module-wide ERC-6909
      approval, not approval for only one position. Approve it only on the dedicated test wallet.
- [ ] Let ClaimRail rebuild and re-simulate the plan after approval.
- [ ] Sign the exact `redeemMany` transaction in the wallet. Reject it if the chain is not `50312`,
      the target differs from the displayed DreamDEX module, or the wallet shows unexpected value.
- [ ] Keep the page open until the transaction hash is recorded as `pending`.
- [ ] Wait for the worker to produce `confirmed`; a mined receipt alone is not ClaimRail's success
      condition.
- [ ] Open the receipt and compare its transaction hash, block, returned collateral, burned
      balances, and settlement evidence with the explorer.

Pass condition: the wallet-signed transaction is independently reconciled, the receipt says
`confirmed`, and a `claim.confirmed` delivery reaches at least one real route.

## Stage 8 — Save judge-facing evidence

Save screenshots or screen recordings of:

- [ ] Live settlement inbox and claimable position.
- [ ] Evidence ladder and explorer proof.
- [ ] Wallet approval warning and exact redemption review.
- [ ] Pending-to-confirmed receipt transition.
- [ ] Browser or Telegram message.
- [ ] Delivery console showing the canonical event and successful attempt.
- [ ] A webhook or Bot Kit consumer receiving the same event, if used in the demo.

Blur nothing that proves public on-chain state, but remove every secret, provider credential, email,
and private account identifier before publishing.

## Stop immediately if

- The wallet asks for a seed phrase or private key.
- The selected chain is not `50312`.
- A transaction target does not match the DreamDEX module shown by ClaimRail.
- The site presents fixture data as live.
- ClaimRail says `confirmed` before independent receipt reconciliation finishes.
- A provider log prints a database URL, bot token, encryption key, or signing secret.
- A notification test claims that a market settled or funds became claimable.

## What to send back for the next guided step

Send only:

1. The dedicated wallet's **public address**.
2. The names of your PostgreSQL, web-host, and worker-host providers.
3. The public deployed URL, when available.
4. Public market IDs or transaction hashes needed for debugging.

Do not send any secret listed at the top of this document.
