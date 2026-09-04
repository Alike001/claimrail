import { EventPlayground } from "@/src/components/event-playground";
import { createEventPlaygroundSample } from "@/src/fixtures/events";

export default async function EventPlaygroundPage() {
  return <EventPlayground initialSample={await createEventPlaygroundSample(0)} />;
}
