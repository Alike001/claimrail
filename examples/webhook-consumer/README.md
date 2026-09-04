# ClaimRail signed-webhook consumer

Minimal Node.js receiver that depends only on the public `@claimrail/client` package. It reads the
request as raw bytes, verifies ClaimRail's timestamped HMAC before parsing JSON, validates the
versioned envelope, and returns `204` only after acceptance.

```bash
CLAIMRAIL_WEBHOOK_SECRET='the-return-once-secret' pnpm start
```

Expose `POST /webhooks/claimrail` through an HTTPS tunnel or deployment, then create a route on the
ClaimRail Notifications page. Store the returned secret outside source control. The receiver logs
only delivery ID, event ID, and event type—not wallet positions or secret material.
