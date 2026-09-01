# Phase 2 — Compatibility Engine

The trustworthy core. Pure functions, no UI, no I/O. This is the phase where the project either earns credibility or loses it.

**Prerequisite:** Phase 1 pass measure met.

## Design

`lib/compat` exports one entry point:

```ts
type Severity = 'error' | 'warning' | 'info';

interface Finding {
  ruleKey: string;
  severity: Severity;
  message: string;        // plain language, addressed to a beginner
  slots: SlotKey[];       // which selections this concerns
  fix?: string;           // what to do about it
}

interface BuildResult {
  findings: Finding[];
  requiredAdditions: PartRef[];   // e.g. a movement spacer
  requiredTools: ToolKey[];
  status: 'ok' | 'ok-with-warnings' | 'blocked';
}

function evaluateBuild(build: Build, catalog: CatalogSlice): BuildResult;
```

`CatalogSlice` is plain data passed in by the caller. **The engine never queries the database.** That is what makes it testable and what keeps it honest.

### Severities

- **error** — will not physically work. Blocks the build. Never a guess.
- **warning** — works, but needs extra work, a tool, or a compromise. Cutting dial feet is the canonical case: entirely normal, but a beginner must know before ordering.
- **info** — worth knowing. Lume colour mismatch, vendor lead times, a second vendor with the same part cheaper.

### Rules

Each rule is a standalone module in `lib/compat/rules/`, registered in an array. Signature:

```ts
interface Rule {
  key: string;
  appliesTo: SlotKey[];
  evaluate(build: Build, catalog: CatalogSlice): Finding[];
}
```

Starting set — implement all of these:

| Key | Severity | Checks |
|---|---|---|
| `movement-case-fit` | error | Case accepts the movement family; adds a spacer if `requiresSpacerFor` matches |
| `dial-movement-feet` | error/warning | Feet match the movement; feetless downgrades to warning + dial dots + tool |
| `dial-case-diameter` | error | Dial diameter within the case aperture tolerance |
| `hands-movement-bore` | error | Hand family matches the movement pinion family |
| `date-window-alignment` | error | Dial date position matches the movement's date position |
| `day-window-presence` | error | NH36 day wheel needs a day aperture; a day-date dial on an NH35 fails |
| `insert-case-diameter` | error | Insert outer diameter matches the case bezel |
| `crystal-case-fit` | error | Crystal diameter and height fit the case |
| `chapter-ring-fit` | warning | Chapter ring compatible with the case and dial diameter |
| `hand-stack-clearance` | warning | Hand length vs chapter ring and dial diameter |
| `family-exception` | varies | Applies any row from `family_exceptions` for a selected part |
| `unverified-part` | warning | Any selected part with `specSource: 'family-inferred'` and no vendor confirmation |
| `lume-mismatch` | info | Hands and dial lume colours differ |
| `stock-availability` | info | A selected part is out of stock at its cheapest vendor |
| `multi-vendor-shipping` | info | Build spans 3+ vendors; suggest consolidation |

Added during Phase 2 (2026-09-01) — the first three cover categories the
table above predates, the last two came out of the mechanism audit and
close real false-positive holes vendor text proved were there:

| Key | Severity | Checks |
|---|---|---|
| `bezel-case-fit` | error | Rotating bezel ring matches the case's bezel mount |
| `crown-case-fit` | error | Crown matches the case's crown tube |
| `strap-fit` | error/warning | Bracelet end-links match the case; generic straps match on lug width |
| `insert-crystal-profile-fit` | error | Insert profile (flat/slope) matches crystal profile (flat/domed) — vendor-stated, and invisible to family matching since both parts can be correctly sized for the same case |
| `dial-case-model-exclusion` | error | Carries a dial's own vendor-stated "not compatible with <case model>" exclusion — invisible to family matching, since dial families are movement-scoped by design |

Three rules in the original table were rebuilt after the mechanism audit
found their physical premise false; see the rule files' own comments for
the sources. In short: VK6x movements are drop-in compatible with
NH35-designed cases (so `movement-case-fit` no longer errors on that
pairing, and `dial-movement-feet` now checks subdial apertures, which is
the real NH-vs-VK constraint), and standard hands do mount on an NH34 (so
`hands-movement-bore` now checks crystal clearance and a missing GMT hand
instead of claiming a mounting failure that doesn't happen).

### Tool derivation

`lib/compat/tools.ts` maps operations to tools. Cutting dial feet implies a dial feet cutter and dial dots. Fitting hands implies a hand press and hand removal levers. Opening the case implies a case back opener and a movement holder.

Output a deduplicated tool list with an estimated cost range per tool. Include a baseline set — blower, gloves, dust cover — for any build at all.

## Testing

`lib/compat/__tests__/known-builds.test.ts` runs the full Phase 0 fixture set.

```ts
describe('known builds', () => {
  it.each(goodBuilds)('$id is compatible', (b) => {
    expect(evaluateBuild(b, catalog).status).not.toBe('blocked');
  });
  it.each(badBuilds)('$id is blocked', (b) => {
    expect(evaluateBuild(b, catalog).status).toBe('blocked');
  });
});
```

Plus per-rule unit tests with hand-built minimal fixtures — each rule tested in isolation for both its firing and non-firing case.

Add a property test: for any two randomly selected parts from the catalog, `evaluateBuild` must not throw and must return a valid `BuildResult`. Missing attributes must degrade to a warning, never a crash and never a silent pass.

## Constraints

- **No LLM calls anywhere in `lib/compat`.** Enforce with a lint rule if you like.
- No imports from `lib/db` inside `lib/compat`. Pure data in, pure data out.
- Every `error` finding must trace to an explicit spec comparison or a `family_exceptions` row. If a rule cannot determine an answer, it emits a `warning` saying so. It never guesses either way.
- Messages are written for a beginner, in **two layers**: what is wrong with this specific combination, then the underlying principle. Not "dial feet position mismatch (3/9 vs none)" but "This dial has no feet — the small posts that clip it onto the movement. You can glue it in place with dial dots, which most modders do, but you'll need to be careful about centring it." The second layer is what turns a block into a lesson, and it is the main education feature of the product (see `09-COMPETITIVE-CONTEXT.md`).
- Rules are order-independent. No rule may depend on another having run.

## What the fixture set actually is (amended 2026-09-01)

The Phase 0 fixture set was audited during Phase 2 and does not mean what
its original names implied. Two corrections are now permanent:

**`regressionFixtures` (formerly `goodBuilds`, 20 entries).** These test
**internal consistency, not verified reality.** A provenance audit found
20 fixtures citing only 15 distinct source URLs, each URL being a single
vendor product page for exactly ONE of the five slots — the other four
were real, individually-audited SKUs assembled around it for family
consistency, not transcribed from a build anyone confirmed working. No
fixture's movement or bezel insert was ever the subject of its own source.
They are valuable as regression detection: they catch a rule change that
starts blocking combinations the engine previously accepted. They are not
evidence that those combinations have been built. Do not cite them as
such.

**`badBuilds` — the only fixtures that test the zero-false-positive
claim.** Every entry must trace to vendor text stating the incompatibility
about those specific parts, quoted in the fixture's own `sourceQuote`
field. Three original entries were deleted during the Phase 2 audit for
failing that bar (two modelled a wasted-feature scenario as a fitment
failure; one rested on a premise that independent sources contradict), and
one more was removed because no vendor text in this catalog states any
dial's date-aperture position. Two were re-sourced away from a paywalled,
unverifiable forum thread onto vendor listings. Two new ones were added
from vendor warning text found by mining all four vendors' `body_html`.

**The count is evidence-limited, not a target.** Ship the number of bad
fixtures the vendor documentation actually supports. Fewer real ones with
stated provenance beats a round number padded with invented combinations —
a fixture written to fit the rules tests nothing except that the rules
agree with themselves.

## Pass measure

1. **All 20 regression fixtures return `ok` or `ok-with-warnings`** (i.e.
   not `blocked`). These guard against regressions; they do not certify
   real-world compatibility.
2. **All bad builds return `blocked`,** each with at least one `error`
   finding naming the correct slots, and each blocking via the rule its
   evidence is actually about — not incidentally via some other rule.
3. **Zero false positives is non-negotiable.** If any bad build passes, the
   phase fails outright — no partial credit, do not proceed. Note the
   converse is explicitly tolerated: blocking a combination that would
   have worked is a false negative, which costs a user one option, while a
   false positive costs them a watch that doesn't go together.
4. Every rule has unit tests covering both branches. Line coverage of `lib/compat` **≥90%**.
5. The property test runs 1,000 random pairs with no throws.
6. `evaluateBuild` on a full 6-slot build completes in **under 10ms**, so the UI can call it on every keystroke.
7. Read all 15 rule messages aloud. Any that a beginner wouldn't understand gets rewritten. **Every `error` and `warning` message carries both layers** — the specific problem and the underlying principle. A message that only states the problem fails this measure.
