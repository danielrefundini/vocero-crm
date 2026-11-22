import { notFound } from "next/navigation";
import { MessengerClient } from "@/components/settings/messenger-client";
import { isChannelEnabled } from "@/server/channels/enabled";

export const dynamic = "force-dynamic";

export default async function MessengerSettingsPage() {
  // Sin el canal encendido esta pantalla no existe en esta instancia (ADR-001).
  if (!(await isChannelEnabled("messenger"))) notFound();
  return <MessengerClient />;
}
