/* Screen: Transacciones — unified filtering + period nav + totals + bulk actions + edit */
const { useState: useStateTx, useMemo: useMemoTx, useEffect: useEffectTx, useRef: useRefTx } = React;

function useClickOutside(ref, onOut) {
  useEffectTx(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
}

/* ---------- Period helpers ---------- */
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTHS_ES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function periodRange(period) {
  if (period.mode === 'month') {
    const from = new Date(period.y, period.m, 1);
    const to = new Date(period.y, period.m + 1, 0);
    return { from: isoDay(from), to: isoDay(to) };
  }
  if (period.mode === 'recent') {
    const to = period.anchor;
    const from = new Date(to.getFullYear(), to.getMonth() - (period.n - 1), 1);
    return { from: isoDay(from), to: isoDay(new Date(to.getFullYear(), to.getMonth() + 1, 0)) };
  }
  if (period.mode === 'range') return { from: period.from, to: period.to };
  return { from: '', to: '' }; // all
}

function periodLabel(period) {
  if (period.mode === 'month') return `${MONTHS_ES[period.m]} ${period.y}`;
  if (period.mode === 'recent') return `Últimos ${period.n} meses`;
  if (period.mode === 'all') return 'Todo el período';
  if (period.mode === 'range') {
    const f = period.from ? period.from.slice(8) + '/' + period.from.slice(5, 7) : '…';
    const t = period.to ? period.to.slice(8) + '/' + period.to.slice(5, 7) : '…';
    return `${f} → ${t}`;
  }
  return 'Período';
}

function MonthNav({ period, setPeriod, newest }) {
  const [open, setOpen] = useStateTx(false);
  const ref = useRefTx(null);
  useClickOutside(ref, () => setOpen(false));
  // year shown in the grid popover
  const anchorY = period.mode === 'month' ? period.y : newest.getFullYear();
  const anchorM = period.mode === 'month' ? period.m : newest.getMonth();
  const [gridYear, setGridYear] = useStateTx(anchorY);
  useEffectTx(() => { if (open) setGridYear(period.mode === 'month' ? period.y : newest.getFullYear()); }, [open]);

  const shift = (dir) => {
    const base = period.mode === 'month' ? { y: period.y, m: period.m } : { y: anchorY, m: anchorM };
    const d = new Date(base.y, base.m + dir, 1);
    setPeriod({ mode: 'month', y: d.getFullYear(), m: d.getMonth() });
  };
  const isMonthMode = period.mode === 'month';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} ref={ref}>
      <div style={{ display: 'inline-flex', alignItems: 'stretch', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <button className="btn btn-ghost" onClick={() => shift(-1)} title="Mes anterior" style={{ borderRadius: 0, width: 38, padding: 0 }}><Icon name="chevLeft" size={17} /></button>
        <button onClick={() => setOpen(!open)} style={{ border: 'none', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', background: open ? 'var(--surface-2)' : 'transparent', color: 'var(--text)', font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', minWidth: 168, justifyContent: 'center' }}>
          <Icon name="calendar" size={15} className="faint" />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{periodLabel(period)}</span>
          <Icon name="chevDown" size={14} className="faint" />
        </button>
        <button className="btn btn-ghost" onClick={() => shift(1)} title="Mes siguiente" style={{ borderRadius: 0, width: 38, padding: 0 }} disabled={isMonthMode && period.y === newest.getFullYear() && period.m >= newest.getMonth()}><Icon name="chevRight" size={17} /></button>
      </div>

      {open && (
        <div className="card" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 40, width: 300, padding: 14, boxShadow: 'var(--shadow-lg)' }}>
          {/* quick options */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: 'Este mes', val: { mode: 'month', y: newest.getFullYear(), m: newest.getMonth() } },
              { label: 'Últimos 3 meses', val: { mode: 'recent', n: 3, anchor: newest } },
              { label: 'Este año', val: { mode: 'range', from: `${newest.getFullYear()}-01-01`, to: isoDay(newest) } },
              { label: 'Todo', val: { mode: 'all' } },
            ].map((q) => (
              <button key={q.label} className="btn btn-sm" onClick={() => { setPeriod(q.val); setOpen(false); }} style={{ flex: '0 0 auto' }}>{q.label}</button>
            ))}
          </div>
          <div className="divider" style={{ margin: '0 -14px 12px' }}></div>
          {/* year nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => setGridYear(gridYear - 1)}><Icon name="chevLeft" size={15} /></button>
            <span className="mono" style={{ fontWeight: 600, fontSize: 14 }}>{gridYear}</span>
            <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => setGridYear(gridYear + 1)} disabled={gridYear >= newest.getFullYear()}><Icon name="chevRight" size={15} /></button>
          </div>
          {/* month grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {MONTHS_ES_SHORT.map((mo, i) => {
              const future = gridYear > newest.getFullYear() || (gridYear === newest.getFullYear() && i > newest.getMonth());
              const sel = period.mode === 'month' && period.y === gridYear && period.m === i;
              return (
                <button key={i} disabled={future} onClick={() => { setPeriod({ mode: 'month', y: gridYear, m: i }); setOpen(false); }}
                  className={'btn btn-sm' + (sel ? ' btn-primary' : '')}
                  style={{ padding: '8px 0', opacity: future ? 0.35 : 1, cursor: future ? 'not-allowed' : 'pointer' }}>{mo}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Totals strip ---------- */
function TotalTile({ label, value, sub, accent, icon }) {
  return (
    <div className="card" style={{ padding: '15px 16px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {icon && <span style={{ color: 'var(--text-faint)', display: 'grid', flexShrink: 0 }}><Icon name={icon} size={14} /></span>}
        <span className="stat-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      <div className="amt" style={{ fontSize: 22, fontWeight: 600, color: accent || 'var(--text)', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div className="faint" style={{ fontSize: 11.5 }}>{sub}</div>}
    </div>
  );
}

function TotalsStrip({ rows, homeCur, rate, ignoredCount }) {
  const T = window.TATU;
  const totals = useMemoTx(() => {
    let income = 0, expense = 0, n = 0;
    rows.forEach((t) => {
      if (t.category === 'transfer') return;
      const v = T.convert(t.amount, t.currency, homeCur, rate);
      if (v > 0) income += v; else expense += Math.abs(v);
      n++;
    });
    return { income, expense, net: income - expense, n };
  }, [rows, homeCur, rate]);
  const curWord = homeCur === 'USD' ? 'dólares' : 'pesos';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
      <TotalTile label="Ingresos" icon="trendUp" value={T.fmtConv(totals.income, homeCur)} sub={`${totals.n} movimientos contados`} accent="var(--pos)" />
      <TotalTile label="Gastos" icon="trendDown" value={T.fmtConv(totals.expense, homeCur)} sub={`Combinado en ${curWord}`} />
      <TotalTile label="Balance" icon="wallet" value={(totals.net >= 0 ? '+' : '−') + T.fmtConv(Math.abs(totals.net), homeCur)} sub="Ingresos − gastos" accent={totals.net >= 0 ? 'var(--pos)' : 'var(--neg)'} />
      <TotalTile label="Transferencias" icon="slash" value={String(ignoredCount)} sub={ignoredCount ? 'Ignoradas · no se cuentan' : 'Ninguna en el período'} />
    </div>
  );
}

/* ---------- Category quick-pick popover (used by bulk bar) ---------- */
function CategoryMenu({ onPick, onClose, anchorStyle }) {
  const T = window.TATU;
  const ref = useRefTx(null);
  useClickOutside(ref, onClose);
  return (
    <div className="card" ref={ref} style={{ position: 'absolute', zIndex: 60, padding: 6, width: 220, maxHeight: 300, overflowY: 'auto', boxShadow: 'var(--shadow-lg)', ...anchorStyle }}>
      {Object.entries(T.CATEGORIES).map(([id, m]) => (
        <button key={id} onClick={() => onPick(id, m.label)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 9px', border: 'none', background: 'transparent', borderRadius: 7, cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--text)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
          <span style={{ fontSize: 14 }}>{m.icon}</span>
          <span style={{ fontSize: 13.5 }}>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Floating bulk-action bar ---------- */
function BulkBar({ count, total, onSelectAll, onClear, onCategorize, onAuto, onIgnore, onDelete, toast }) {
  const [catOpen, setCatOpen] = useStateTx(false);
  return (
    <div style={{ position: 'fixed', bottom: 26, left: 'calc(50% + var(--sidebar-w) / 2)', transform: 'translateX(-50%)', zIndex: 70, animation: 'fadeUp 0.2s both' }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px 10px 16px', borderRadius: 999, boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-strong)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 999, background: 'var(--brand)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 700 }} className="mono">{count}</span>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>seleccionada{count > 1 ? 's' : ''}</span>
        </span>
        {count < total && (
          <button className="link" onClick={onSelectAll} style={{ fontSize: 12.5 }}>Seleccionar las {total}</button>
        )}
        <span style={{ width: 1, height: 22, background: 'var(--border)' }}></span>
        <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setCatOpen(!catOpen)}><Icon name="tag" size={14} /> Categorizar</button>
          {catOpen && <CategoryMenu onClose={() => setCatOpen(false)} onPick={(id, label) => { setCatOpen(false); onCategorize(label); }} anchorStyle={{ bottom: 'calc(100% + 10px)', left: 0 }} />}
          <button className="btn btn-sm btn-ghost" onClick={onAuto}><Icon name="sparkles" size={14} /> Auto</button>
          <button className="btn btn-sm btn-ghost" onClick={onIgnore}><Icon name="slash" size={14} /> Ignorar</button>
          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--neg)' }} onClick={onDelete}><Icon name="trash" size={14} /> Eliminar</button>
        </div>
        <span style={{ width: 1, height: 22, background: 'var(--border)' }}></span>
        <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30 }} onClick={onClear} title="Deseleccionar"><Icon name="x" size={16} /></button>
      </div>
    </div>
  );
}

function MultiSelect({ label, options, selected, onChange, icon }) {
  const [open, setOpen] = useStateTx(false);
  const ref = useRefTx(null);
  useClickOutside(ref, () => setOpen(false));
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} style={{ borderColor: selected.length ? 'var(--brand)' : 'var(--border)', color: selected.length ? 'var(--brand-text)' : 'var(--text)' }}>
        {icon && <Icon name={icon} size={15} />}
        {label}{selected.length > 0 && <span className="mono" style={{ fontSize: 11 }}>· {selected.length}</span>}
        <Icon name="chevDown" size={14} />
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, minWidth: 220, padding: 6, boxShadow: 'var(--shadow-lg)', maxHeight: 320, overflowY: 'auto' }}>
          {options.map((o) => (
            <button key={o.value} onClick={() => toggle(o.value)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 9px', border: 'none', background: 'transparent', borderRadius: 7, cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--text)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span className={'checkbox' + (selected.includes(o.value) ? ' on' : '')}>{selected.includes(o.value) && <Icon name="check" size={12} strokeWidth={3} />}</span>
              {o.color && <span className="dot" style={{ width: 8, height: 8, borderRadius: 3, background: o.color }}></span>}
              <span style={{ fontSize: 13.5 }}>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TxEditModal({ tx, onClose, onSave }) {
  const T = window.TATU;
  const [desc, setDesc] = useStateTx(tx.displayDescription || tx.description);
  const [cat, setCat] = useStateTx(tx.category);
  const [scope, setScope] = useStateTx('single');
  const catOpts = Object.entries(T.CATEGORIES);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 17 }}>Editar transacción</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10 }}>
            <div>
              <div className="faint" style={{ fontSize: 11 }}>Original · {T.fmtDate(tx.date)}</div>
              <div style={{ fontSize: 13, marginTop: 2 }}>{tx.description}</div>
            </div>
            <span className="amt" style={{ color: tx.amount > 0 ? 'var(--pos)' : 'var(--text)' }}>{tx.amount > 0 ? '+' : '−'}{T.fmtPlain(tx.amount, tx.currency)}</span>
          </div>
          <div>
            <label className="field-label">Nombre para mostrar</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Categoría</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {catOpts.map(([id, m]) => (
                <button key={id} onClick={() => setCat(id)} className="badge" style={{
                  cursor: 'pointer', padding: '5px 11px', fontSize: 12.5,
                  background: cat === id ? m.color + '24' : 'var(--surface-2)',
                  color: cat === id ? m.color : 'var(--text-muted)',
                  border: '1px solid ' + (cat === id ? m.color + '55' : 'transparent'),
                }}>
                  <span className="dot" style={{ background: m.color }}></span>{m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">Aplicar cambios a</label>
            <Segment value={scope} onChange={setScope} options={[
              { value: 'single', label: 'Solo esta' },
              { value: 'matching', label: 'Todas iguales' },
              { value: 'future', label: 'Futuras' },
            ]} />
            <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
              {scope === 'single' && 'El cambio afecta únicamente a esta transacción.'}
              {scope === 'matching' && 'Se aplica a todas las transacciones de "' + tx.description + '", pasadas y futuras.'}
              {scope === 'future' && 'Tatú recordará esta regla para próximos movimientos similares.'}
            </p>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(tx.id, { displayDescription: desc, category: cat, scope })}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 12;

function Transactions({ initialFilter, homeCur, rate, editingTx, setEditingTx, onSave, toast }) {
  const T = window.TATU;
  const newest = useMemoTx(() => new Date(Math.max(...T.transactions.map((t) => new Date(t.date).getTime()))), []);
  const deepLinked = !!(initialFilter && (initialFilter.categories || initialFilter.accounts || initialFilter.search));

  const [filter, setFilter] = useStateTx({ search: '', categories: [], accounts: [], currency: 'all', type: 'all', from: '', to: '', min: '', max: '', ...(initialFilter || {}) });
  const [period, setPeriod] = useStateTx(deepLinked ? { mode: 'all' } : { mode: 'month', y: newest.getFullYear(), m: newest.getMonth() });
  const [advanced, setAdvanced] = useStateTx(false);
  const [showIgnored, setShowIgnored] = useStateTx(false);
  const [selected, setSelected] = useStateTx([]);
  const [page, setPage] = useStateTx(1);

  useEffectTx(() => { if (initialFilter) setFilter((f) => ({ ...f, ...initialFilter })); }, [initialFilter]);

  // Period drives the date range used for filtering.
  const range = useMemoTx(() => periodRange(period), [period]);
  const effFilter = useMemoTx(() => ({ ...filter, from: range.from, to: range.to }), [filter, range]);

  const results = useMemoTx(() => SEL.applyFilters(T.transactions, effFilter), [effFilter]);
  const ignoredCount = useMemoTx(() => results.filter((t) => t.category === 'transfer').length, [results]);
  const visibleRows = useMemoTx(() => (showIgnored ? results : results.filter((t) => t.category !== 'transfer')), [results, showIgnored]);

  useEffectTx(() => { setPage(1); setSelected([]); }, [effFilter, showIgnored]);
  const pages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pageRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const set = (k, v) => setFilter((f) => ({ ...f, [k]: v }));
  const activeChips = [];
  filter.categories.forEach((c) => activeChips.push({ k: 'cat', v: c, label: T.CATEGORIES[c].label, clear: () => set('categories', filter.categories.filter((x) => x !== c)) }));
  filter.accounts.forEach((a) => activeChips.push({ k: 'acc', v: a, label: T.ACCOUNTS[a].short, clear: () => set('accounts', filter.accounts.filter((x) => x !== a)) }));
  if (filter.currency !== 'all') activeChips.push({ k: 'cur', label: filter.currency === 'USD' ? 'Dólares' : 'Pesos', clear: () => set('currency', 'all') });
  if (filter.type !== 'all') activeChips.push({ k: 'type', label: filter.type === 'income' ? 'Ingresos' : 'Gastos', clear: () => set('type', 'all') });
  if (filter.min || filter.max) activeChips.push({ k: 'amt', label: `Monto ${filter.min || '0'}–${filter.max || '∞'}`, clear: () => setFilter((f) => ({ ...f, min: '', max: '' })) });

  const clearAll = () => setFilter({ search: '', categories: [], accounts: [], currency: 'all', type: 'all', from: '', to: '', min: '', max: '' });
  const hasFilters = activeChips.length > 0 || filter.search;

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.includes(r.id));
  const toggleAll = () => setSelected(allOnPageSelected ? selected.filter((id) => !pageRows.find((r) => r.id === id)) : [...new Set([...selected, ...pageRows.map((r) => r.id)])]);
  const toggleOne = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectAllVisible = () => setSelected(visibleRows.map((r) => r.id));

  const catOptions = Object.entries(T.CATEGORIES).map(([value, m]) => ({ value, label: m.label, color: m.color }));
  const accOptions = Object.entries(T.ACCOUNTS).map(([value, m]) => ({ value, label: m.label }));

  return (
    <div className="view-anim">
      <div className="page-head">
        <div>
          <h1 className="page-title">Transacciones</h1>
          <p className="page-desc">{visibleRows.length} movimiento{visibleRows.length !== 1 ? 's' : ''}{hasFilters ? ' · filtrado' : ''} · {periodLabel(period)}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MonthNav period={period} setPeriod={setPeriod} newest={newest} />
          <button className="btn" onClick={() => toast('Exportando CSV de la vista filtrada…')}><Icon name="download" size={15} /> Exportar</button>
        </div>
      </div>

      {/* Totals for the current period + filters */}
      <TotalsStrip rows={results} homeCur={homeCur || 'USD'} rate={rate} ignoredCount={ignoredCount} />

      {/* Unified filter bar */}
      <div className="card card-pad" style={{ marginBottom: 16, padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrap" style={{ flex: '1 1 260px', minWidth: 200 }}>
            <Icon name="search" size={16} />
            <input className="input" placeholder="Buscar comercio o descripción…" value={filter.search} onChange={(e) => set('search', e.target.value)} />
          </div>
          <MultiSelect label="Categoría" icon="tag" options={catOptions} selected={filter.categories} onChange={(v) => set('categories', v)} />
          <MultiSelect label="Cuenta" icon="wallet" options={accOptions} selected={filter.accounts} onChange={(v) => set('accounts', v)} />
          <Segment value={filter.type} onChange={(v) => set('type', v)} options={[{ value: 'all', label: 'Todos' }, { value: 'income', label: 'Ingresos' }, { value: 'expense', label: 'Gastos' }]} />
          <Segment value={filter.currency} onChange={(v) => set('currency', v)} options={[{ value: 'all', label: 'Todo' }, { value: 'UYU', label: '$U' }, { value: 'USD', label: 'US$' }]} />
          <button className={'btn' + (advanced ? ' btn-primary' : '')} onClick={() => setAdvanced(!advanced)}><Icon name="filter" size={15} /> Monto</button>
        </div>

        {advanced && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div><label className="field-label">Monto mínimo</label><input type="number" className="input" placeholder="0" value={filter.min} onChange={(e) => set('min', e.target.value)} /></div>
            <div><label className="field-label">Monto máximo</label><input type="number" className="input" placeholder="∞" value={filter.max} onChange={(e) => set('max', e.target.value)} /></div>
          </div>
        )}

        {(activeChips.length > 0) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
            {activeChips.map((c, i) => (
              <span key={i} className="chip">{c.label}<button onClick={c.clear}><Icon name="x" size={13} /></button></span>
            ))}
            <button className="link" onClick={clearAll} style={{ marginLeft: 4 }}>Limpiar todo</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Toolbar: select info + ignored-transfers toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
          <span className="faint" style={{ fontSize: 13 }}>
            {selected.length > 0 ? `${selected.length} de ${visibleRows.length} seleccionada${selected.length > 1 ? 's' : ''}` : `${visibleRows.length} movimiento${visibleRows.length !== 1 ? 's' : ''} en la vista`}
          </span>
          <button
            onClick={() => setShowIgnored(!showIgnored)}
            className="btn btn-sm"
            title="Las transferencias se ignoran de los totales"
            style={{ gap: 8, borderColor: showIgnored ? 'var(--brand)' : 'var(--border)', color: showIgnored ? 'var(--brand-text)' : 'var(--text-muted)' }}
            disabled={ignoredCount === 0}
          >
            <Icon name={showIgnored ? 'eye' : 'eyeOff'} size={15} />
            {showIgnored ? 'Ocultar' : 'Mostrar'} transferencias ignoradas
            {ignoredCount > 0 && <span className="mono" style={{ fontSize: 11 }}>· {ignoredCount}</span>}
          </button>
        </div>

        {visibleRows.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Sin resultados</div>
            <p className="muted" style={{ fontSize: 13.5 }}>Probá con otro mes o ajustá los filtros.</p>
            <button className="btn btn-sm" style={{ marginTop: 14 }} onClick={clearAll}>Limpiar filtros</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36, paddingLeft: 18 }}><span className={'checkbox' + (allOnPageSelected ? ' on' : '')} onClick={toggleAll}>{allOnPageSelected && <Icon name="check" size={12} strokeWidth={3} />}</span></th>
                  <th style={{ width: 92 }}>Fecha</th>
                  <th>Descripción</th>
                  <th style={{ width: 168 }}>Categoría</th>
                  <th style={{ width: 96 }}>Cuenta</th>
                  <th style={{ width: 56, textAlign: 'center' }}>Conf.</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Monto</th>
                  <th style={{ width: 78 }}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const meta = T.CATEGORIES[t.category];
                  const sel = selected.includes(t.id);
                  const ignored = t.category === 'transfer';
                  return (
                    <tr key={t.id} className={sel ? 'sel' : ''} style={ignored ? { opacity: 0.62 } : null}>
                      <td style={{ paddingLeft: 18 }}><span className={'checkbox' + (sel ? ' on' : '')} onClick={() => toggleOne(t.id)}>{sel && <Icon name="check" size={12} strokeWidth={3} />}</span></td>
                      <td><span className="mono faint" style={{ fontSize: 12 }}>{T.fmtDate(t.date)}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 30, height: 30, borderRadius: 8, background: meta.color + '1f', color: meta.color, display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>{meta.icon}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320, display: 'flex', alignItems: 'center', gap: 7 }}>
                              {t.displayDescription || t.description}
                              {ignored && <span className="tag" style={{ flexShrink: 0 }}><Icon name="slash" size={10} /> Ignorada</span>}
                            </div>
                            {t.displayDescription && <div className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{t.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td><CategoryBadge cat={t.category} /></td>
                      <td><span className="faint" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}><AccountIcon kind={T.ACCOUNTS[t.account].icon} size={14} />{T.ACCOUNTS[t.account].short}</span></td>
                      <td style={{ textAlign: 'center' }}><ConfidenceDot value={t.confidence} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="amt" style={{ color: t.amount > 0 ? 'var(--pos)' : 'var(--text)', fontSize: 13.5 }}>{t.amount > 0 ? '+' : '−'}{T.fmtPlain(t.amount, t.currency)}</span>
                        {homeCur && t.currency !== homeCur && <div className="amt faint" style={{ fontSize: 10.5, marginTop: 1 }}>≈ {T.fmtConv(T.convert(t.amount, t.currency, homeCur, rate), homeCur)}</div>}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30, padding: 6 }} onClick={() => setEditingTx(t)}><Icon name="pencil" size={15} /></button>
                          <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30, padding: 6, color: 'var(--text-faint)' }} onClick={() => toast('Transacción eliminada')}><Icon name="trash" size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {visibleRows.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span className="faint" style={{ fontSize: 13 }}>Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visibleRows.length)} de {visibleRows.length}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)} style={{ opacity: page === 1 ? 0.5 : 1 }}>Anterior</button>
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} className={'btn btn-sm' + (page === i + 1 ? ' btn-primary' : '')} onClick={() => setPage(i + 1)} style={{ width: 34 }}>{i + 1}</button>
            ))}
            <button className="btn btn-sm" disabled={page === pages} onClick={() => setPage(page + 1)} style={{ opacity: page === pages ? 0.5 : 1 }}>Siguiente</button>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <BulkBar
          count={selected.length}
          total={visibleRows.length}
          onSelectAll={selectAllVisible}
          onClear={() => setSelected([])}
          onCategorize={(label) => { toast(`${selected.length} movimientos → ${label}`); setSelected([]); }}
          onAuto={() => { toast(`${selected.length} transacciones auto-categorizadas`); setSelected([]); }}
          onIgnore={() => { toast(`${selected.length} marcadas como ignoradas`); setSelected([]); }}
          onDelete={() => { toast(`${selected.length} eliminadas`); setSelected([]); }}
          toast={toast}
        />
      )}

      {editingTx && <TxEditModal tx={editingTx} onClose={() => setEditingTx(null)} onSave={onSave} />}
    </div>
  );
}

window.Transactions = Transactions;
window.TxEditModal = TxEditModal;
