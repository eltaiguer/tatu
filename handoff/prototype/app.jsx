/* App shell: routing, theme, toasts, import overlay */
const { useState: useStateApp, useEffect: useEffectApp, useCallback } = React;

function Toasts({ items }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {items.map((t) => (
        <div key={t.id} className="card" style={{ padding: '11px 18px', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp 0.22s both', fontSize: 13.5, fontWeight: 500 }}>
          <span style={{ width: 18, height: 18, borderRadius: 999, background: 'var(--pos)', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="check" size={12} strokeWidth={3} /></span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [view, setView] = useStateApp('overview');
  const [theme, setThemeState] = useStateApp(() => localStorage.getItem('tatu-redesign-theme') || 'light');
  const [homeCur, setHomeCur] = useStateApp('USD');
  const [rate, setRate] = useStateApp(40.5);
  const [importOpen, setImportOpen] = useStateApp(false);
  const [txFilter, setTxFilter] = useStateApp(null);
  const [editingTx, setEditingTx] = useStateApp(null);
  const [toasts, setToasts] = useStateApp([]);

  useEffectApp(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('tatu-redesign-theme', theme);
  }, [theme]);

  const toast = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const goTransactions = useCallback((filter) => {
    setTxFilter({ ...(filter || {}), _t: Date.now() });
    setView('transactions');
  }, []);

  const saveTx = useCallback((id, updates) => {
    const T = window.TATU;
    const tx = T.transactions.find((x) => x.id === id);
    if (tx) {
      tx.displayDescription = updates.displayDescription;
      tx.category = updates.category;
      tx.confidence = 1;
    }
    setEditingTx(null);
    toast(updates.scope === 'single' ? 'Transacción actualizada' : 'Cambios aplicados con regla');
  }, [toast]);

  const counts = { transactions: window.TATU.transactions.length };

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} onImport={() => setImportOpen(true)} counts={counts} />
      <main className="main">
        <div className="page">
          {view === 'overview' && <Home homeCur={homeCur} setHomeCur={setHomeCur} rate={rate} setRate={setRate} goTransactions={goTransactions} openTx={setEditingTx} />}
          {view === 'transactions' && <Transactions initialFilter={txFilter} homeCur={homeCur} rate={rate} editingTx={editingTx} setEditingTx={setEditingTx} onSave={saveTx} toast={toast} />}
          {view === 'categories' && <Categories toast={toast} />}
          {view === 'settings' && <Settings theme={theme} setTheme={setThemeState} homeCur={homeCur} setHomeCur={setHomeCur} rate={rate} setRate={setRate} toast={toast} onImport={() => setImportOpen(true)} />}
        </div>
      </main>

      {/* floating theme toggle */}
      <button
        className="btn btn-icon"
        onClick={() => setThemeState(theme === 'dark' ? 'light' : 'dark')}
        title="Cambiar tema"
        style={{ position: 'fixed', bottom: 22, right: 22, zIndex: 60, width: 42, height: 42, borderRadius: 999, boxShadow: 'var(--shadow-md)', background: 'var(--surface)' }}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </button>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} toast={toast} />}
      {/* shared edit modal also opens from overview/recent (when not on tx screen) */}
      {editingTx && view !== 'transactions' && <TxEditModal tx={editingTx} onClose={() => setEditingTx(null)} onSave={saveTx} />}
      <Toasts items={toasts} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
