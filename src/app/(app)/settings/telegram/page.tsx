import { notFound } from "next/navigation";
import { TelegramClient } from "@/components/settings/telegram-client";
import { isChannelEnabled } from "@/server/channels/enabled";

export const dynamic = "force-dynamic";

export default async function TelegramSettingsPage() {
  // Without the channel on, this page doesn't exist on this instance (ADR-001).
  if (!(await isChannelEnabled("telegram"))) notFound();
  return <TelegramClient />;
}
