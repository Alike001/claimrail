import { consumeTelegramUpdate } from "@/src/server/telegram";

export async function POST(request: Request) {
  try {
    const result = await consumeTelegramUpdate(request, await request.json().catch(() => null));
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "TelegramWebhookUnauthorized";
    return Response.json({ ok: false }, { status: unauthorized ? 401 : 503 });
  }
}
