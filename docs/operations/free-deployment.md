# Deploy ClaimRail without a payment card

This is the recommended hackathon deployment path. It uses:

- Vercel Hobby for the Next.js web product and API;
- Neon Free for PostgreSQL;
- GitHub Actions for one durable worker cycle every 15 minutes and on manual demand.

No private key is deployed. ClaimRail continues to prepare transactions for the owner's browser
wallet and verifies submitted receipts independently.

## Know the trade-off

The GitHub Actions worker is scheduled, not continuously resident. A background settlement,
receipt, or delivery can therefore take about 15 minutes, and GitHub does not guarantee exact cron
start times. Use the workflow's manual **Run workflow** control during the recorded demo or a live
judge walkthrough.

The 15-minute interval is intentional: Neon Free compute can return to idle between short worker
runs. This protects the free monthly allowance better than waking the database every five minutes.

## 1. Generate the shared credentials locally

From the repository root, run:

```bash
openssl rand -base64 32
pnpm --filter @claimrail/worker exec web-push generate-vapid-keys
```

Privately save:

- the first output as `CLAIMRAIL_SECRET_ENCRYPTION_KEY`;
- the VAPID public key as `CLAIMRAIL_VAPID_PUBLIC_KEY`;
- the VAPID private key as `CLAIMRAIL_VAPID_PRIVATE_KEY`;
- a contact URI such as `mailto:you@example.com` as `CLAIMRAIL_VAPID_SUBJECT`.

Use one unchanged encryption key and VAPID pair in both hosts. Never paste their values into a
committed file, issue, screenshot, or chat.

## 2. Create the Neon database

1. Create a Neon Free project named `claimrail`.
2. Open **Connect** and copy both connection strings:
   - pooled hostname containing `-pooler` for application runtime;
   - direct hostname without `-pooler` for migrations.
3. Keep `sslmode=require` in both URLs.

The runtime URL becomes `DATABASE_URL` in Vercel and GitHub. The direct URL becomes only the GitHub
secret `DATABASE_URL_UNPOOLED`.

## 3. Configure the GitHub worker

In `Alike001/claimrail`, open **Settings → Secrets and variables → Actions**.

Create these repository secrets:

| Secret                            | Value                                      |
| --------------------------------- | ------------------------------------------ |
| `DATABASE_URL`                    | Neon pooled connection string              |
| `DATABASE_URL_UNPOOLED`           | Neon direct connection string              |
| `CLAIMRAIL_SYNC_WALLET`           | Public Shannon wallet address              |
| `CLAIMRAIL_SECRET_ENCRYPTION_KEY` | Generated shared encryption key            |
| `CLAIMRAIL_VAPID_SUBJECT`         | Contact URI                                |
| `CLAIMRAIL_VAPID_PUBLIC_KEY`      | Generated VAPID public key                 |
| `CLAIMRAIL_VAPID_PRIVATE_KEY`     | Generated VAPID private key                |
| `CLAIMRAIL_TELEGRAM_BOT_TOKEN`    | Optional; only if Telegram will be enabled |

Do not enable the schedule yet. Open **Actions → ClaimRail worker → Run workflow**, select
`apply_migrations`, and run it once. The final JSON log must report database/schema readiness and a
worker status of `ready`.

After that first successful run, create the repository variable
`CLAIMRAIL_WORKER_ENABLED=true`. Scheduled runs will now execute at minutes 7, 22, 37, and 52 of
each hour. Removing the variable or setting it to `false` disables scheduled database activity
without deleting the workflow.

## 4. Deploy the Next.js product on Vercel

1. Sign in to Vercel with GitHub and import `Alike001/claimrail` into a Hobby project.
2. Set **Framework Preset** to **Next.js**.
3. Set **Root Directory** to `apps/web`.
4. In the Root Directory settings, confirm **Include source files outside of the Root Directory in
   the Build Step** is enabled so the app can use the shared `packages/*` workspaces. New Vercel
   projects normally enable this automatically.
5. Leave the detected install and build commands in place. Vercel detects the root pnpm lockfile and
   workspace packages from this directory.
6. Add these Production environment variables:

| Variable                          | Value                         |
| --------------------------------- | ----------------------------- |
| `DATABASE_URL`                    | Neon pooled connection string |
| `CLAIMRAIL_SECRET_ENCRYPTION_KEY` | Same shared encryption key    |
| `CLAIMRAIL_VAPID_PUBLIC_KEY`      | Same VAPID public key         |

Do not put the VAPID private key or any wallet private key in Vercel. Telegram variables can be
added later if Telegram is chosen instead of browser delivery.

Deploy the project and keep the production URL. Vercel Hobby is for personal/non-commercial use;
this route is appropriate only while ClaimRail remains a personal hackathon prototype.

## 5. Verify the live system

Replace `<site>` with the Vercel production origin:

```bash
curl --fail-with-body https://<site>/api/health
curl --fail-with-body https://<site>/api/v1/openapi.json
curl --fail-with-body https://<site>/api/v1/subscriptions/browser/config
```

Pass conditions:

- health returns HTTP `200`, database `reachable`, and schema `ready`;
- OpenAPI returns a document;
- browser configuration reports `available: true`;
- the landing page opens in a signed-out browser without fixture data;
- a manual worker run finishes `ready`.

## 6. Run the proof sequence

1. Subscribe the dedicated wallet to browser notifications on the live site.
2. Open **Actions → ClaimRail worker** and run it manually.
3. Confirm the browser receives a real delivery and preserve a redacted screenshot.
4. Complete the small owner-signed claim in the browser.
5. Run the worker manually again and wait for the receipt to become `confirmed`.
6. Save the public transaction/explorer link, ClaimRail receipt page, delivery proof, and worker run
   URL for the submission evidence register.

If a free quota is reached, the affected free service can pause rather than remain continuously
available. Check Vercel, Neon, and Actions usage daily through the judging window; no deployment
architecture can guarantee indefinite free uptime.

## Provider references

- [Vercel monorepo configuration](https://vercel.com/docs/monorepos)
- [Vercel shared-package Root Directory setting](https://vercel.com/docs/monorepos/monorepo-faq)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [GitHub Actions scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
