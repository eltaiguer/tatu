/* Screen: Análisis */
const { useState: useStateAn, useMemo: useMemoAn } = React;

function StatTile({ label, value, sub, accent }) {
  return (
    <div className="card card-pad" style={{ padding: 18 }}>
      <div className="stat-label">{label}</div>
      <div className="amt" style={{ fontSize: 23, fontWeight: 600, marginTop: 6, color: accent || 'var(--text)' }}>{value}</div>
      {sub && <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Analysis({ homeCur, setHomeCur, rate, setRate, goTransactions }) {
  const T = window.TATU;
  const cur = homeCur;
  const breakdown = useMemoAn(() => SEL.categoryBreakdown(T.transactions, cur, rate), [cur, rate]);
  const trend = useMemoAn(() => SEL.monthlyTrend(T.transactions, cur, rate), [cur, rate]);
  const split = useMemoAn(() => SEL.currencySplit(T.transactions, cur, rate), [cur, rate]);

  const donutData = breakdown.rows.slice(0, 7).map((r) => ({ label: r.label, value: r.value, color: r.color }));
  const otherVal = breakdown.rows.slice(7).reduce((s, r) => s + r.value, 0);
  if (otherVal > 0) donutData.push({ label: 'Otros', value: otherVal, color: 'var(--text-faint)' });

  const topMerchants = useMemoAn(() => {
    const map = {};
    T.transactions.filter((t) => t.amount < 0).forEach((t) => {
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

  return (
    <div className="view-anim">
      <div className="page-head">
        <div>
          <h1 className="page-title">Análisis</h1>
          <p className="page-desc">Todo combinado en {cur === 'USD' ? 'dólares' : 'pesos'} · ingresos y gastos en ambas monedas</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FxChip rate={rate} setRate={setRate} />
          <Segment value={homeCur} onChange={setHomeCur} options={[{ value: 'USD', label: 'US$' }, { value: 'UYU', label: '$U' }]} />
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <StatTile label="Mayor categoría" value={breakdown.rows[0] ? breakdown.rows[0].label : '—'} sub={breakdown.rows[0] ? Math.round(breakdown.rows[0].pct) + '% del gasto' : ''} />
        <StatTile label="Gasto promedio mensual" value={T.fmtConv(avgMonthly, cur)} sub={`Últimos ${trend.length} meses`} />
        <StatTile label="Tasa de ahorro" value={savingsRate + '%'} sub="Ingresos no gastados" accent={savingsRate >= 0 ? 'var(--pos)' : 'var(--neg)'} />
        <StatTile label="Categorías activas" value={String(breakdown.rows.length)} sub="Con gasto registrado" />
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

      {/* Currency split — where the spending actually happens */}
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

      {/* Donut + breakdown */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginBottom: 20 }}>Gasto por categoría</h2>
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

      {/* Top merchants */}
      <div className="card card-pad">
        <h2 className="section-title" style={{ marginBottom: 18 }}>Mayores comercios</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 36px' }}>
          {topMerchants.map((m, i) => {
            const meta = T.CATEGORIES[m.cat];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="faint mono" style={{ fontSize: 12, width: 16 }}>{i + 1}</span>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: meta.color + '1f', color: meta.color, display: 'grid', placeItems: 'center', fontSize: 14 }}>{meta.icon}</span>
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
  );
}

window.Analysis = Analysis;
