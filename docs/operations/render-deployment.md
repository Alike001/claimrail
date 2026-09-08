# Deploy ClaimRail on Render

This is the shortest production-like path for the hackathon: one Blueprint creates the Next.js web
service, continuous worker, and PostgreSQL database in the same region.

## Cost and limits

The checked-in [`render.yaml`](../../render.yaml) uses two `0.5c-512mb` services and one free
PostgreSQL database. At [Render's current list price](https://render.com/pricing), the web and worker
are $7/month each. The free database is enough for the demo window, but under Render's
[free-instance limits](https://render.com/docs/free) it expires after 30 days and has no backups.
Delete or upgrade the resources after judging.

Do not change the worker to a free web service. Free web services sleep after 15 idle minutes, while
ClaimRail needs a process that continuously reconciles receipts and delivers notifications.

## 1. Prepare the owner-only values

Never commit these values. Generate the VAPID pair and Telegram webhook secret locally:

```bash
pnpm --filter @claimrail/worker exec web-push generate-vapid-keys
openssl rand -hex 32
```

Create a Telegram bot with BotFather if Telegram is the chosen delivery proof. You will enter:

- `CLAIMRAIL_SYNC_WALLET`: the dedicated Shannon test wallet's public address;
- `CLAIMRAIL_VAPID_SUBJECT`: a contact URI such as `mailto:you@example.com`;
- `CLAIMRAIL_VAPID_PUBLIC_KEY`: the generated public VAPID key on both services;
- `CLAIMRAIL_VAPID_PRIVATE_KEY`: the private VAPID key on the worker only;
- `CLAIMRAIL_TELEGRAM_BOT_USERNAME`: the username without `@` on the web service;
- `CLAIMRAIL_TELEGRAM_BOT_TOKEN`: the same BotFather token on both services;
- `CLAIMRAIL_TELEGRAM_WEBHOOK_SECRET`: the generated random value on the web service.

The Blueprint generates one shared database-encryption key automatically. Do not replace it on only
one service.

## 2. Create the Blueprint

1. Push the verified repository revision to GitHub.
2. In Render, choose **New → Blueprint** and connect `Alike001/claimrail`.
3. Confirm that Render detects the root `render.yaml`.
4. Enter the prompted values above. Use the same VAPID public key and Telegram token wherever they
   appear.
5. Approve creation of the web service, worker, and database.

The paid web service runs the Drizzle migrations through `preDeployCommand` before a new release.
The public health check at `/api/health` returns `200` only when PostgreSQL is reachable and the
expected schema is present.

## 3. Verify the deployment

Replace `$CLAIMRAIL_PUBLIC_URL` with the generated `onrender.com` URL:

```bash
curl --fail "$CLAIMRAIL_PUBLIC_URL/api/health"
curl --fail "$CLAIMRAIL_PUBLIC_URL/api/v1/openapi.json" >/dev/null
curl --fail "$CLAIMRAIL_PUBLIC_URL/api/v1/subscriptions/browser/config"
```

Then check the Render worker logs. The first JSON line must show:

- `health.status` as `ready`;
- `shannonWalletSyncEnabled` as `true`;
- the intended delivery transport as enabled.

The logs must not contain a database URL, Telegram token, VAPID private key, or encryption key.

## 4. Register Telegram after HTTPS is live

Follow [Stage 5 of the owner launch checklist](./owner-launch-checklist.md#stage-5--register-telegram-only-after-the-https-site-is-live).
The webhook URL is the deployed site plus `/api/v1/subscriptions/telegram/webhook`.

## 5. Preserve proof

Save the public URL, health response, worker-ready log, and a screenshot of the live landing page.
Continue with the [hackathon readiness board](../hackathon/readiness.md) for the real delivery and
owner-signed claim proofs.
