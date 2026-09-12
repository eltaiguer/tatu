/* Screen: Resumen (overview) — converted/combined into a home currency */
const { useState: useStateOv, useMemo: useMemoOv } = React;

function AccountCard({ acctId, homeCur, rate }) {
  const T = window.TATU;
  const acct = T.ACCOUNTS[acctId];
  const bal = T.balances[acctId];
  const isCard = acctId === 'card';
  // converted total for this account into home currency
  const conv = isCard
    ? T.convert(bal.UYU, 'UYU', homeCur, rate) + T.convert(bal.USD, 'USD', homeCur, rate)
    : T.convert(acctId === 'usd' ? bal.USD : bal.UYU, acctId === 'usd' ? 'USD' : 'UYU', homeCur, rate);
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
        <div className="faint" style={{ fontSize: 12, fontWeight: 500 }}>{isCard ? 'Consumo del período' : 'Saldo disponible'}</div>
        {isCard ? (
          <div style={{ marginTop: 4 }}>
            <div className="amt" style={{ fontSize: 21, color: 'var(--neg)' }}>{T.fmtPlain(bal.UYU, 'UYU')}</div>
            <div className="amt faint" style={{ fontSize: 13.5, marginTop: 2 }}>{T.fmtPlain(bal.USD, 'USD')}</div>
          </div>
        ) : (
          <div className="amt" style={{ fontSize: 23, marginTop: 4, color: conv >= 0 ? 'var(--text)' : 'var(--neg)' }}>
            {acctId === 'usd' ? T.fmtPlain(bal.USD, 'USD') : T.fmtPlain(bal.UYU, 'UYU')}
          </div>
        )}
      </div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{bal.movements} movimientos</span>
        <span className="mono">≈ {T.fmtConv(conv, homeCur)}</span>
      </div>
    </div>
  );
}

function Overview({ homeCur, setHomeCur, rate, setRate, goTransactions, goAnalysis, openTx }) {
  const T = window.TATU;
  const txs = T.transactions;
  const summary = useMemoOv(() => SEL.monthSummary(txs, homeCur, rate), [homeCur, rate]);
  const breakdown = useMemoOv(() => SEL.categoryBreakdown(txs, homeCur, rate), [homeCur, rate]);
  const recent = useMemoOv(() => txs.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6), []);
  const trend = useMemoOv(() => SEL.monthlyTrend(txs, homeCur, rate), [homeCur, rate]);
  const expenseBars = trend.map((t) => t.expense);
  const incomeBars = trend.map((t) => t.income);
  const splitNote = `US$ ${Math.round(summary.split.USD).toLocaleString('es-UY')} + $U ${Math.round(summary.split.UYU).toLocaleString('es-UY')}`;

  return (
    <div className="view-anim">
      <div className="page-head">
        <div>
          <h1 className="page-title">Hola, José 👋</h1>
          <p className="page-desc">Esto es lo que pasó en tus cuentas Santander · {summary.monthLabel}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FxChip rate={rate} setRate={setRate} />
          <Segment value={homeCur} onChange={setHomeCur} options={[{ value: 'USD', label: 'US$' }, { value: 'UYU', label: '$U' }]} />
        </div>
      </div>

      {/* Account cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <AccountCard acctId="card" homeCur={homeCur} rate={rate} />
        <AccountCard acctId="usd" homeCur={homeCur} rate={rate} />
        <AccountCard acctId="uyu" homeCur={homeCur} rate={rate} />
      </div>

      {/* This month — combined into home currency */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 className="section-title">Este mes, todo en {homeCur === 'USD' ? 'dólares' : 'pesos'}</h2>
          <span className="link" onClick={goAnalysis}>Ver análisis completo <Icon name="arrowRight" size={14} /></span>
        </div>
        <p className="faint" style={{ fontSize: 12, marginBottom: 18 }}>Combina tus movimientos en US$ y $U usando el tipo de cambio.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
          <div>
            <div className="stat-label">Ingresos</div>
            <div className="stat-value amt-pos">{T.fmtPlain(summary.income, homeCur)}</div>
            <div style={{ marginTop: 12 }}><MiniBars values={incomeBars} color="var(--pos)" /></div>
          </div>
          <div>
            <div className="stat-label">Gastos</div>
            <div className="stat-value" style={{ color: 'var(--neg)' }}>{T.fmtPlain(summary.expense, homeCur)}</div>
            <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>{splitNote}</div>
          </div>
          <div>
            <div className="stat-label">Balance neto</div>
            <div className="stat-value" style={{ color: summary.net >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
              {summary.net >= 0 ? '+' : '−'}{T.fmtPlain(summary.net, homeCur)}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>{summary.count} transacciones registradas</div>
          </div>
        </div>
      </div>

      {/* Two columns: top categories + recent */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 16 }}>
        {/* Top categories */}
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 className="section-title">Gasto por categoría</h2>
            <span className="link" onClick={goAnalysis}>Detalle</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {breakdown.rows.slice(0, 5).map((r) => (
              <div key={r.cat} style={{ cursor: 'pointer' }} onClick={() => goTransactions({ categories: [r.cat] })}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 500 }}>
                    <span className="dot" style={{ width: 9, height: 9, borderRadius: 3, background: r.color }}></span>
                    {r.label}
                  </span>
                  <span className="amt" style={{ fontSize: 13 }}>{T.fmtConv(r.value, homeCur)}</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: r.pct + '%', background: r.color }}></div></div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="section-title">Movimientos recientes</h2>
            <span className="link" onClick={() => goTransactions({})}>Ver todos <Icon name="arrowRight" size={14} /></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.map((t) => {
              const meta = T.CATEGORIES[t.category];
              const showConv = t.currency !== homeCur;
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
                    {showConv && <div className="amt faint" style={{ fontSize: 10.5, marginTop: 1 }}>≈ {T.fmtConv(T.convert(t.amount, t.currency, homeCur, rate), homeCur)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

window.Overview = Overview;
