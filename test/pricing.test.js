/* ============================================================================
   Runs js/pricing.js against a stub DOM and checks the numbers it writes.

       node test/pricing.test.js

   No dependencies and no test runner. The stub answers only the selectors the
   module actually asks for, which keeps it short and makes a change in the
   module's DOM assumptions show up here as a failure rather than a silent pass.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'pricing.js'), 'utf8');
const PLANS = ['starter', 'growth', 'scale', 'dedicated'];

let failures = 0;
let checks = 0;

function is(actual, expected, label) {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/* Stub DOM ----------------------------------------------------------------- */

function element(attrs, children) {
  return {
    attrs: attrs || {},
    children: children || {},
    textContent: '',
    listeners: {},
    value: '',
    checked: false,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    querySelector(selector) {
      return this.children[selector] || null;
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };
}

/*
  Mirrors the real page: four cards, each with a price and an annual line, plus
  the four prices repeated in the comparison table head with no card around them.
*/
function buildPage() {
  const cards = {};
  const tablePrices = {};

  PLANS.forEach((plan) => {
    const symbol = element();
    const amount = element();
    const price = element({ 'data-plan': plan }, { '.price__symbol': symbol, '.price__amount': amount });

    const total = element();
    const save = element();
    const line = element({ 'data-annual-line': '', hidden: '' }, {
      '.card__annual-total': total,
      '.card__annual-save': save
    });

    const card = element({}, { '.price[data-plan]': price });
    line.closest = (selector) => (selector === '.card' ? card : null);

    cards[plan] = { symbol, amount, price, total, save, line };

    const tableSymbol = element();
    const tableAmount = element();
    const tablePrice = element({ 'data-plan': plan }, {
      '.price__symbol': tableSymbol,
      '.price__amount': tableAmount
    });
    tablePrice.closest = () => null;
    tablePrices[plan] = { symbol: tableSymbol, amount: tableAmount, price: tablePrice };
  });

  const announcer = element();
  const select = element();
  select.value = 'PKR';

  const monthly = element();
  monthly.value = 'monthly';
  const annual = element();
  annual.value = 'annual';

  const byId = {
    'price-announcer': announcer,
    'currency-select': select
  };

  const bySelector = {
    '.price[data-plan]': PLANS.map((p) => cards[p].price).concat(PLANS.map((p) => tablePrices[p].price)),
    '[data-annual-line]': PLANS.map((p) => cards[p].line),
    'input[name="billing"]': [monthly, annual]
  };

  const document = {
    getElementById: (id) => byId[id] || null,
    querySelectorAll: (selector) => bySelector[selector] || []
  };

  return { document, cards, tablePrices, announcer, select, radios: { monthly, annual } };
}

function storage(seed, throwOnAccess) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem(key) {
      if (throwOnAccess) throw new Error('storage disabled');
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      if (throwOnAccess) throw new Error('storage disabled');
      map.set(key, value);
    },
    dump: () => Object.fromEntries(map)
  };
}

/* Loads the real module into a sandbox and returns handles to drive it. */
function load(options) {
  const page = buildPage();
  const store = storage((options || {}).stored, (options || {}).storageThrows);
  const timers = [];

  const sandbox = {
    document: page.document,
    window: {
      localStorage: store,
      setTimeout: (fn) => timers.push(fn) - 1,
      clearTimeout: (id) => {
        if (typeof id === 'number') timers[id] = null;
      }
    },
    Intl,
    Math,
    Object
  };

  vm.runInNewContext(SOURCE, sandbox, { filename: 'pricing.js' });

  return {
    ...page,
    store,
    flush() {
      timers.forEach((fn) => fn && fn());
      timers.length = 0;
    },
    setPeriod(value) {
      page.radios[value].listeners.change({ target: { value } });
    },
    setCurrency(value) {
      page.select.listeners.change({ target: { value } });
    }
  };
}

function priced(page, plan) {
  return page.cards[plan].symbol.textContent + '|' + page.cards[plan].amount.textContent;
}

/* Cases -------------------------------------------------------------------- */

console.log('\nmonthly PKR is what the HTML already ships');
{
  const page = load();
  is(priced(page, 'starter'), 'Rs|2,400', 'starter monthly PKR');
  is(priced(page, 'growth'), 'Rs|4,800', 'growth monthly PKR');
  is(priced(page, 'scale'), 'Rs|9,600', 'scale monthly PKR');
  is(priced(page, 'dedicated'), 'Rs|19,500', 'dedicated monthly PKR');
  is(page.cards.growth.total.textContent, '', 'no annual total while monthly');
  is(page.cards.growth.save.textContent, '', 'no savings badge while monthly');
  is(page.cards.growth.line.getAttribute('hidden'), null, 'annual line revealed so its height is reserved');
}

console.log('annual per-month is (monthly x 10) / 12');
{
  const page = load();
  page.setPeriod('annual');
  is(priced(page, 'starter'), 'Rs|2,000', 'starter annual per month');
  is(priced(page, 'growth'), 'Rs|4,000', 'growth annual per month, the figure named in the brief');
  is(priced(page, 'scale'), 'Rs|8,000', 'scale annual per month');
  is(priced(page, 'dedicated'), 'Rs|16,250', 'dedicated annual per month');
}

console.log('annual total and savings badge are derived, not typed');
{
  const page = load();
  page.setPeriod('annual');
  is(page.cards.starter.total.textContent, 'Rs 24,000 billed yearly', 'starter annual total');
  is(page.cards.growth.total.textContent, 'Rs 48,000 billed yearly', 'growth annual total');
  is(page.cards.dedicated.total.textContent, 'Rs 195,000 billed yearly', 'dedicated annual total');
  is(page.cards.growth.save.textContent, 'Save Rs 9,600 (17%)', 'growth saving is the two free months');
  is(page.cards.dedicated.save.textContent, 'Save Rs 39,000 (17%)', 'dedicated saving');
}

console.log('the comparison table head tracks the cards');
{
  const page = load();
  page.setPeriod('annual');
  page.setCurrency('USD');
  is(page.tablePrices.growth.amount.textContent, '14.36', 'table price matches the card');
  is(page.tablePrices.growth.symbol.textContent, '$', 'table symbol matches the card');
}

console.log('PKR is whole, USD and GBP carry two decimals');
{
  const page = load();
  page.setCurrency('USD');
  is(priced(page, 'growth'), '$|17.24', 'growth monthly USD, 4800 / 278.50');
  is(priced(page, 'dedicated'), '$|70.02', 'dedicated monthly USD');
  page.setCurrency('GBP');
  is(priced(page, 'growth'), '£|13.52', 'growth monthly GBP, 4800 / 355.00');
  is(priced(page, 'dedicated'), '£|54.93', 'dedicated monthly GBP');
}

console.log('rounding happens once, at display, never mid-chain');
{
  /*
    17.24 is the rounded monthly USD figure. Deriving the annual per-month from
    it gives 14.37; deriving it from the exact PKR gives 14.36. The second is
    correct, and this is the case that tells the two apart.
  */
  const page = load();
  page.setPeriod('annual');
  page.setCurrency('USD');
  is(priced(page, 'growth'), '$|14.36', 'annual USD comes from exact PKR, not from the rounded monthly');
  is(page.cards.growth.total.textContent, '$172.35 billed yearly', 'annual total in USD');
  page.setCurrency('GBP');
  is(priced(page, 'growth'), '£|11.27', 'annual GBP per month');
  is(page.cards.growth.total.textContent, '£135.21 billed yearly', 'annual total in GBP');
}

console.log('preferences survive a reload');
{
  const first = load();
  first.setPeriod('annual');
  first.setCurrency('GBP');
  is(first.store.dump()['pkh-vps-period'], 'annual', 'period written to storage');
  is(first.store.dump()['pkh-vps-currency'], 'GBP', 'currency written to storage');

  const second = load({ stored: first.store.dump() });
  is(priced(second, 'growth'), '£|11.27', 'restored state renders on load');
  is(second.select.value, 'GBP', 'currency control matches the restored state');
  is(second.radios.annual.checked, true, 'annual radio matches the restored state');
  is(second.radios.monthly.checked, false, 'monthly radio cleared');
}

console.log('bad or unavailable storage falls back instead of breaking');
{
  const junk = load({ stored: { 'pkh-vps-currency': 'EUR', 'pkh-vps-period': 'weekly' } });
  is(priced(junk, 'growth'), 'Rs|4,800', 'unrecognised stored values fall back to monthly PKR');

  const blocked = load({ storageThrows: true });
  is(priced(blocked, 'growth'), 'Rs|4,800', 'page still renders when storage throws');
  blocked.setCurrency('USD');
  is(priced(blocked, 'growth'), '$|17.24', 'and still responds to the controls');
}

console.log('changes are announced');
{
  const page = load();
  is(page.announcer.textContent, '', 'nothing announced on first load');

  page.setPeriod('annual');
  page.flush();
  is(
    page.announcer.textContent,
    'Annual billing in Pakistani rupees. Growth is Rs 4,000 per month, billed as Rs 48,000 for the year.',
    'annual announcement'
  );

  page.setCurrency('USD');
  page.flush();
  is(
    page.announcer.textContent,
    'Annual billing in US dollars. Growth is $14.36 per month, billed as $172.35 for the year.',
    'currency announcement'
  );
}

console.log('repeated announcements collapse into one');
{
  const page = load();
  page.setCurrency('USD');
  page.setCurrency('GBP');
  page.setCurrency('PKR');
  page.flush();
  is(
    page.announcer.textContent,
    'Monthly billing in Pakistani rupees. Growth is Rs 4,800 per month.',
    'only the settled state is announced'
  );
}

console.log('the prices typed into index.html agree with the module');
{
  /*
    The brief requires monthly PKR to be readable in the HTML source with
    scripting off, which means the same figures exist in two files. This is the
    check that stops them drifting apart.
  */
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const page = load();
  const pattern = /data-plan="([a-z]+)"[^!]{0,200}?price__amount">([^<]+)</g;
  let match;
  let found = 0;

  while ((match = pattern.exec(html)) !== null) {
    found++;
    is(match[2], page.cards[match[1]].amount.textContent, 'index.html ' + match[1] + ' matches rendered monthly PKR');
  }

  is(found, 8, 'all eight price nodes are present in the source');
}

console.log(`\n${checks - failures}/${checks} passed\n`);
process.exit(failures ? 1 : 0);
