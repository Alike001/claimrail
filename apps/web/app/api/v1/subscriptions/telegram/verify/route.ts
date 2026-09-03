import { telegramSubscriptionVerificationRequestSchema } from "@claimrail/contracts";
import { verifyTelegramChallenge } from "@/src/server/telegram";

export async function POST(request: Request) {
  const parsed = telegramSubscriptionVerificationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      {
        schemaVersion: "1",
        error: {
          code: "invalid_request",
          message: parsed.error.issues[0]?.message ?? "Invalid request",
        },
      },
      { status: 400 },
    );
  try {
    return Response.json(await verifyTelegramChallenge(parsed.data), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Telegram verification failed";
    const invalid = /not found|used|expired|does not match|signature/i.test(message);
    return Response.json(
      {
        schemaVersion: "1",
        error: { code: invalid ? "telegram_verification_failed" : "telegram_unavailable", message },
      },
      { status: invalid ? 409 : 503 },
    );
  }
}
