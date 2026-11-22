import { ChannelsClient } from "@/components/settings/channels-client";

export const dynamic = "force-dynamic";

/**
 * Settings → Channels → Status. Always there now: it also holds the switches
 * that turn each channel on or off, so it can't depend on one being on.
 */
export default function ChannelsSettingsPage() {
  return <ChannelsClient />;
}
