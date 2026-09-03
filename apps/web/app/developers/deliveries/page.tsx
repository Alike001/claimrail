import { DeliveryConsole } from "@/src/components/delivery-console";
import { deliveryConsoleFixture, deliveryDetailFixture } from "@/src/fixtures/deliveries";

export default async function DeliveryConsolePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly fixture?: string }>;
}) {
  const fixtureMode = process.env.NODE_ENV !== "production" && (await searchParams).fixture === "1";
  return fixtureMode ? (
    <DeliveryConsole fixtureList={deliveryConsoleFixture} fixtureDetail={deliveryDetailFixture} />
  ) : (
    <DeliveryConsole />
  );
}
