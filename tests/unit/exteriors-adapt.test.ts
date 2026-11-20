import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  formatAddress,
  googleMapsSearchUrl,
  mapServices,
  normalizeUsPhone,
  normalizeZip,
  unrecognizedServiceNote,
  validateAddressInput,
} from "@/lib/exteriors";
import { expandWorkingDayToUtc } from "@/lib/time/slots";
import { inHomeConnector } from "@/server/agenda/connectors/in-home";
import { parseWebsiteForms, tokensMatch, websiteFormAllowed } from "@/server/website/auth";
import { resendSignatureMatches } from "@/server/email/signature";
import { twilioSignature, twilioSignatureMatches } from "@/server/sms/signature";
import { SEED_STAGES } from "@/server/auth/on-signup";
import { seedDemo } from "@/server/seed/demo";

describe("exterior services and addresses", () => {
  it("maps Windows and Gutters and keeps unknown text", () => {
    const mapped = mapServices("Windows and Gutters");
    expect(mapped.services).toEqual(["windows", "gutters"]);
    expect(mapped.unrecognized).toEqual([]);
    const odd = mapServices(["gutter guards", "solar panels"]);
    expect(odd.services).toEqual(["gutters"]);
    expect(odd.unrecognized).toEqual(["solar panels"]);
    expect(unrecognizedServiceNote(odd.unrecognized)).toBe("[Unrecognized service] solar panels");
  });

  it("accepts a US address and rejects a bad state or ZIP", () => {
    const ok = validateAddressInput({
      street: "1 Main St",
      city: "Rockville",
      state: "md",
      zip: "20850-1234",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(formatAddress(ok.address)).toBe("1 Main St, Rockville, MD 20850-1234");
    }
    expect(validateAddressInput({ state: "Maryland" }).ok).toBe(false);
    expect(normalizeZip("2085")).toBeNull();
  });

  it("builds a Google Maps search link and omits it when the address is empty", () => {
    const url = googleMapsSearchUrl("1 Main St, Rockville, MD 20850");
    expect(url?.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(decodeURIComponent(url ?? "")).toContain("1 Main St");
    expect(googleMapsSearchUrl("  ")).toBeNull();
  });

  it("treats a 10-digit US number as country code 1", () => {
    expect(normalizeUsPhone("(202) 555-0147")).toBe("12025550147");
    expect(normalizeUsPhone("1 202 555 0147")).toBe("12025550147");
    expect(normalizeUsPhone("5215512345678")).toBe("525512345678");
    expect(normalizeUsPhone("123")).toBeNull();
  });
});

describe("website form gate", () => {
  it("requires the token and does not accept a missing one", () => {
    expect(tokensMatch(null, "secret-token-value")).toBe(false);
    expect(tokensMatch("nope", "secret-token-value")).toBe(false);
    expect(tokensMatch("secret-token-value", "secret-token-value")).toBe(true);
  });

  it("honors a JSON list of form ids and origins", () => {
    const raw = '["daniel-exteriors","https://danielexteriors.com"]';
    expect(parseWebsiteForms(raw)).toEqual(["daniel-exteriors", "https://danielexteriors.com"]);
    expect(
      websiteFormAllowed({ formsRaw: raw, formId: "daniel-exteriors", origin: null }).ok
    ).toBe(true);
    expect(websiteFormAllowed({ formsRaw: raw, formId: "other", origin: null }).ok).toBe(false);
    expect(websiteFormAllowed({ formsRaw: "{", formId: null, origin: null })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("in-home visits and the travel buffer", () => {
  const req = {
    topic: "Visit",
    startUtc: "2026-06-02T14:00:00.000Z",
    durationMinutes: 60,
    timezone: "America/New_York",
  };

  it("stores a Maps link when the visit has an address", async () => {
    const meeting = await inHomeConnector.createMeeting(null, {
      ...req,
      location: "1 Main St, Rockville, MD 20850",
    });
    expect(meeting.externalId).toBeNull();
    expect(meeting.joinUrl).toContain("google.com/maps");
  });

  it("still succeeds when the address is missing", async () => {
    const meeting = await inHomeConnector.createMeeting(null, req);
    expect(meeting.joinUrl).toBeNull();
  });

  it("spaces slots by duration plus buffer", () => {
    const slots = expandWorkingDayToUtc(
      "2026-06-02",
      [{ start: "09:00", end: "17:00" }],
      "America/New_York",
      60,
      30
    );
    expect(slots.length).toBeGreaterThan(1);
    const first = Date.parse(slots[0]!.startUtc);
    const second = Date.parse(slots[1]!.startUtc);
    expect(second - first).toBe(90 * 60 * 1000);
  });
});

describe("provider signatures", () => {
  it("matches a Twilio signature and rejects a tampered body", () => {
    const params = { Body: "Hi", From: "+12025550147", MessageSid: "SM123" };
    const url = "https://crm.example.com/api/webhooks/sms/inbound";
    const header = twilioSignature("token", url, params);
    expect(twilioSignatureMatches("token", url, params, header)).toBe(true);
    expect(twilioSignatureMatches("token", url, { ...params, Body: "No" }, header)).toBe(false);
  });

  it("matches a Resend Svix signature", () => {
    const secret = `whsec_${Buffer.from("super-secret-key").toString("base64")}`;
    const id = "msg_1";
    const timestamp = "1700000000";
    const raw = '{"type":"email.received"}';
    const key = Buffer.from("super-secret-key");
    const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64");
    expect(
      resendSignatureMatches({
        secret,
        id,
        timestamp,
        signatureHeader: `v1,${signature}`,
        rawBody: raw,
        nowMs: 1700000000 * 1000,
      })
    ).toBe(true);
  });
});

describe("new organizations and the hardware-store demo", () => {
  it("seeds New through Lost with won and lost anchors", () => {
    expect(SEED_STAGES.map((stage) => [stage.name, stage.kind])).toEqual([
      ["New", "open"],
      ["Contacted", "open"],
      ["Consult booked", "open"],
      ["Quoted", "open"],
      ["Won", "won"],
      ["Lost", "lost"],
    ]);
  });

  it("does not ship the hardware-store seed", async () => {
    const source = readFileSync("src/server/seed/demo.ts", "utf8");
    expect(source).not.toMatch(/Ferretería|Martillito|MXN/);
    await expect(seedDemo({} as never, "org")).resolves.toEqual({
      seeded: false,
      reason: "demo_disabled",
    });
  });
});
