import { telegramSubscriptionRequestSchema } from "@claimrail/contracts";
import { createTelegramChallenge } from "@/src/server/telegram";

export async function POST(request: Request) {
  const parsed = telegramSubscriptionRequestSchema.safeParse(
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
    return Response.json(await createTelegramChallenge(parsed.data), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        schemaVersion: "1",
        error: {
          code: "telegram_unavailable",
          message: error instanceof Error ? error.message : "Telegram unavailable",
        },
      },
      { status: 503 },
    );
  }
}
