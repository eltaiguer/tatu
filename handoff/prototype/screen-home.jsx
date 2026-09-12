/* Screen: Resumen — merged home + análisis.
   Top of page = glanceable (accounts, este mes); below a divider = depth
   (KPIs, ahorro, categorías, monedas, tendencia, comercios). */
const { useMemo: useMemoHome } = React;

function HomeAccountCard({ acctId, homeCur, stat }) {
  const T = window.TATU;
  const acct = T.ACCOUNTS[acctId];
  const isCard = acctId === 'card';
  const mixed = stat.USD > 0 && stat.UYU > 0;
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', color: 'var(--brand)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <AccountIcon kind={acct.icon} size={18} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acct.label}</div>
          <div className="faint" style={{ fontSize: 12 }}>{acct.sub} ·· {acct.last4}</div>
        </div>
      </div>
      <div>
        <div className="faint" style={{ fontSize: 12, fontWeight: 500 }}>Gastos del período</div>
        <div className="amt" style={{ fontSize: 23, marginTop: 4, color: 'var(--text)' }}>{T.fmtPlain(stat.conv, homeCur)}</div>
        {mixed && (
          <div className="amt faint" style={{ fontSize: 12, marginTop: 3 }}>US$ {Math.round(stat.USD).toLocaleString('es-UY')} · $U {Math.round(stat.UYU).toLocaleString('es-UY')}</div>
        )}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <div className="bar-track" style={{ marginBottom: 7 }}><div className="bar-fill" style={{ width: stat.pct + '%', background: 'var(--brand)' }}></div></div>
        <div className="faint" style={{ fontSize: 11.5, display: 'flex', justifyContent: 'space-between' }}>
          <span>{stat.count} movimientos</span>
          <span className="mono">{Math.round(stat.pct)}% del gasto</span>
        </div>
      </div>
    </div>
  );
}

function HomeStatTile({ label, value, sub, accent }) {
  return (
    <div className="card card-pad" style={{ padding: 18 }}>
      <div className="stat-label">{label}</div>
      <div className="amt" style={{ fontSize: 23, fontWeight: 600, marginTop: 6, color: accent || 'var(--text)' }}>{value}</div>
      {sub && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionDivider({ label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, margin: '34px 0 18px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</h2>
      {sub && <span className="faint" style={{ fontSize: 12.5 }}>{sub}</span>}
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }}></span>
    </div>
  );
}

function Home({ homeCur, setHomeCur, rate, setRate, goTransactions, openTx }) {
  const T = window.TATU;
  const txs = T.transactions;
  const cur = homeCur;

  const summary = useMemoHome(() => SEL.monthSummary(txs, cur, rate), [cur, rate]);
  const breakdown = useMemoHome(() => SEL.categoryBreakdown(txs, cur, rate), [cur, rate]);
  const trend = useMemoHome(() => SEL.monthlyTrend(txs, cur, rate), [cur, rate]);
  const split = useMemoHome(() => SEL.currencySplit(txs, cur, rate), [cur, rate]);
  const recent = useMemoHome(() => txs.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6), []);
  const acctSpend = useMemoHome(() => {
    const map = {};
    ['card', 'usd', 'uyu'].forEach((id) => { map[id] = { conv: 0, USD: 0, UYU: 0, count: 0 }; });
    txs.filter((t) => t.amount < 0 && t.category !== 'transfer').forEach((t) => {
      const a = map[t.account];
      if (!a) return;
      a.conv += Math.abs(T.convert(t.amount, t.currency, cur, rate));
      a[t.currency] += Math.abs(t.amount);
      a.count++;
    });
    const total = Object.values(map).reduce((s, a) => s + a.conv, 0) || 1;
    Object.values(map).forEach((a) => { a.pct = (a.conv / total) * 100; });
    return map;
  }, [cur, rate]);
  const incomeBars = trend.map((t) => t.income);
  const splitNote = `US$ ${Math.round(summary.split.USD).toLocaleString('es-UY')} + $U ${Math.round(summary.split.UYU).toLocaleString('es-UY')}`;

  const donutData = breakdown.rows.slice(0, 7).map((r) => ({ label: r.label, value: r.value, color: r.color }));
  const otherVal = breakdown.rows.slice(7).reduce((s, r) => s + r.value, 0);
  if (otherVal > 0) donutData.push({ label: 'Otros', value: otherVal, color: 'var(--text-faint)' });

  const topMerchants = useMemoHome(() => {
    const map = {};
    txs.filter((t) => t.amount < 0).forEach((t) => {
      const key = t.displayDescription || t.description;
      if (!map[key]) map[key] = { name: key, total: 0, count: 0, cat: t.category };
      map[key].total += Math.abs(T.convert(t.amount, t.currency, cur, rate));
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [cur, rate]);

  const totalIncome = trend.reduce((s, m) => s + m.income, 0);
  const totalExpense = trend.reduce((s, m) => s + m.expense, 0);
  const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
  const avgMonthly = Math.round(totalExpense / Math.max(trend.length, 1));
  const nets = trend.map((m) => ({ label: m.label, net: m.income - m.expense }));
  const avgNet = Math.round(nets.reduce((s, m) => s + m.net, 0) / Math.max(nets.length, 1));
  const positiveMonths = nets.filter((m) => m.net >= 0).length;
  const saving = avgNet >= 0;

  const curWord = cur === 'USD' ? 'dólares' : 'pesos';

  return (
    <div className="view-anim">
      <div className="page-head">
        <div>
          <h1 className="page-title">Hola, José 👋</h1>
          <p className="page-desc">Tus cuentas Santander de un vistazo · {summary.monthLabel}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FxChip rate={rate} setRate={setRate} />
          <Segment value={homeCur} onChange={setHomeCur} options={[{ value: 'USD', label: 'US$' }, { value: 'UYU', label: '$U' }]} />
        </div>
      </div>

      {/* Account cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <HomeAccountCard acctId="card" homeCur={homeCur} stat={acctSpend.card} />
        <HomeAccountCard acctId="usd" homeCur={homeCur} stat={acctSpend.usd} />
        <HomeAccountCard acctId="uyu" homeCur={homeCur} stat={acctSpend.uyu} />
      </div>

      {/* This month — combined into home currency */}
      <div className="card card-pad">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 className="section-title">Este mes, todo en {curWord}</h2>
        </div>
        <p className="faint" style={{ fontSize: 12, marginBottom: 18 }}>Combina tus movimientos en US$ y $U usando el tipo de cambio.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
          <div>
            <div className="stat-label">Ingresos</div>
            <div className="stat-value amt-pos">{T.fmtPlain(summary.income, cur)}</div>
            <div style={{ marginTop: 12 }}><MiniBars values={incomeBars} color="var(--pos)" /></div>
          </div>
          <div>
            <div className="stat-label">Gastos</div>
            <div className="stat-value" style={{ color: 'var(--text)' }}>{T.fmtPlain(summary.expense, cur)}</div>
            <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>{splitNote}</div>
          </div>
          <div>
            <div className="stat-label">Balance neto</div>
            <div className="stat-value" style={{ color: summary.net >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
              {summary.net >= 0 ? '+' : '−'}{T.fmtPlain(summary.net, cur)}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>{summary.count} transacciones registradas</div>
          </div>
        </div>
      </div>

      {/* ——— transition into deeper analysis ——— */}
      <SectionDivider label="Análisis" sub={`Tendencias y patrones · combinado en ${curWord}`} />

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <HomeStatTile label="Mayor categoría" value={breakdown.rows[0] ? breakdown.rows[0].label : '—'} sub={breakdown.rows[0] ? Math.round(breakdown.rows[0].pct) + '% del gasto' : ''} />
        <HomeStatTile label="Gasto promedio mensual" value={T.fmtConv(avgMonthly, cur)} sub={`Últimos ${trend.length} meses`} />
        <HomeStatTile label="Tasa de ahorro" value={savingsRate + '%'} sub="Ingresos no gastados" accent={savingsRate >= 0 ? 'var(--pos)' : 'var(--neg)'} />
        <HomeStatTile label="Categorías activas" value={String(breakdown.rows.length)} sub="Con gasto registrado" />
      </div>

      {/* Am I saving? — monthly net cashflow */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '258px 1fr', gap: 32, alignItems: 'center' }}>
          <div>
            <h2 className="section-title" style={{ marginBottom: 10 }}>¿Estás ahorrando?</h2>
            <div className="faint" style={{ fontSize: 12, fontWeight: 500 }}>Promedio mensual (ingresos − gastos)</div>
            <div className="amt" style={{ fontSize: 30, fontWeight: 600, marginTop: 4, color: saving ? 'var(--pos)' : 'var(--neg)' }}>
              {saving ? '+' : '−'}{T.fmtConv(avgNet, cur)}
            </div>
            <p style={{ fontSize: 13.5, marginTop: 12, lineHeight: 1.5 }}>
              {saving
                ? <>Te queda dinero la mayoría de los meses. Ahorrás <strong>{T.fmtConv(avgNet, cur)}</strong> por mes en promedio.</>
                : <>Estás gastando más de lo que ingresás. En promedio te faltan <strong>{T.fmtConv(avgNet, cur)}</strong> por mes.</>}
            </p>
            <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>{positiveMonths} de {nets.length} meses en positivo</div>
          </div>
          <NetBars series={nets} fmt={(v) => T.fmtConv(v, cur)} />
        </div>
      </div>

      {/* Donut + breakdown (replaces the old overview top-5 list) */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
          <h2 className="section-title">Gasto por categoría</h2>
          <span className="link" onClick={() => goTransactions({})}>Ver movimientos <Icon name="arrowRight" size={14} /></span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 36, alignItems: 'center' }}>
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <Donut data={donutData} centerLabel="Total" centerValue={T.fmtConv(breakdown.total, cur)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {breakdown.rows.slice(0, 7).map((r) => (
              <div key={r.cat} style={{ cursor: 'pointer' }} onClick={() => goTransactions({ categories: [r.cat] })}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 500 }}>
                    <span style={{ fontSize: 14 }}>{r.icon}</span>{r.label}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline' }}>
                    <span className="amt" style={{ fontSize: 13 }}>{T.fmtConv(r.value, cur)}</span>
                    <span className="faint mono" style={{ fontSize: 11.5, width: 38, textAlign: 'right' }}>{r.pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: r.pct + '%', background: r.color }}></div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Currency split */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h2 className="section-title">Gasto por moneda</h2>
          <span className="faint" style={{ fontSize: 12.5 }}>Total {T.fmtConv(split.total, cur)}</span>
        </div>
        <SplitBar pctUSD={split.pctUSD} pctUYU={split.pctUYU} />
        <div style={{ display: 'flex', gap: 32, marginTop: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--brand)', flexShrink: 0 }}></span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Dólares · {Math.round(split.pctUSD)}%</div>
              <div className="faint mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{T.fmtConv(split.USD, cur)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent)', flexShrink: 0 }}></span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Pesos · {Math.round(split.pctUYU)}%</div>
              <div className="faint mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{T.fmtConv(split.UYU, cur)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Trend */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 className="section-title">Ingresos vs Gastos</h2>
          <div style={{ display: 'flex', gap: 18 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}><span style={{ width: 12, height: 3, borderRadius: 2, background: 'var(--pos)' }}></span>Ingresos</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}><span style={{ width: 12, height: 3, borderRadius: 2, background: 'var(--neg)' }}></span>Gastos</span>
          </div>
        </div>
        <TrendChart series={trend} />
      </div>

      {/* Recent movements + top merchants */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="section-title">Movimientos recientes</h2>
            <span className="link" onClick={() => goTransactions({})}>Ver todos <Icon name="arrowRight" size={14} /></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.map((t) => {
              const meta = T.CATEGORIES[t.category];
              const showConv = t.currency !== cur;
              return (
                <div key={t.id} onClick={() => openTx(t)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: meta.color + '1f', color: meta.color, display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.displayDescription || t.description}</div>
                    <div className="faint" style={{ fontSize: 11.5 }}>{T.fmtDate(t.date)} · {T.ACCOUNTS[t.account].short}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="amt" style={{ fontSize: 13.5, color: t.amount > 0 ? 'var(--pos)' : 'var(--text)' }}>
                      {t.amount > 0 ? '+' : '−'}{T.fmtPlain(t.amount, t.currency)}
                    </div>
                    {showConv && <div className="amt faint" style={{ fontSize: 10.5, marginTop: 1 }}>≈ {T.fmtConv(T.convert(t.amount, t.currency, cur, rate), cur)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card card-pad">
          <h2 className="section-title" style={{ marginBottom: 14 }}>Mayores comercios</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {topMerchants.map((m, i) => {
              const meta = T.CATEGORIES[m.cat];
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="faint mono" style={{ fontSize: 12, width: 16 }}>{i + 1}</span>
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: meta.color + '1f', color: meta.color, display: 'grid', placeItems: 'center', fontSize: 15, flexShrink: 0 }}>{meta.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                    <div className="faint" style={{ fontSize: 11.5 }}>{m.count} {m.count > 1 ? 'movimientos' : 'movimiento'}</div>
                  </div>
                  <span className="amt" style={{ fontSize: 13 }}>{T.fmtConv(m.total, cur)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

window.Home = Home;
