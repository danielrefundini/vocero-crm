import { describe, expect, it } from "vitest";
import { normalizeTelegramPayload } from "@/server/telegram/ingest";
import { botIdFromToken } from "@/server/telegram/api";
import { isValidTelegramSecret } from "@/server/telegram/credentials";
import { capabilitiesFor, windowMsFor } from "@/server/channels/capabilities";
import { parseChannels } from "@/server/channels/enabled";

const msg = (over: Record<string, unknown> = {}) => ({
  botId: "777000111",
  update: {
    update_id: 1,
    message: {
      message_id: 42,
      date: 1_790_000_000,
      chat: { id: 5551234, type: "private" },
      from: { id: 5551234, first_name: "Ana", last_name: "Lima", username: "ana" },
      text: "Hi, how much is it?",
      ...over,
    },
  },
});

describe("Telegram inbound", () => {
  it("normalizes a private text message", () => {
    expect(normalizeTelegramPayload(msg())).toEqual([
      {
        botId: "777000111",
        chatId: "5551234",
        messageId: "tg_777000111_5551234_42",
        text: "Hi, how much is it?",
        type: "text",
        timestamp: "1790000000",
        profileName: "Ana Lima",
      },
    ]);
  });

  it("keeps a photo with its caption as an image", () => {
    const [m] = normalizeTelegramPayload(msg({ text: undefined, photo: [{}], caption: "this one" }));
    expect(m?.type).toBe("image");
    expect(m?.text).toBe("this one");
  });

  it("falls back to the username when there's no name", () => {
    const [m] = normalizeTelegramPayload(msg({ from: { id: 1, username: "bob" } }));
    expect(m?.profileName).toBe("@bob");
  });

  it("ignores groups, other bots and updates without a message", () => {
    expect(normalizeTelegramPayload(msg({ chat: { id: -100, type: "group" } }))).toEqual([]);
    expect(normalizeTelegramPayload(msg({ from: { id: 9, is_bot: true } }))).toEqual([]);
    expect(normalizeTelegramPayload({ botId: "1", update: { update_id: 2 } })).toEqual([]);
    expect(normalizeTelegramPayload(null)).toEqual([]);
  });
});

describe("Telegram helpers", () => {
  it("reads the bot id from a token and rejects junk", () => {
    expect(botIdFromToken("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0")).toBe("123456789");
    expect(botIdFromToken("not a token")).toBeNull();
  });

  it("compares the webhook secret exactly", () => {
    expect(isValidTelegramSecret("abc", "abc")).toBe(true);
    expect(isValidTelegramSecret("abc", "abd")).toBe(false);
    expect(isValidTelegramSecret("abc", null)).toBe(false);
  });

  it("has no service window and plain text up to 4096 chars", () => {
    expect(windowMsFor("telegram")).toBe(Number.POSITIVE_INFINITY);
    expect(capabilitiesFor("telegram").textFormat).toBe("plain");
    expect(capabilitiesFor("telegram").maxTextChars).toBe(4096);
  });

  it("has its own TELEGRAM switch, separate from CHANNELS", () => {
    expect(parseChannels("whatsapp", "on").has("telegram")).toBe(true);
    expect(parseChannels("whatsapp,instagram", undefined).has("telegram")).toBe(false);
    // Written inside CHANNELS it doesn't count: only TELEGRAM turns it on.
    expect(parseChannels("whatsapp,telegram", "off").has("telegram")).toBe(false);
    expect(parseChannels("instagram", "on").has("instagram")).toBe(true);
  });
});
