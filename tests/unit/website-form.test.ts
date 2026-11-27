import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidFormspreeSignature, normalizeWebsiteForm, splitUsAddress } from "@/server/website/form";
import { capabilitiesFor } from "@/server/channels/capabilities";
import { parseChannels } from "@/server/channels/enabled";

describe("Website form intake", () => {
  it("reads Formspree's webhook body, in the form's own field order", () => {
    const lead = normalizeWebsiteForm({
      form: "xyzabc",
      keys: ["name", "email", "phone", "service", "message"],
      submission: {
        _date: "2026-11-20T10:00:00Z",
        name: "Ana Lima",
        email: "Ana@Example.com",
        phone: "(703) 555-0142",
        service: "Roofing",
        message: "Leak over the kitchen",
      },
    });
    expect(lead).not.toBeNull();
    expect(lead!.name).toBe("Ana Lima");
    expect(lead!.email).toBe("ana@example.com");
    expect(lead!.identity).toBe("web:ana@example.com");
    expect(lead!.formId).toBe("xyzabc");
    expect(lead!.text).toBe(
      [
        "📝 New website form submission",
        "Name: Ana Lima",
        "Email: ana@example.com",
        "Phone: (703) 555-0142",
        "Service: Roofing",
        "Message: Leak over the kitchen",
      ].join("\n")
    );
  });

  it("reads a direct post, joins first and last name and falls back to the phone", () => {
    const lead = normalizeWebsiteForm({ "First Name": "Bob", last_name: "Ray", tel: "+1 703 555 0100" });
    expect(lead!.name).toBe("Bob Ray");
    expect(lead!.identity).toBe("web:17035550100");
  });

  it("skips Formspree's special fields and drops spam caught by the honeypot", () => {
    const lead = normalizeWebsiteForm({ name: "Cy", _subject: "New lead", _next: "https://x.y" });
    expect(lead!.text).not.toContain("Subject");
    expect(normalizeWebsiteForm({ name: "Spam", _gotcha: "filled" })).toBeNull();
  });

  it("ignores empty or unreadable bodies", () => {
    expect(normalizeWebsiteForm(null)).toBeNull();
    expect(normalizeWebsiteForm([])).toBeNull();
    expect(normalizeWebsiteForm({ name: "  " })).toBeNull();
  });

  it("gives a retried delivery the same id, and a different submission a new one", () => {
    const a = normalizeWebsiteForm({ name: "Ana", message: "hi" })!;
    const b = normalizeWebsiteForm({ name: "Ana", message: "hi" })!;
    const c = normalizeWebsiteForm({ name: "Ana", message: "hello" })!;
    expect(a.messageId).toBe(b.messageId);
    expect(a.messageId).not.toBe(c.messageId);
  });

  it("checks Formspree's signature", () => {
    const body = '{"form":"x"}';
    const sig = createHmac("sha256", "s3cret").update(`1700000000.${body}`).digest("hex");
    expect(isValidFormspreeSignature("s3cret", `t=1700000000,v1=${sig}`, body)).toBe(true);
    expect(isValidFormspreeSignature("other", `t=1700000000,v1=${sig}`, body)).toBe(false);
    expect(isValidFormspreeSignature("s3cret", null, body)).toBe(false);
  });

  it("has its own WEBSITE_FORMS switch and can't send", () => {
    expect(parseChannels("whatsapp", undefined, "on").has("website")).toBe(true);
    expect(parseChannels("whatsapp,website", undefined, undefined).has("website")).toBe(false);
    expect(capabilitiesFor("website").outboundMedia).toBe(false);
  });
});

describe("website form → contact card fields", () => {
  it("picks the address and services out of the form", () => {
    const lead = normalizeWebsiteForm({
      name: "Jordan Lee",
      email: "jordan@example.com",
      Address: "12 Oak St",
      City: "Rockville",
      State: "MD",
      "Zip Code": "20850",
      Service: "Windows, Gutters",
    });
    expect(lead?.details).toEqual({
      address_street: "12 Oak St",
      address_city: "Rockville",
      address_state: "MD",
      address_zip: "20850",
      services: "Windows, Gutters",
    });
  });

  it("fills the card and the notes from the website estimator", () => {
    const lead = normalizeWebsiteForm({
      Request: "Free in-home inspection",
      Appointment: "Tue, Dec 1 at 1:00 PM",
      Name: "Dana Test",
      Phone: "(202) 555-0100",
      "Property address": "18723 Purple Martin Lane, Montgomery Village, MD 20879",
      "ZIP code": "20879",
      Project: "Windows",
      "Option chosen": "Good: Vytex vinyl",
      "Size and details": "11 windows (1 bay or bow)",
      "What's going on": "Drafts or high bills, Foggy glass",
      Timeline: "1-3 months",
      "Range shown": "$23,100 – $36,000 (11 windows, 1 bay or bow · Vytex vinyl)",
      Consent: "Agreed to be called or texted about this request",
      email: "dana@example.com",
    })!;
    expect(lead.details).toEqual({
      address_street: "18723 Purple Martin Lane",
      address_city: "Montgomery Village",
      address_state: "MD",
      address_zip: "20879",
      services: "Windows",
    });
    expect(lead.quoted).toBe(true);
    expect(lead.notes).toEqual([
      "Request: Free in-home inspection",
      "Appointment: Tue, Dec 1 at 1:00 PM",
      "Option chosen: Good: Vytex vinyl",
      "Size and details: 11 windows (1 bay or bow)",
      "What's going on: Drafts or high bills, Foggy glass",
      "Timeline: 1-3 months",
      "Range shown: $23,100 – $36,000 (11 windows, 1 bay or bow · Vytex vinyl)",
    ]);
    expect(normalizeWebsiteForm({ name: "A", "Range shown": "No range (not sure yet)" })!.quoted).toBe(false);
  });

  it("splits one-line US addresses", () => {
    expect(splitUsAddress("123 Main St, Rockville MD 20850")).toEqual({
      street: "123 Main St",
      city: "Rockville",
      state: "MD",
      zip: "20850",
    });
    expect(splitUsAddress("1 Oak Ct, Apt 2, Fairfax, VA 22030-1234, USA")).toEqual({
      street: "1 Oak Ct, Apt 2",
      city: "Fairfax",
      state: "VA",
      zip: "22030",
    });
    expect(splitUsAddress("123 Main St, Rockville")).toEqual({
      street: "123 Main St",
      city: "Rockville",
      state: null,
      zip: null,
    });
    expect(splitUsAddress("123 Main St")).toBeNull();
  });
});
