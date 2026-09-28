import { describe, expect, it } from "vitest";
import { parseListingUrl } from "../url";
import { extract } from "../extract";

// WS4 pass measure 3: non-allow-listed hosts are rejected.
describe("bring-your-own link: host allow list", () => {
  it.each([
    ["https://www.ebay.co.uk/itm/335123456789", "ebay", "335123456789"],
    ["https://www.ebay.com/itm/NH35-Dial-28-5mm/335123456789?hash=item4e&var=0", "ebay", "335123456789"],
    ["https://m.ebay.de/itm/335123456789/", "ebay", "335123456789"],
    ["https://www.aliexpress.com/item/1005006123456789.html?spm=a2g0o", "aliexpress", "1005006123456789"],
    ["https://de.aliexpress.com/item/1005006123456789.html", "aliexpress", "1005006123456789"],
  ])("accepts %s", (url, platform, itemId) => {
    expect(parseListingUrl(url)).toMatchObject({ platform, itemId });
  });

  it("drops everything but the item id from the stored link", () => {
    const r = parseListingUrl("https://www.ebay.co.uk/itm/Title/335123456789?mkcid=1&campid=999");
    expect(r).toEqual({ platform: "ebay", itemId: "335123456789", canonicalUrl: "https://www.ebay.com/itm/335123456789" });
  });

  it.each([
    "https://namokimods.com/products/skx007-case",
    "https://ebay.com.evil.net/itm/335123456789",
    "https://notebay.com/itm/335123456789",
    "https://evil.net/?u=https://www.ebay.com/itm/335123456789",
    "https://www.ebay.com@evil.net/itm/335123456789",
    "https://user:pw@www.ebay.com/itm/335123456789",
    "https://www.ebay.com:8443/itm/335123456789",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:3000/itm/335123456789",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://ebay.us/abc123",
    "https://a.aliexpress.com/_mKxyz",
    "https://s.click.aliexpress.com/e/_abc",
    "https://www.ebay.com/sch/i.html?_nkw=nh35+dial",
    "https://www.aliexpress.com/store/1234",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(parseListingUrl(url)).toHaveProperty("error");
  });
});

// Synthetic titles in marketplace style. Real-listing fixtures (20 per
// platform) wait for API access -- specs/08-DEFERRED.md D15a.
const FAMILIES = new Set([
  "skx007-case", "skx013-case", "skx007-insert", "skx007-crystal", "skx007-bracelet", "generic-strap",
  "nh3x-movement", "nh3x-dial-standard", "nh3x-dial-feetless", "nh3x-hands-standard",
]);

describe("bring-your-own link: extraction", () => {
  it("reads a case listing's own sizes and leaves the dial size it mentions alone", () => {
    const d = extract({ title: "SKX007 Mod 42.5mm Watch Case 22mm Lug for NH35 28.5mm Dial 4 o'clock crown" }, FAMILIES, "case");
    expect(d.family).toBe("skx007-case");
    expect(d.attributes).toEqual({ caseDiameterMm: 42.5, lugWidthMm: 22, crownPosition: "4" });
    expect(d.attributes).not.toHaveProperty("diameterMm");
    expect(d.unmatched).toEqual([]);
  });

  it("reads a crown position as the case's, not as a crown for sale", () => {
    expect(extract({ title: "SKX007 42.5mm Watch Case 22mm Lug 4 o'clock crown" }, FAMILIES).slot).toBe("case");
    expect(extract({ title: "Watch Case, crown at 3" }, FAMILIES).slot).toBe("case");
    expect(extract({ title: "SKX007 Screw-down Crown" }, FAMILIES).slot).toBe("crown");
  });

  it("does not read a model code as a size (SKX007 MM is not a 7 mm case)", () => {
    const d = extract({ title: "SKX007 MM Style Stainless Steel Case" }, FAMILIES, "case");
    expect(d.attributes.caseDiameterMm).toBeNull();
    expect(d.unmatched).toContain("caseDiameterMm");
  });

  it("prefers item specifics over the title, and says where each value came from", () => {
    const d = extract({ title: "Sunburst Blue Dial for Seiko Mod NH35", aspects: { "Dial Diameter": "28.5 mm", Movement: "Automatic" } }, FAMILIES);
    expect(d.slot).toBe("dial");
    expect(d.attributes.diameterMm).toBe(28.5);
    expect(d.from.diameterMm).toBe("item specific: Dial Diameter");
    expect(d.family).toBe("nh3x-dial-standard");
    expect(d.unmatched).toEqual(["hasFeet", "hasDateWindow", "hasDayWindow"]);
  });

  it("proposes no slot when the title names two parts", () => {
    const d = extract({ title: "Watch Case for 28.5mm Dial" }, FAMILIES);
    expect(d.slot).toBeNull();
    expect(d.unmatched).toEqual(["slot"]);
    expect(d.family).toBe("unknown");
  });

  it("leaves the family unknown when two case lines are named", () => {
    expect(extract({ title: "Sapphire Crystal fits SKX007 / SKX013" }, FAMILIES, "crystal").family).toBe("unknown");
    expect(extract({ title: "Flat Sapphire Crystal for SKX007" }, FAMILIES, "crystal")).toMatchObject({
      family: "skx007-crystal",
      attributes: { profile: "flat", material: "sapphire" },
    });
  });

  it("marks a case line the catalog doesn't model as out of scope, not as a fit", () => {
    const d = extract({ title: "Sumo Style 45mm Case" }, FAMILIES, "case");
    expect(d.family).toBe("unknown");
    expect(d.outOfScope).toMatch(/Sumo/);
  });

  it("drops a number outside the attribute's range", () => {
    expect(extract({ title: "Nylon Strap 220mm Band" }, FAMILIES, "strap").attributes.lugWidthMm).toBeNull();
    expect(extract({ title: "20mm Nylon Strap" }, FAMILIES, "strap")).toMatchObject({ family: "generic-strap", attributes: { lugWidthMm: 20 } });
  });

  it("takes a movement's caliber only when the listing names exactly one", () => {
    expect(extract({ title: "Genuine NH35A Automatic Movement" }, FAMILIES).attributes).toMatchObject({ caliber: "NH35" });
    const two = extract({ title: "NH35 NH36 Movement" }, FAMILIES);
    expect(two.attributes.caliber).toBeNull();
    expect(two.movementsListed).toEqual(["NH35", "NH36"]);
  });

  it("reads feetless dials", () => {
    expect(extract({ title: "Feetless Dial NH35 no date" }, FAMILIES)).toMatchObject({
      family: "nh3x-dial-feetless",
      attributes: { hasFeet: false, hasDateWindow: false, hasDayWindow: false },
    });
  });
});
