# GRISM Studio

A browser GUI for authoring PacketX's GRISM XML packet-broker configuration, and
for operating the device (statistics, capture, firmware, backup). Vite + React,
deployed same-origin on the device at `/grism-studio/`.

## Files

Everything below lives in `src/`.

| File | What it is |
|---|---|
| `grism-core.js` | All pure logic: parsers, serialisers, validators, formatters, diff. No React. ~2400 lines |
| `GrismStudio.jsx` | Every React component, one file. ~6100 lines |
| `GrismStudio.css` | All styling, light + dark themes via CSS variables |
| `i18n.js` | `en` / `zh-TW` dictionaries, `makeT`, `STUDIO_VERSION` |
| `test.js` | 549 assertions across 45 groups. Imports the real modules |
| `eslint.config.js` | Deliberately minimal — see "The linter earns its keep" |

## Commands

Run from `src/`:

```bash
node test.js     # the whole suite, including lint. Must be green before shipping
npx eslint GrismStudio.jsx grism-core.js i18n.js test.js
```

Dev deps: `linkedom eslint globals`, all declared in `package.json`, so a fresh
`npm ci` is enough to run the suite. `package.json` has `"type": "module"`.

`test.js` injects linkedom's `DOMParser` into core via `setDomParser()`, so the
same parsing code runs under Node as in the browser.

## Branches and where a build goes

`master` holds the source. `site` carries no source at all — just `docs/`, the
built app as GitHub Pages serves it at `packetx.github.io/grism-studio/`.
Publishing is replacing `docs/` with a fresh `dist/` and committing on `site`;
neither branch has a workflow that does it.

Bump `STUDIO_VERSION`, `npm run build`, then either or both of:

```bash
# onto a device, beside the firmware's copy
tar -C dist -czf grism-studio.tgz .
scp grism-studio.tgz root@<device>:/tmp/
ssh root@<device> 'tar -C /usr/local/www/var/www/grism-studio -xzf /tmp/grism-studio.tgz'

# onto the published site
git switch site && git rm -rq docs && cp -a dist docs && git add docs
```

Asset filenames are content-hashed, so unpacking over a device leaves every
previous build behind — 5.8 MB of dead bundles had accumulated before anyone
noticed. Delete whatever `index.html` no longer references, deriving the keep-list
from the file rather than hardcoding it, and bail out if that list comes back
empty.

The same `dist/` is also packaged into the firmware: `grism-studio.tgz` in the
GRISM repo root, unpacked by its `build.sh`. A hand-deployed bundle is replaced
the next time that firmware is flashed, so anything meant to last has to be
rebuilt into the firmware too.

## Verifying in a browser

The suite covers `grism-core.js`; anything about rendering, layout or a device
flow needs a real browser. Chrome plus `puppeteer-core` driving it is enough, and
catches what the suite structurally cannot — a state that is set but never
rendered, a field too narrow for its content, an overlay that does not actually
block clicks.

Neither is a declared dependency; install them where you need them
(`npm i -D puppeteer-core`, and a Chrome binary for `executablePath`).

Two things worth copying from past checks: serve `dist/` under a `/grism-studio/`
prefix and 404 everything else, which is what reveals path bugs that the device's
nginx would paper over; and intercept `/grism/**` so device flows can be driven
without a device — including failure, by aborting the requests to simulate one
going away.

## How the pieces fit

**Document model.** `doc = { filters, inputs, outputs, actions, chains }`.
`serializeRun` emits them in that order inside `<run>`. `parseRun` reads it back.
`normalizeDoc` fills in defaults and hands out `cid` values.

**Workspaces → tabs.** `WORKSPACES` at the top of the JSX drives the nav:
- overview
- pipeline: filters · inputs · outputs · actions · chain · simulate · export | capture
- traffic: interfaces · sessions · services · countries
- system: status · syslog · settings

Settings has nine sections: mgmt · ports · system · packet · auth · logging ·
heartbeat · services · raw.

**Device API.** Same-origin, `credentials: "include"` on every call. Config reads
go through the shared `getConfig()` in `SettingsTab` — several sections need the
same body and the effect can re-fire mid-flight, so it caches the in-flight
promise. Pass `getConfig(true)` after applying anything.

**The find-field catalogue is a copy.** `FIELDS` in `grism-core.js` mirrors
`g_ftype[]` in the firmware's `tools/common/fc.c` — that array is the only
authority. Adding a field to the device does not add it here; both have to be
edited, and six `g_ftype[]` entries are deliberately absent (see the note on
`FIELDS`). `FIELDS` was originally transcribed from a field table in the
firmware's `doc/filter.md`, which had drifted and listed names the device never
accepted; that table is gone now, so transcribe from `fc.c`. (A third copy under
`tools/www/GRISM-T_console-v3/` is legacy — leave it alone.)

Offering a name the device does not implement is worse than omitting it: the
device logs `filter find type unsupport`, drops that `<find>`, and runs a filter
with one fewer condition than the UI showed — matching more traffic than asked,
invisibly. `gtp.imsi` sat in the list that way for a long time. Check `g_ftype[]`
before adding anything, and note that being *in* `g_ftype[]` is not sufficient
either: six entries are there but unusable from XML, and the note on `FIELDS`
records which and why. The firmware repo's own CLAUDE.md covers that side.

## Conventions

- Logic goes in `grism-core.js` and gets a test. The JSX composes, it doesn't compute.
- Every user-facing string goes through `tr()`. No literals in JSX. (`FIELDS`
  labels are the exception: they are plain English in core, not translated.)
- Bump `STUDIO_VERSION` in `i18n.js` on every change.
- Comments explain *why*, not what. Most comments in this codebase record a
  decision or a trap; keep that bar.

## Things that bit us

**A parser must not invent content.** `parseRun` used to substitute a default
`P0→F1→P1` chain (and a starter filter) when the XML had none, with no warning.
Loading a device config that legitimately has no `<chain>`, then exporting or
submitting, silently added forwarding the device never had. Both tabs already
render their own empty state, so the parser now returns exactly what the XML
said. Tests guard the round trip.

**State that is set and ticking is not state that is shown.** The firmware
update, restore and factory-reset flows set a `wait` state and ran a countdown
effect on it for a long time, and `powered` likewise for reboot and shutdown —
but no JSX ever rendered either, so every one of those flows looked like it had
done nothing at all. `no-undef` cannot see this: the names are defined and are
read by the effect. Only opening the page does.

**A hold has to start before the slow part, not after it.** `uploadAndWait` only
reached `setWait` once the POST resolved, and only on success. A firmware image
is tens of megabytes, so the page stayed live for the whole transfer, and a
device that dropped the connection while applying landed in the catch, where the
hold never appeared. It now holds from the first byte and lets go only on a real
HTTP status, which means the device answered and refused.

**Report what you can observe, not a guess.** That same overlay used to promise a
five-minute countdown. How long an image takes to apply varies, and the clock
kept counting after the device was already back. It now polls `get_version` and
reports installing / restarting / complete — reaching complete only after having
seen the device go away, since it still answers for the first seconds of an
update and would otherwise flash success before anything had happened.

**Paths must be relative to the Vite base.** `index.html` referenced
`/data/favicon-*.ico`, which only the device's nginx serves; on Pages that
resolves against the domain root and 404s. The `site` branch even carried a
`docs/data/` copy that the published path could never reach. Reference bundled
assets as `./…` so they resolve under `/grism-studio/` wherever it is served.

**`cid` and node ids are not configuration.** They're React keys, regenerated on
every parse. `diffDoc` therefore compares each item's *serialised XML*, not its
in-memory shape — `normalizeDoc` also adds defaults (`alt`, `fattrs`, `fidAlt`)
that differ between construction paths. Comparing objects marked an untouched
document as entirely rewritten.

**Chains have no stable identity.** `diffDoc` matches them on content. An edited
chain reads as one removed plus one added; its `cid` is still in `touched` so the
row badge works.

**The i18n dictionaries are two separate blocks in one file.** A naive
`str.replace()` for a key usually hits the English block twice and never reaches
`zh-TW`. Anchor on a value that only exists in the block you mean. Two tests
guard this: key parity, and "no zh entry still holds the English text".

**Undo/redo is StrictMode-proof.** `setDoc` is a recording wrapper that computes
the next doc from `docRef.current` synchronously. Anything random (`nid()`,
`mkGroup()`) must be computed *outside* the updater, or StrictMode's double
invoke produces two different snapshots.

**`docSnapshot` normalises undefined arrays to `[]`.** Without it
`JSON.stringify` drops the key and undo can't restore an emptied section.

**Overlay editors need identical metrics.** `XmlEditor` stacks a line-number
gutter, a highlight layer and a transparent textarea. Padding, font-size,
line-height, letter-spacing must match exactly across all three or the caret
drifts from the text. Only the textarea scrolls; the others are synced and set to
`overflow: hidden`. The gutter needs a definite height or it stretches the
container and the pane looks split in two.

**`<label>` swallows clicks.** A label forwards any click inside it to its
control, which broke the scrim and buttons of the interface picker. Use `<div>`
for anything containing its own controls.

**`""` is not `"all"`.** For the interfaces field, empty means "nothing selected"
and is a validation error; only the literal `"all"` means everything.

**linkedom is lenient.** It auto-closes dangling tags where a browser's
DOMParser reports a `parsererror`. `grismXmlProblems` runs `xmlError` first so
both hosts agree.

**Field widths are content-driven.** `.find-row .val` sizes in `ch` against the
mono font so a full 36-char JA4 fits without scrolling, and outweighs the
trailing `.spacer` so it actually claims the row's free space. Eyeballing a px
value is how it ended up truncating at every viewport below 1920.

## The linter earns its keep

`no-undef` catches the one class of bug the suite cannot: a reference to a name
that doesn't exist throws at render and blanks the whole page, and a function
that's never called in a test is never checked. This has already caught two real
blank-page bugs (`listFiles`, `DEFAULT_PORTS`). `no-dupe-keys` caught 37
duplicated i18n keys. Keep the rule set small so it stays fast and signal-only.

There is also a `TabErrorBoundary` around the tab area: a render failure shows
the message and stack in place instead of blanking the app. That's how the
`listFiles` bug was diagnosed.

## Known rough edges

- `GrismStudio.jsx` is one 6000-line file. Splitting it by workspace is the
  obvious next refactor; the module boundary at `grism-core.js` already holds.
- Vite warns the bundle exceeds 500 kB. Harmless, but lazy-loading the simulate
  and traffic tabs would fix it.
- The device's `X-PacketX-Username` cookie is HttpOnly, so the signed-in name
  comes from `/grism/task/get_current_user` if that endpoint exists; otherwise the
  UI falls back to a generic marker.
