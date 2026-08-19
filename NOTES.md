# Notes

## Audit of the live pkhosting.com pricing section

Checked on 20 August 2026 against the served HTML of `/`, `/pricing/`, `/hosting/`,
`/vps/` and `/faq/`. The site is Next.js App Router, so the
prices are server-rendered into the HTML and the interactive parts are React
client components.

### 1. The billing toggle is two bare buttons with no state in the accessibility tree

The Monthly/Annually control is:

```html
<div class="inline-flex items-center rounded-full p-1 bg-ink-100">
  <button type="button" class="... bg-white text-ink-900 shadow-soft">Monthly</button>
  <button type="button" class="... text-ink-500">Annually <span>Save up to 16%</span></button>
</div>
```

No `aria-pressed`, no `role="radiogroup"` or `role="tablist"`, no `aria-current`.
`aria-pressed` appears zero times on the page. Which option is active is carried
entirely by `bg-white` and `shadow-soft`.

Consequence: a screen reader announces two plain buttons and nothing about which
one is in effect, so a blind user can toggle billing and have no way to tell what
the prices on screen now represent. The same information is unavailable to anyone
who cannot separate the two background tones.

### 2. Prices change with no announcement

There is exactly one `aria-live` region in the document and it belongs to the
domain search widget in the hero:

```html
<p class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
```

The pricing cards have none.

Consequence: switching currency or billing period rewrites nine visible numbers
and a screen reader user gets silence. The control they just operated gives no
feedback, so the only way to discover the result is to navigate back through the
cards and re-read them.

### 3. The toggle's savings figure is a typed string while the card's is computed

The toggle label comes in as a hard-coded prop, `savingsLabel: "Save up to 16%"`
on shared hosting and `"Save up to 8%"` on `/vps/`. The badge inside each card is
interpolated from the price pair, which is visible in the payload as
`["Save ", 46, "%"]`.

The typed figure is also wrong in the conservative direction. Personal is
`pkr: 699, annualPkr: 6990`, so the year costs ten months instead of twelve and
the real saving is 16.67%, not 16%.

Consequence: two different savings numbers sit within about 40px of each other on
the same card ("Save up to 16%" and "Save 46%") measuring two unrelated things,
the annual discount and the discount off list price. Anyone changing the annual
multiple has to remember to edit a string in a different component, and the
string will keep rendering the old number until they do.

### 4. Two competing definitions of the annual amount, and they disagree on /vps/

Every plan ships an explicit `annualPkr` in the server payload, and the client
bundle separately defines:

```js
function cycleAmount(a, cycle) { return cycle === "annual" ? Math.round(10 * a) : a }
```

On shared hosting the two agree: `1999 -> 19990` is the same as `1999 * 10`. On
`/vps/` they do not. `pkr: 2999` carries `annualPkr: 32990`, which is eleven
months, while the helper would produce `29990`.

The struck-through list prices are hand-entered too and none of them follow the
same multiple: `1290 -> 12940` (not 12900), `3510 -> 35070` (not 35100),
`7020 -> 70160` (not 70200).

Consequence: the annual price a customer sees depends on which of the two code
paths renders it, and a Rs 3,000 discrepancy on the VPS line is invisible until
someone reconciles an invoice. This is the failure I built against: one base
figure per plan and every other number derived from it.

### 5. The old price is styled, not marked up

```html
<span class="text-sm font-semibold line-through decoration-2 tabular-nums text-ink-400">Rs<!-- -->1,290</span>
```

No `<s>` or `<del>`, no visually hidden "was" or "now", and the currency symbol
sits in a different span from the digits.

Consequence: the card reads aloud as "Rs 1,290, Save 46%, Rs 699 /mo" with
nothing to say the first figure is superseded. The strikethrough is the only
thing distinguishing the price the customer will not pay from the one they will,
and it is purely visual.

### 6. The stored preference is applied after hydration, so the price flashes

Currency and billing period persist, and the restore is:

```js
let t = localStorage.getItem("pk-currency"), r = localStorage.getItem("pk-billing");
window.requestAnimationFrame(() => { ... })
```

That runs in a `useEffect`, so it happens after the server-rendered markup has
already painted, and the `requestAnimationFrame` pushes it one frame later again.

Consequence: a returning customer who chose USD and annual billing loads the page
showing monthly PKR, then watches every price on screen change once the bundle
hydrates. On a slow connection that window is long enough to read the wrong
number, and because the annual layout carries an extra line the cards shift
vertically when it lands.

### Two things worth recording that are not defects

The site hard-codes its rates rather than calling an FX API:
`PKR 1, USD 280, GBP 360, EUR 305, AED 76, SAR 74`, each as `pkrPerUnit` with a
`decimals` field that is `0` for PKR and `2` for everything else. That is the same
approach and the same rounding rule this brief asks for, so the fixed-rate
requirement matches production rather than simplifying away from it.

There is no `<table>` element anywhere on `/pricing/`. The "Compare all plans"
link leads to a page of ten VPS cards stacked in a grid, which is why comparing a
line item across plans there means scrolling back and forth.

---

## Decisions and trade-offs

### Payment methods

What the live site actually shows, which I counted rather than assumed: the
footer strip carries five marks, Stripe, PayPal, JazzCash, Easypaisa and Bank
account. The FAQ answer names two more by brand, Visa and Mastercard, "via
Stripe". That is seven distinct methods across the site, not the eight in the
brief, and I could not find a page listing more. Checkout sits behind a login,
so if the eighth is there I have not seen it.

I kept five: bank transfer, JazzCash, Easypaisa, Visa, Mastercard.

**Dropped Stripe.** It is the processor behind the card option, not a thing a
buyer chooses. Showing it beside Visa and Mastercard presents one payment route
as two, and the mark a Pakistani customer recognises on the card in their hand is
Visa or Mastercard, not the gateway. Naming the networks is the more useful
signal.

**Dropped PayPal.** PayPal does not operate for account holders in Pakistan. A
local buyer paying a PKR invoice cannot fund a PayPal balance from a Pakistani
bank, so the logo mostly generates support tickets from people who assume they
can use it. It earns its place on a site selling to the diaspora, which is a
different page from this one.

The retained five are the ones a Pakistani VPS buyer can actually complete a
recurring server payment with. Bank transfer and the two wallets cover buyers
without an internationally enabled card, which is most of the individual and
small-agency market, and the two card networks cover the rest.

The live footer wraps its marks in `<div aria-label="Accepted payment methods">`
with no role. An `aria-label` on a generic div is dropped by browsers, so that
group name never reaches assistive technology and the marks read as five loose
images. Mine is a labelled `<section>` with a real heading and a list, and the
marks are text rather than images, which also keeps the page at zero external
requests.

### Persisting currency and billing period

`localStorage` under two keys, read once on load and validated against the known
currency and period values before use, falling back to PKR and monthly if the
stored value is missing, unrecognised or if storage throws. Storage access is in
a `try`/`catch` because `file://` origins and private browsing modes can both
refuse it, and a page that throws on load would fail the offline test outright.

I considered a query string, which has the advantage of being shareable and
survives a hard refresh with no storage at all. I did not use it: a pricing URL
that pins a currency gets pasted into chat and then quotes GBP at someone who
pays in rupees. The preference belongs to the browser, not the link.

A cookie would work equally well and would let a server render the right currency
on the first byte, which is the proper fix for observation 6. There is no server
here, so it would buy nothing and cost a consent question.

Against observation 6, the restore runs before first paint rather than after, so
a returning visitor never sees the default state flash past.
