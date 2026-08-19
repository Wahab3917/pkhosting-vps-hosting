/* ============================================================================
   PKHosting VPS Hosting: pricing

   One base figure per plan. Every other number on the page, the annual
   per-month, the annual total, the saving and its percentage, is derived from
   it. Nothing is typed in two places, and nothing is rounded until it is about
   to be displayed.

   Loaded as a classic script rather than a module: file:// origins refuse
   type="module" on CORS grounds, and the page has to open from disk.
   ========================================================================== */

(function () {
  'use strict';

  /* Data ------------------------------------------------------------------ */

  /* Monthly list price in PKR. The single source of truth for the page. */
  var BASE_PKR = {
    starter: 2400,
    growth: 4800,
    scale: 9600,
    dedicated: 19500
  };

  /*
    Fixed internal rates, held as rupees per unit so PKR needs no special case
    and conversion is always a single division. No FX call.
  */
  var CURRENCIES = {
    PKR: { symbol: 'Rs', spaced: true, decimals: 0, pkrPerUnit: 1, spoken: 'Pakistani rupees' },
    USD: { symbol: '$', spaced: false, decimals: 2, pkrPerUnit: 278.50, spoken: 'US dollars' },
    GBP: { symbol: '£', spaced: false, decimals: 2, pkrPerUnit: 355.00, spoken: 'pounds sterling' }
  };

  /* Annual billing charges ten months and gives twelve. */
  var MONTHS_CHARGED = 10;
  var MONTHS_PER_YEAR = 12;

  var PERIODS = ['monthly', 'annual'];

  var STORAGE_CURRENCY = 'pkh-vps-currency';
  var STORAGE_PERIOD = 'pkh-vps-period';

  var DEFAULT_CURRENCY = 'PKR';
  var DEFAULT_PERIOD = 'monthly';

  /*
    Announcements name one plan rather than all four. Reading eight prices
    every time a control moves is noise, not feedback, so the card marked
    "Most popular" stands in as the reference.
  */
  var REFERENCE_PLAN = 'growth';
  var REFERENCE_NAME = 'Growth';

  var ANNOUNCE_DELAY = 250;

  /* Pricing ---------------------------------------------------------------- */

  function perMonthPkr(plan, period) {
    var base = BASE_PKR[plan];
    return period === 'annual' ? (base * MONTHS_CHARGED) / MONTHS_PER_YEAR : base;
  }

  function annualTotalPkr(plan) {
    return BASE_PKR[plan] * MONTHS_CHARGED;
  }

  function annualSavingPkr(plan) {
    return BASE_PKR[plan] * (MONTHS_PER_YEAR - MONTHS_CHARGED);
  }

  var SAVING_PERCENT = Math.round(100 * (1 - MONTHS_CHARGED / MONTHS_PER_YEAR));

  /* Formatting ------------------------------------------------------------- */

  /*
    en-US grouping, which is what the live site uses and what the prices
    written into the HTML already assume. Locales that group in lakhs would
    disagree with the markup the page ships with.
  */
  var formatters = {};

  function formatterFor(code) {
    if (!formatters[code]) {
      formatters[code] = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: CURRENCIES[code].decimals,
        maximumFractionDigits: CURRENCIES[code].decimals
      });
    }
    return formatters[code];
  }

  /* Converts and rounds in one step, at the point of display and nowhere else. */
  function parts(pkr, code) {
    var currency = CURRENCIES[code];
    return {
      symbol: currency.symbol,
      amount: formatterFor(code).format(pkr / currency.pkrPerUnit)
    };
  }

  function text(pkr, code) {
    var p = parts(pkr, code);
    return CURRENCIES[code].spaced ? p.symbol + ' ' + p.amount : p.symbol + p.amount;
  }

  /* State ------------------------------------------------------------------ */

  /*
    Storage can throw outright: Safari in private mode, and some browsers on
    file:// origins. A pricing page that fails to open is worse than one that
    forgets a preference, so every access is guarded and falls back.
  */
  function readStored(key, allowed, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return allowed.indexOf(value) === -1 ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function writeStored(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* Preference is lost on reload; the page itself is unaffected. */
    }
  }

  var state = {
    currency: readStored(STORAGE_CURRENCY, Object.keys(CURRENCIES), DEFAULT_CURRENCY),
    period: readStored(STORAGE_PERIOD, PERIODS, DEFAULT_PERIOD)
  };

  /* Rendering -------------------------------------------------------------- */

  var priceNodes = [];
  var annualNodes = [];
  var announcer = document.getElementById('price-announcer');
  var currencySelect = document.getElementById('currency-select');
  var billingInputs = document.querySelectorAll('input[name="billing"]');

  /*
    Every node the module touches already exists in the HTML with a correct
    monthly PKR value. Nothing here creates markup; it only rewrites text.
  */
  function collect() {
    var i;
    var nodes = document.querySelectorAll('.price[data-plan]');

    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var plan = node.getAttribute('data-plan');
      var symbol = node.querySelector('.price__symbol');
      var amount = node.querySelector('.price__amount');

      if (BASE_PKR[plan] && symbol && amount) {
        priceNodes.push({ plan: plan, symbol: symbol, amount: amount });
      }
    }

    var lines = document.querySelectorAll('[data-annual-line]');

    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var card = line.closest('.card');
      var price = card && card.querySelector('.price[data-plan]');

      if (!price) {
        continue;
      }

      annualNodes.push({
        plan: price.getAttribute('data-plan'),
        total: line.querySelector('.card__annual-total'),
        save: line.querySelector('.card__annual-save')
      });

      /*
        Revealed once, for both periods. The stylesheet reserves its height,
        so switching to annual fills a gap that is already there rather than
        making every card taller.
      */
      line.removeAttribute('hidden');
    }
  }

  function render() {
    var i;

    for (i = 0; i < priceNodes.length; i++) {
      var node = priceNodes[i];
      var price = parts(perMonthPkr(node.plan, state.period), state.currency);

      node.symbol.textContent = price.symbol;
      node.amount.textContent = price.amount;
    }

    for (i = 0; i < annualNodes.length; i++) {
      var line = annualNodes[i];

      if (state.period === 'annual') {
        line.total.textContent = text(annualTotalPkr(line.plan), state.currency) + ' billed yearly';
        line.save.textContent = 'Save ' + text(annualSavingPkr(line.plan), state.currency) +
          ' (' + SAVING_PERCENT + '%)';
      } else {
        line.total.textContent = '';
        line.save.textContent = '';
      }
    }
  }

  /* Announcing ------------------------------------------------------------- */

  var announceTimer = null;

  /*
    Held back briefly so that moving through the currency options with the
    keyboard queues one announcement rather than three.
  */
  function announce() {
    if (!announcer) {
      return;
    }

    window.clearTimeout(announceTimer);

    announceTimer = window.setTimeout(function () {
      var currency = CURRENCIES[state.currency].spoken;
      var perMonth = text(perMonthPkr(REFERENCE_PLAN, state.period), state.currency);
      var message;

      if (state.period === 'annual') {
        message = 'Annual billing in ' + currency + '. ' + REFERENCE_NAME + ' is ' + perMonth +
          ' per month, billed as ' + text(annualTotalPkr(REFERENCE_PLAN), state.currency) +
          ' for the year.';
      } else {
        message = 'Monthly billing in ' + currency + '. ' + REFERENCE_NAME + ' is ' + perMonth +
          ' per month.';
      }

      announcer.textContent = message;
    }, ANNOUNCE_DELAY);
  }

  /* Wiring ----------------------------------------------------------------- */

  function setPeriod(period) {
    if (PERIODS.indexOf(period) === -1 || period === state.period) {
      return;
    }

    state.period = period;
    writeStored(STORAGE_PERIOD, period);
    render();
    announce();
  }

  function setCurrency(code) {
    if (!CURRENCIES[code] || code === state.currency) {
      return;
    }

    state.currency = code;
    writeStored(STORAGE_CURRENCY, code);
    render();
    announce();
  }

  function init() {
    collect();

    if (!priceNodes.length) {
      return;
    }

    /* Match the controls to the restored preference before anything renders. */
    for (var i = 0; i < billingInputs.length; i++) {
      billingInputs[i].checked = billingInputs[i].value === state.period;

      billingInputs[i].addEventListener('change', function (event) {
        setPeriod(event.target.value);
      });
    }

    if (currencySelect) {
      currencySelect.value = state.currency;
      currencySelect.addEventListener('change', function (event) {
        setCurrency(event.target.value);
      });
    }

    render();
  }

  init();
}());
