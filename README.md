# PKHosting VPS Hosting

A single static pricing page for a VPS line. Plain HTML, CSS and JavaScript, no framework, no build step and no network access at runtime.

The plans and prices are invented. Nothing here is for sale.

## Opening it

Open `index.html` in a browser. Double-click it, or drag it into a window.
There is nothing to install and no server to start; the page works from
`file://` with the network disconnected.

Everything it needs is in the repository. It makes no external requests at all,
so it behaves the same offline as online.

## What is in here

```
index.html            the page
css/styles.css        one stylesheet
js/pricing.js         pricing, currency, persistence, announcements
test/pricing.test.js  48 checks over the pricing module
img/                  full-page screenshots at 360, 768 and 1440
lighthouse/           Lighthouse runs, HTML and JSON, mobile and desktop
NOTES.md              audit of the live pkhosting.com pricing section
```

## How the pricing works

There is one number per plan in the whole codebase, the monthly list price in
rupees. Everything else is derived from it:

| Plan           | Monthly    | Annual, per month | Billed yearly |
| -------------- | ---------- | ----------------- | ------------- |
| Starter        | Rs 2,400   | Rs 2,000          | Rs 24,000     |
| Growth         | Rs 4,800   | Rs 4,000          | Rs 48,000     |
| Scale          | Rs 9,600   | Rs 8,000          | Rs 96,000     |
| Dedicated Core | Rs 19,500  | Rs 16,250         | Rs 195,000    |

Annual billing charges ten months and gives twelve, so the per-month figure is
`base * 10 / 12` and the yearly total is `base * 10`. The saving is the two
months not charged, and the 17% on the badge is `round(100 * (1 - 10 / 12))`,
computed from the same two constants rather than typed.

Conversion uses fixed internal rates held as rupees per unit, 278.50 for USD
and 355.00 for GBP, so PKR needs no special case and every conversion is one
division. Rupees display whole, dollars and pounds to two decimals.

**Rounding happens once, at the point of display, and nowhere else.** This is
the part worth checking. Growth costs `$17.24` a month. Deriving the annual
per-month from that rounded figure gives `$14.37`; deriving it from the exact
rupee amount gives `$14.36`. The second is correct and the test suite asserts
it, because it is the difference between a page that is right and one that
merely looks right.

### Where the numbers live

Monthly rupee prices are written into the HTML as text, in all eight price
nodes: four cards and four comparison table headers. With scripting disabled
the page is a complete and correct monthly price list. The module never builds
markup; it resolves those nodes once and rewrites their text.

Because the same figures then exist in two files, one of the tests scrapes them
back out of `index.html` and compares them against the module. That is what
stops them drifting apart.

## Decisions

**The controls are hidden when JavaScript is off**, rather than shown and
inert. A visitor without scripting gets the four cards, the full comparison
table and a working FAQ, all correct at monthly rupee prices. Offering a
billing toggle that cannot toggle would be worse than not offering one.

**The script is not deferred.** It sits before `</body>` and runs before the
first paint, so a returning visitor who chose USD and annual billing never sees
rupees flash past first. The live site restores its stored preference after
hydration and does exactly that; it is recorded as observation 6 in `NOTES.md`.

**Contrast was designed in, not checked afterwards.** PKHosting's brand green
is 3.2:1 on white, which fails for body text, so green is used as a fill and
never as a text colour on light ground. Buttons put near-black on green at
5.9:1, the pairing the live site already uses, and green text on white is the
darker `brand-700` at 6.4:1. Body copy is 8.4:1. Each semantic token in
`:root` carries its ratio in a comment.

**The billing toggle is a real radio group** styled as a segmented pill. The
inputs are moved off-screen with opacity rather than `display: none`, so they
keep focus and arrow-key behaviour, and the focus ring is drawn on the label.
The FAQ is native `<details>` and `<summary>`, which gets expand, collapse,
keyboard operation and state exposure without a line of script.

**Price changes are announced** through one polite live region. It names the
plan marked "Most popular" rather than reading all eight prices, and it is held
back 250ms so arrowing through the currency options queues one announcement
instead of three. Nothing is announced on first load.

**Height for the annual figures is reserved in CSS.** Switching to annual fills
a gap that already exists rather than making every card taller. Measured
Cumulative Layout Shift is 0.

**Layout uses no media query for the cards.** `repeat(auto-fit, minmax(15rem,
1fr))` lands on four, two and one column on its own. Type is fluid through
`clamp()` rather than stepped at breakpoints, so 200% zoom degrades
continuously. The comparison table scrolls inside its own container, which is
keyboard reachable and named; the page itself never scrolls sideways.

**Type is a local system stack.** PKHosting uses Plus Jakarta Sans and Inter.
Loading either would cost the network request this page is meant not to make,
and embedding a subset as base64 would add an unreadable blob to a stylesheet
that has to be explainable. The brand is carried by colour, spacing and
weight instead.

The reasoning behind the payment method shortlist and the choice of
`localStorage` over a query string or a cookie is in `NOTES.md`, alongside the
audit those decisions came out of.

## Tests

```
node test/pricing.test.js
```

48 checks, no dependencies and no test runner. It loads the real
`js/pricing.js` into a sandbox with a stub DOM and drives it through the
controls, covering:

- monthly rupee prices matching what the HTML ships
- the annual rule across all four plans, including Growth at Rs 4,000
- annual totals and savings badges being derived rather than typed
- whole rupees against two-decimal dollars and pounds
- rounding at display only, the `14.36` against `14.37` case above
- preferences surviving a reload, and the controls matching the restored state
- unrecognised stored values and a throwing `localStorage` both falling back
- announcement text, and repeated changes collapsing into one
- the eight prices in `index.html` still agreeing with the module

The stub answers only the selectors the module actually asks for, so a change
in its DOM assumptions surfaces as a failure rather than a silent pass.

## Lighthouse

|                | Mobile | Desktop |
| -------------- | ------ | ------- |
| Performance    | 97     | 100     |
| Accessibility  | 100    | 100     |
| Best Practices | 100    | 100     |
| SEO            | 100    | 100     |

Cumulative Layout Shift is 0 on both. Six network entries in total: the
document, the stylesheet, the script and three `data:` URIs for the check and
chevron marks, so nothing leaves the origin. 47 KB transferred against the
300 KB budget.

Reports are committed in `lighthouse/`, HTML and JSON for both profiles, from
Lighthouse 13.4.0. To reproduce, serve the folder and run:

```
python -c "from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler; ThreadingHTTPServer(('127.0.0.1', 8000), SimpleHTTPRequestHandler).serve_forever()"

npx lighthouse http://127.0.0.1:8000/ --output=html --output=json --output-path=lighthouse/report-mobile --chrome-flags="--headless"
```

Add `--preset=desktop` for the other profile. The page itself needs no server;
this is only so Lighthouse has a network stack to measure.

The audits scoring below full marks are deliberate. Minifying CSS and
JavaScript is declined because this is hand-authored with no build step and has
to stay readable. Cache lifetimes and document latency are properties of
`python -m http.server`, not of the page. Render-blocking covers the stylesheet
and the undeferred script, which is the trade for applying the stored currency
before the first paint.

## Tested in

Chrome 151 and Firefox, on Windows 11. In both:

- 360, 768 and 1440 widths
- `document.documentElement.scrollWidth <= clientWidth` true at all three
- scripting disabled: cards, table and FAQ all correct, controls absent
- offline, and from `file://` directly
- 200% zoom with nothing overlapping or clipped
- tabbed end to end, with a visible focus ring on every stop including the
  scrollable table region

Screenshots in `img/` are Chrome device-toolbar captures at DPR 1.

## What is unfinished

- The payment marks are set in type rather than drawn. Real logos would need
  inline SVG and permission to use them, and the brief ruled out hotlinking.
- Three currencies against the six the live site offers. Adding EUR, AED and
  SAR is a matter of extending one object, but they are not what a Pakistani
  VPS buyer is quoted in.
- Tested through Chrome's device emulation and Firefox's responsive mode, not
  on physical handsets. Emulation does not catch everything, particularly
  around touch targets and mobile Safari.
- No Safari or iOS testing at all, since neither was available.
- The test suite drives a stub DOM. It proves the pricing arithmetic and the
  state handling; it does not prove the page renders. The browser checks above
  were done by hand.
- The comparison table highlights the popular plan in its header but not down
  the body of that column.

## What I would improve next

- An end-to-end check, in Playwright or similar, for the three things currently
  verified by hand: no page-level horizontal scroll at each width, the page
  staying correct with scripting off, and the focus order.
- An automated axe pass alongside it, so accessibility is a build failure
  rather than a manual pass.
- If this ever had a server, the currency would come back from a cookie and be
  rendered server side. The current approach is already free of the flash, but
  reading the preference before the HTML is generated is the cleaner answer.
- A "was / now" price treatment, if discounts were ever introduced, using `<s>`
  with visually hidden context. The live site marks its old prices with a
  strikethrough class alone, which reads aloud as two prices and no
  explanation.

## AI assistance

Yep, I used Claude, throughout this build.

How it was used: I directed the work and made the decisions; the assistant
wrote the code, and I reviewed and changed it as we went. The
audit in `NOTES.md` came from fetching and reading the live site's served HTML,
its compiled stylesheet and its client bundle, which is where the specific
attribute names, the `cycleAmount` helper and the `annualPkr` discrepancy came
from rather than from guesswork. The design tokens are the real values pulled
from PKHosting's stylesheet. The contrast ratios were computed, not estimated.
Layout corrections after the first round of screenshots were mine.

I can explain and edit any part of this live.
