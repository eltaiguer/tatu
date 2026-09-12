/* Tatú mock data — realistic Santander Uruguay merchants & accounts */
(function () {
  // category meta: id -> { label, icon, color, kind }
  const CATEGORIES = {
    groceries: { label: 'Alimentación', icon: '🛒', color: '#22c55e', kind: 'expense' },
    restaurants: { label: 'Restaurantes', icon: '🍽️', color: '#f97316', kind: 'expense' },
    transport: { label: 'Transporte', icon: '🚗', color: '#0ea5e9', kind: 'expense' },
    utilities: { label: 'Servicios', icon: '💡', color: '#64748b', kind: 'expense' },
    healthcare: { label: 'Salud', icon: '🏥', color: '#ef4444', kind: 'expense' },
    shopping: { label: 'Compras', icon: '🛍️', color: '#ec4899', kind: 'expense' },
    entertainment: { label: 'Entretenimiento', icon: '🎬', color: '#f59e0b', kind: 'expense' },
    software: { label: 'Software', icon: '💻', color: '#6366f1', kind: 'expense' },
    insurance: { label: 'Seguros', icon: '🛡️', color: '#10b981', kind: 'expense' },
    housing: { label: 'Vivienda', icon: '🏠', color: '#6b7280', kind: 'expense' },
    income: { label: 'Ingresos', icon: '💰', color: '#16a34a', kind: 'income' },
    transfer: { label: 'Transferencias', icon: '💸', color: '#0284c7', kind: 'transfer' },
    fees: { label: 'Comisiones', icon: '💳', color: '#fb7185', kind: 'expense' },
    uncategorized: { label: 'Sin categoría', icon: '❓', color: '#94a3b8', kind: 'expense' },
  };

  const ACCOUNTS = {
    card: { label: 'Tarjeta de Crédito', short: 'Tarjeta', sub: 'Santander Visa', last4: '4362', icon: 'card' },
    usd: { label: 'Cuenta en Dólares', short: 'Cuenta USD', sub: 'Caja de ahorro USD', last4: '8226', icon: 'dollar' },
    uyu: { label: 'Cuenta en Pesos', short: 'Cuenta UYU', sub: 'Caja de ahorro UYU', last4: '9520', icon: 'bank' },
  };

  // raw seed: [day-offset-from-newest, desc, cat, account, currency, amount, conf, display?]
  // amount negative = expense, positive = income
  const seed = [
    [0, 'Spotify', 'entertainment', 'card', 'USD', -9.13, 0.97, 'Spotify Premium'],
    [0, 'Seguro Saldo Deudor', 'insurance', 'card', 'USD', -6.74, 0.9],
    [0, 'Seguro Saldo Deudor', 'insurance', 'card', 'UYU', -422.1, 0.9],
    [1, 'Carniceria Velsen', 'groceries', 'card', 'UYU', -255.93, 0.82],
    [1, 'Merpago Lineupshop', 'shopping', 'card', 'UYU', -1981.0, 0.55, 'Lineup Shop'],
    [1, 'Provicentro Carlitos', 'groceries', 'card', 'UYU', -1383.0, 0.78],
    [2, 'Provicentro Carlitos', 'groceries', 'card', 'UYU', -435.0, 0.78],
    [3, 'Amazon Web Services', 'software', 'card', 'USD', -2.81, 0.4],
    [4, 'Super Sol', 'groceries', 'card', 'UYU', -737.76, 0.88],
    [6, 'Devoto Supermercado', 'groceries', 'card', 'UYU', -1888.87, 0.95],
    [6, 'Hospital Britanico', 'healthcare', 'card', 'UYU', -639.1, 0.93],
    [6, 'Hospital Britanico', 'healthcare', 'card', 'UYU', -175.98, 0.93],
    [6, 'Farmashop 19 Visa', 'healthcare', 'card', 'UYU', -307.7, 0.86, 'Farmashop'],
    [6, 'COMPRA TARJETA DEBITO PANADERIA MARACANA, MONTEVIDEO', 'groceries', 'uyu', 'UYU', -295.08, 0.7, 'Panadería Maracana'],
    [6, 'COMPRA TARJETA DEBITO LAVADERO ESPUMA, MONTEVIDEO', 'utilities', 'uyu', 'UYU', -620.69, 0.5, 'Lavadero Espuma'],
    [7, 'Airbnb Hmjystp5sp', 'housing', 'card', 'USD', -1346.36, 0.6, 'Airbnb'],
    [7, 'Christoph Maya Hernan Rau', 'restaurants', 'card', 'UYU', -933.26, 0.45],
    [7, 'DLO.PEDIDOSYA PROPIN, MONTEVIDEO', 'restaurants', 'uyu', 'UYU', -47.0, 0.8, 'PedidosYa propina'],
    [7, 'DLO.PEDIDOSYA, MONTEVIDEO', 'restaurants', 'uyu', 'UYU', -429.99, 0.92, 'PedidosYa'],
    [7, 'Hospital Britanico', 'healthcare', 'card', 'UYU', -157.46, 0.93],
    [9, 'Jetbrains Americas Inc', 'software', 'card', 'USD', -22.81, 0.96, 'JetBrains'],
    [9, 'Sopranos', 'restaurants', 'card', 'UYU', -1019.86, 0.74],
    [10, 'Antel Fijo Deb Aut', 'utilities', 'card', 'UYU', -1595.0, 0.94, 'Antel'],
    [10, 'Ancap Casa Anon Sa', 'transport', 'card', 'UYU', -2830.0, 0.7, 'Ancap'],
    [11, 'Atlassian', 'software', 'card', 'USD', -129.16, 0.92],
    [11, 'Vans', 'shopping', 'card', 'USD', -50.98, 0.8],
    [11, 'Linkedin Sn P636194253', 'software', 'card', 'UYU', -4449.0, 0.85, 'LinkedIn'],
    [12, 'Super Sol', 'groceries', 'card', 'UYU', -895.81, 0.88],
    [13, 'Panes 1', 'groceries', 'card', 'UYU', -446.0, 0.6, 'Panadería'],
    [13, 'Devoto Supermercado', 'groceries', 'card', 'UYU', -2922.59, 0.95],
    [14, 'Automovil Club Uruguay', 'transport', 'card', 'UYU', -810.0, 0.72],
    [14, 'Colonia Express Super Fer', 'transport', 'card', 'USD', -12.0, 0.65, 'Colonia Express'],
    [15, 'Merpago Prohygiene', 'shopping', 'card', 'UYU', -1744.54, 0.5],
    [16, 'Farmashop Visa', 'healthcare', 'card', 'UYU', -972.9, 0.86, 'Farmashop'],
    [17, 'Merpago Tupase', 'transport', 'card', 'UYU', -920.0, 0.6, 'Tu Pase'],
    [18, 'TRANSFERENCIA RECIBIDA /GAZZANO DE MARCO FEDERICO', 'transfer', 'uyu', 'UYU', 2350.0, 0.88, 'Transferencia recibida'],
    [18, 'RETIRO CORRESPONSALES, MONTEVIDEO', 'fees', 'uyu', 'UYU', -1000.0, 0.6, 'Retiro corresponsales'],
    [20, 'Sueldo Empresa SA', 'income', 'uyu', 'UYU', 78500.0, 0.99, 'Sueldo'],
    [20, 'Pago Cliente Freelance', 'income', 'usd', 'USD', 1450.0, 0.95, 'Cliente freelance'],
    [22, 'CJPPU Aportes', 'fees', 'card', 'UYU', -13201.0, 0.7, 'Aportes CJPPU'],
    [24, 'Paypal Cloudflare', 'software', 'card', 'USD', -0.72, 0.5, 'Cloudflare'],
    [33, 'Sueldo Empresa SA', 'income', 'uyu', 'UYU', 78500.0, 0.99, 'Sueldo'],
    [34, 'Devoto Supermercado', 'groceries', 'card', 'UYU', -2104.3, 0.95],
    [36, 'Farmashop Visa', 'healthcare', 'card', 'UYU', -512.4, 0.86, 'Farmashop'],
    [38, 'Netflix.com', 'entertainment', 'card', 'USD', -15.99, 0.97, 'Netflix'],
    [40, 'UTE Pago Online', 'utilities', 'uyu', 'UYU', -3120.0, 0.9, 'UTE'],
    [42, 'OSE Pago Online', 'utilities', 'uyu', 'UYU', -890.0, 0.9, 'OSE'],
    [44, 'Tienda Inglesa', 'groceries', 'card', 'UYU', -3450.2, 0.92],
    [48, 'Pago Cliente Freelance', 'income', 'usd', 'USD', 1450.0, 0.95, 'Cliente freelance'],
    [52, 'Apple.com/bill', 'software', 'card', 'USD', -2.99, 0.95, 'iCloud'],
    [55, 'Geant Shopping', 'groceries', 'card', 'UYU', -2890.0, 0.9, 'Géant'],
    [58, 'Sueldo Empresa SA', 'income', 'uyu', 'UYU', 78500.0, 0.99, 'Sueldo'],
    [60, 'Cine Movie', 'entertainment', 'card', 'UYU', -640.0, 0.8, 'Movie Cinemas'],
    [62, 'Farmacia San Roque', 'healthcare', 'card', 'UYU', -980.0, 0.85],
    [64, 'Disco Supermercado', 'groceries', 'card', 'UYU', -1760.5, 0.93, 'Disco'],
    [66, 'Estacion Ancap', 'transport', 'card', 'UYU', -3200.0, 0.75, 'Ancap'],
    [70, 'Amazon Marketplace', 'shopping', 'card', 'USD', -64.2, 0.7, 'Amazon'],
  ];

  const MS_DAY = 86400000;
  const NEWEST = new Date('2026-02-04T12:00:00');

  const transactions = seed.map((s, i) => {
    const [off, desc, cat, account, currency, amount, conf, display] = s;
    const d = new Date(NEWEST.getTime() - off * MS_DAY);
    return {
      id: 'tx_' + i,
      date: d.toISOString(),
      description: desc,
      displayDescription: display || null,
      category: cat,
      account,
      currency,
      amount,
      type: amount < 0 ? 'debit' : 'credit',
      confidence: conf,
      tags: [],
    };
  });

  // account balances (display)
  const balances = {
    card: { UYU: -141120.52, USD: -2253.69, movements: 81 },
    usd: { USD: 356.35, movements: 31 },
    uyu: { UYU: 48230.0, movements: 24 },
  };

  window.TATU = {
    CATEGORIES,
    ACCOUNTS,
    transactions,
    balances,
    FX: { usdToUyu: 40.5 },
    convert(amount, from, to, rate) {
      rate = rate || 40.5;
      if (from === to) return amount;
      return from === 'USD' ? amount * rate : amount / rate;
    },
    fmtConv(amount, currency) {
      // compact converted figure, no decimals for large numbers
      const abs = Math.abs(amount);
      const num = abs.toLocaleString('es-UY', { maximumFractionDigits: abs < 100 ? 2 : 0 });
      const sym = currency === 'USD' ? 'US$' : '$U';
      return `${amount < 0 ? '−' : ''}${sym} ${num}`;
    },
    fmt(amount, currency) {
      const sign = amount < 0 ? '-' : '';
      const abs = Math.abs(amount);
      const num = abs.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sym = currency === 'USD' ? 'US$' : '$U';
      return `${sign}${sym} ${num}`;
    },
    fmtPlain(amount, currency) {
      const abs = Math.abs(amount);
      const num = abs.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const sym = currency === 'USD' ? 'US$' : '$U';
      return `${sym} ${num}`;
    },
    fmtDate(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },
    fmtDateLong(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' });
    },
    monthKey(iso) {
      const d = new Date(iso);
      return d.toLocaleDateString('es-UY', { month: 'short', year: 'numeric' });
    },
  };
})();
