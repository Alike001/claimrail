import { createServer, type IncomingMessage } from "node:http";
import { verifyClaimRailWebhook } from "@claimrail/client";

const MAX_BODY_BYTES = 1_000_000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function rawBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body is too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const secret = required("CLAIMRAIL_WEBHOOK_SECRET");
const port = Number(process.env.PORT ?? 8787);
if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) throw new Error("PORT is invalid");

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/webhooks/claimrail") {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await rawBody(request);
    const envelope = await verifyClaimRailWebhook({
      secret,
      rawBody: body,
      headers: {
        "claimrail-timestamp": firstHeader(request.headers["claimrail-timestamp"]),
        "claimrail-signature": firstHeader(request.headers["claimrail-signature"]),
      },
    });
    process.stdout.write(
      `${JSON.stringify({ deliveryId: envelope.deliveryId, eventId: envelope.event.id, type: envelope.event.type })}\n`,
    );
    response.writeHead(204).end();
  } catch (error) {
    response
      .writeHead(401, { "content-type": "application/json" })
      .end(
        JSON.stringify({ accepted: false, error: error instanceof Error ? error.name : "Error" }),
      );
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`ClaimRail webhook consumer listening on :${port}/webhooks/claimrail\n`);
});
