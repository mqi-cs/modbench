import { describe, expect, it } from "vitest";
import { caseDimensions, isEmpty, parseDimensions } from "../dimensions";
import { DEFAULT_MM, watchMm } from "../art/geometry";

describe("dimension parsing", () => {
  it("reads the labelled insert diameters vendors actually print", () => {
    const text = "Flat sapphire glass design. Inner Diameter: 31.7mm Outer Diameter: 38mm Please check";
    expect(parseDimensions("bezel_insert", text)).toEqual({ outer: 38, inner: 31.7 });
  });

  it("reads an H / M / S hand triple", () => {
    expect(parseDimensions("hands", "Hand Length — H / M / S 8.5mm / 12.75mm / 12.75mm Materials")).toEqual({
      hour: 8.5,
      minute: 12.75,
      second: 12.75,
    });
  });

  it("reads a crown diameter", () => {
    expect(parseDimensions("crown", "Crown diameter: 8mm Case compatibility note")).toEqual({ diameter: 8 });
  });

  it("strips markup and entities before matching", () => {
    expect(parseDimensions("crown", "<p>Crown&nbsp;diameter:&nbsp;7mm</p>")).toEqual({ diameter: 7 });
  });

  it("returns nothing rather than a guess when the vendor states nothing", () => {
    expect(isEmpty(parseDimensions("bezel_insert", "A lovely black insert for SKX007/SRPD builds"))).toBe(true);
    expect(isEmpty(parseDimensions("hands", "Blue sword hands, lumed"))).toBe(true);
  });

  it("drops a match outside the plausible range for the field", () => {
    // A case thickness, not a crown.
    expect(isEmpty(parseDimensions("crown", "Crown size: 47mm"))).toBe(true);
    expect(isEmpty(parseDimensions("bezel_insert", "Outer diameter: 2mm"))).toBe(true);
  });

  it("drops BOTH diameters when the bore reads wider than the part", () => {
    // The two numbers came from different sentences; neither is trustworthy.
    expect(isEmpty(parseDimensions("bezel_insert", "Inner Diameter: 38mm and an Outer Diameter: 31.8mm"))).toBe(true);
  });

  it("drops a hand triple whose minute hand is shorter than its hour hand", () => {
    expect(isEmpty(parseDimensions("hands", "H/M/S: 12.5/8.5/12.5mm"))).toBe(true);
  });

  it("never emits case fields from prose -- they come from attributes", () => {
    const d = parseDimensions("case", "Case Diameter: 42.5mm Lug Width: 22mm");
    expect(isEmpty(d)).toBe(true);
    expect(caseDimensions({ caseDiameterMm: 42.5, lugWidthMm: 22, dialApertureMm: 28.5 })).toEqual({
      caseDiameter: 42.5,
      lugWidth: 22,
      aperture: 28.5,
    });
  });

  it("applies the same bounds to an attribute as to a parse", () => {
    expect(caseDimensions({ caseDiameterMm: 420, lugWidthMm: null, dialApertureMm: undefined })).toEqual({});
  });
});

describe("resolving one build's millimetres", () => {
  it("falls back to the modal stated value, not to the old assumption", () => {
    const m = watchMm({});
    expect(m.insertOuter).toBe(38.0);
    expect(m.insertInner).toBe(31.8);
    expect(m.hourHand).toBe(8.5);
    expect(m.stated).toEqual([]);
  });

  it("prefers each part's own stated size and records which were stated", () => {
    const m = watchMm({
      case: { caseDiameter: 37.8, lugWidth: 20 },
      insert: { outer: 33.6, inner: 27.6 },
      hands: { hour: 8, minute: 12, second: 12 },
    });
    expect(m.caseDiameter).toBe(37.8);
    expect(m.lugWidth).toBe(20);
    expect(m.insertOuter).toBe(33.6);
    expect(m.minuteHand).toBe(12);
    expect(m.stated).toContain("insertOuter");
    // Not stated by this build, so still the default.
    expect(m.ringOuter).toBe(DEFAULT_MM.ringOuter);
    expect(m.stated).not.toContain("ringOuter");
  });

  it("lugs reach a fixed distance past whatever case they are cut into", () => {
    expect(watchMm({ case: { caseDiameter: 42.5 } }).lugToLug).toBe(46);
    expect(watchMm({ case: { caseDiameter: 37.8 } }).lugToLug).toBe(41.3);
  });

  it("never lets a bore come out wider than the part it is cut in", () => {
    const m = watchMm({ insert: { outer: 33.6 }, ring: { inner: 40 } });
    // The insert states a small outer and nothing else; the default 31.8
    // bore must not survive against it.
    expect(m.insertInner).toBeLessThan(m.insertOuter);
    expect(m.ringInner).toBeLessThan(m.ringOuter);
  });
});
