/* Aggregation + filter selectors over TATU.transactions
   Analysis/overview now CONVERT every transaction into a single display
   currency and COMBINE both currencies, instead of filtering by currency. */
(function () {
  const T = window.TATU;

  function inCurrency(txs, cur) {
    return cur === 'all' ? txs : txs.filter((t) => t.currency === cur);
  }

  // amount of a tx expressed in the display currency
  function amt(t, disp, rate) {
    return T.convert(t.amount, t.currency, disp, rate);
  }

  // Category spend breakdown (expenses only), all converted to `disp`
  function categoryBreakdown(txs, disp, rate) {
    const list = txs.filter((t) => t.amount < 0 && t.category !== 'transfer');
    const map = {};
    list.forEach((t) => {
      const v = Math.abs(amt(t, disp, rate));
      map[t.category] = (map[t.category] || 0) + v;
    });
    const rows = Object.entries(map)
      .map(([cat, value]) => ({ cat, value, ...T.CATEGORIES[cat] }))
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    rows.forEach((r) => (r.pct = (r.value / total) * 100));
    return { rows, total };
  }

  // Monthly income/expense trend, converted + combined
  function monthlyTrend(txs, disp, rate) {
    const list = txs.filter((t) => t.category !== 'transfer');
    const buckets = {};
    list.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets[key]) buckets[key] = { key, income: 0, expense: 0, date: d };
      const v = amt(t, disp, rate);
      if (v > 0) buckets[key].income += v;
      else buckets[key].expense += Math.abs(v);
    });
    return Object.values(buckets)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((b) => ({
        label: b.date.toLocaleDateString('es-UY', { month: 'short' }),
        income: Math.round(b.income),
        expense: Math.round(b.expense),
      }));
  }

  // This-month summary, converted + combined, plus a native split
  function monthSummary(txs, disp, rate) {
    const dates = txs.map((t) => new Date(t.date));
    const newest = new Date(Math.max(...dates.map((d) => d.getTime())));
    const m = newest.getMonth(), y = newest.getFullYear();
    const list = txs.filter((t) => {
      const d = new Date(t.date);
      return d.getMonth() === m && d.getFullYear() === y && t.category !== 'transfer';
    });
    let income = 0, expense = 0;
    const split = { USD: 0, UYU: 0 }; // native expense totals
    list.forEach((t) => {
      const v = amt(t, disp, rate);
      if (v > 0) income += v;
      else { expense += Math.abs(v); split[t.currency] += Math.abs(t.amount); }
    });
    return {
      income, expense, net: income - expense, count: list.length, split,
      monthLabel: newest.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' }),
    };
  }

  // Share of converted expense that originated in each currency
  function currencySplit(txs, disp, rate) {
    const list = txs.filter((t) => t.amount < 0 && t.category !== 'transfer');
    const out = { USD: 0, UYU: 0 };
    list.forEach((t) => { out[t.currency] += Math.abs(amt(t, disp, rate)); });
    const total = out.USD + out.UYU || 1;
    return { USD: out.USD, UYU: out.UYU, total, pctUSD: (out.USD / total) * 100, pctUYU: (out.UYU / total) * 100 };
  }

  function applyFilters(txs, f) {
    let r = txs;
    if (f.search) {
      const q = f.search.toLowerCase();
      r = r.filter((t) => (t.displayDescription || t.description).toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    if (f.categories && f.categories.length) r = r.filter((t) => f.categories.includes(t.category));
    if (f.accounts && f.accounts.length) r = r.filter((t) => f.accounts.includes(t.account));
    if (f.currency && f.currency !== 'all') r = r.filter((t) => t.currency === f.currency);
    if (f.from) { const d = new Date(f.from + 'T00:00:00'); r = r.filter((t) => new Date(t.date) >= d); }
    if (f.to) { const d = new Date(f.to + 'T23:59:59'); r = r.filter((t) => new Date(t.date) <= d); }
    if (f.min) r = r.filter((t) => Math.abs(t.amount) >= parseFloat(f.min));
    if (f.max) r = r.filter((t) => Math.abs(t.amount) <= parseFloat(f.max));
    if (f.type === 'income') r = r.filter((t) => t.amount > 0);
    if (f.type === 'expense') r = r.filter((t) => t.amount < 0);
    return r.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  window.SEL = { categoryBreakdown, monthlyTrend, monthSummary, currencySplit, applyFilters, inCurrency };
})();
