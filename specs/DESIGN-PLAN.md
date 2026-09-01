# Phase 3 design plan

Written before the UI code, per `00-PROJECT.md`'s design brief and the
frontend-design two-pass process.

## Subject, audience, job

A watch modder — often building their first — spends about an hour here
committing £150–400 across three or four vendors who ship from Singapore
and the Philippines. The page's single job: **let them see why parts do or
don't go together, and what the whole thing will actually cost.**

## Where the visual language comes from

Not from watches as jewellery. From the **bench**: vendor spec tables
(`Case Diameter: 40mm / Lug to Lug: 49mm / Thickness: 10.1mm` — read
verbatim off four vendors' listings all through Phase 1), caliper
graduations, and the printed scales on the parts themselves. A chapter
ring *is* a measurement scale. A bezel insert *is* a 60-minute count-up
scale. The subject's own vernacular is **graduated, aligned, dimensioned
data**.

## Tokens

**Color** — a technical drawing on cool paper, with metals from inside a
movement. Deliberately not cream (that's the default look the brief rules
out), and deliberately not a dark ground with one acid accent.

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F6F7F8` | ground — cool white, zero yellow |
| `ink` | `#15191E` | primary text |
| `graphite` | `#5B646E` | secondary text, units |
| `rule` | `#D3D8DD` | hairlines, graduations, card borders |
| `brass` | `#9A7328` | movement-plate brass — selection + active state |
| `ruby` | `#A8202F` | jewel red — error only |
| `amber` | `#8A5B14` | warning only |

Brass, ruby and amber are the only saturated colors and each means exactly
one thing. Chrome is `paper`/`rule`/`graphite` throughout so the parts
carry the visual interest.

**Type** — IBM Plex Sans + IBM Plex Mono. Plex was drawn for technical
documentation, which is precisely the register here, and it isn't the
default UI grotesque. The rule that makes it feel like the subject:
**every measured value is mono and right-aligned** — prices, mm, lug
widths, FX rates. Tabular figures line up in columns, which is what makes
price comparison across vendors readable at a glance rather than a task.

**Layout** — the three columns the spec prescribes. Slot rail left, picker
centre, summary right. No shadows anywhere; separation comes from hairline
rules and ground, the way a drawing separates regions.

## Signature: the assembly rail

The left column is not a list of slots. It's the **assembly sequence
rendered as a caliper scale** — a vertical graduation with each slot at a
tick, in the real order a watch goes together:

```
  01 ├──  Movement      NH35 Automatic          ●  brass tick, filled
  02 ├──  Dial          Spork Green             ●
  03 ├──  Hands         ─ pick one              ○  hairline tick, empty
  04 ├──  Case          SKX007 Sumo             ●
  05 ├──  Chapter ring  ─ pick one              ○
  06 ├──  Bezel insert  ─ pick one              ○
  07 ├──  Crystal       ─ pick one              ○
```

Numbering is used because assembly genuinely *is* a sequence — order
carries real information (you seat the dial before the hands, the chapter
ring before the crystal). That's the skill's test for when numbering is
honest rather than decorative.

## Three severities, three treatments

Distinct in **shape**, not just color, so they survive color-blindness and
a glance:

- **blocked** — ruby tick, solid 3px left bar, card body gets a faint
  diagonal hatch (the "not to spec" marking on a drawing). Reads inert
  rather than merely dimmed, per the spec.
- **warning** — amber, dashed left bar, full-contrast body. Works, but
  read this.
- **info** — graphite, dotted left bar, quiet.

## Self-critique before building

Checked against the three AI-default looks: not cream/serif/terracotta
(cool paper, no serif display, no terracotta); not dark-with-acid-accent;
the third — broadsheet hairlines and zero radius — is the closest, so the
distinction has to be real. It is: a broadsheet is *editorial* (columns of
prose, display serif, rules as ornament). This is a *datasheet* — hairlines
are graduations on a measurement scale, every number is mono and
column-aligned, and the one ornamental move (the assembly rail) encodes
assembly order, which is real information. If those graduations were
decorative I'd cut them.

Removing one accessory, per the skill: the part cards get no image frame
treatment, no hover lift, no shadow. Just the image, the data, and the
state border. The rail is the memorable element; everything else stays
quiet.
