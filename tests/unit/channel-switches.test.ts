import { describe, expect, it } from "vitest";
import {
  SWITCHABLE_CHANNELS,
  parseChannels,
  parseSavedChannels,
  resolveChannels,
} from "@/server/channels/enabled";

describe("channel switches from Settings", () => {
  const fromEnv = parseChannels("instagram", "on", "on");

  it("without anything saved, the env vars decide", () => {
    expect([...resolveChannels(null, fromEnv)].sort()).toEqual(
      ["instagram", "telegram", "website", "whatsapp"].sort()
    );
  });

  it("what's saved wins over the env vars, and WhatsApp stays on", () => {
    expect([...resolveChannels(["tiktok"], fromEnv)].sort()).toEqual(["tiktok", "whatsapp"]);
    expect([...resolveChannels([], fromEnv)]).toEqual(["whatsapp"]);
  });

  it("only known channels are read back from the database", () => {
    expect(parseSavedChannels(["instagram", "fax", 3, "website"])).toEqual(["instagram", "website"]);
    expect(parseSavedChannels(null)).toBeNull();
    expect(parseSavedChannels({ instagram: true })).toBeNull();
  });

  it("WhatsApp is not among the switches", () => {
    expect(SWITCHABLE_CHANNELS).not.toContain("whatsapp");
    expect(SWITCHABLE_CHANNELS).toContain("website");
    // SMS and email are on when their keys are set, not by a switch.
    expect(SWITCHABLE_CHANNELS).not.toContain("sms");
    expect(SWITCHABLE_CHANNELS).not.toContain("email");
  });
});
