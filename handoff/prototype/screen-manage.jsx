/* Screens: Categorías y reglas · Configuración · Importar (overlay) */
const { useState: useStateMg, useMemo: useMemoMg } = React;

/* ---------------- Categorías y reglas ---------------- */
function Categories({ toast }) {
  const T = window.TATU;
  const counts = useMemoMg(() => {
    const m = {};
    T.transactions.forEach((t) => (m[t.category] = (m[t.category] || 0) + 1));
    return m;
  }, []);
  const [rules, setRules] = useStateMg([
    { id: 1, pattern: 'devoto', match: 'contiene', cat: 'groceries' },
    { id: 2, pattern: 'pedidosya', match: 'contiene', cat: 'restaurants' },
    { id: 3, pattern: 'jetbrains', match: 'contiene', cat: 'software' },
    { id: 4, pattern: 'hospital britanico', match: 'contiene', cat: 'healthcare' },
    { id: 5, pattern: 'antel', match: 'empieza con', cat: 'utilities' },
  ]);
  const [form, setForm] = useStateMg({ pattern: '', match: 'contiene', cat: 'groceries' });

  const cats = Object.entries(T.CATEGORIES).filter(([id]) => id !== 'uncategorized');

  const addRule = () => {
    if (!form.pattern.trim()) return;
    setRules([{ id: Date.now(), ...form }, ...rules]);
    setForm({ pattern: '', match: 'contiene', cat: 'groceries' });
    toast('Regla creada');
  };

  return (
    <div className="view-anim">
      <div className="page-head">
        <div>
          <h1 className="page-title">Categorías y reglas</h1>
          <p className="page-desc">Personalizá cómo Tatú clasifica tus movimientos</p>
        </div>
        <button className="btn btn-primary" onClick={() => toast('Nueva categoría')}><Icon name="plus" size={15} /> Nueva categoría</button>
      </div>

      {/* Categories grid */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginBottom: 16 }}>Tus categorías</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {cats.map(([id, m]) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: m.color + '24', color: m.color, display: 'grid', placeItems: 'center', fontSize: 17 }}>{m.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.label}</div>
                <div className="faint" style={{ fontSize: 11.5 }}>{counts[id] || 0} movimientos</div>
              </div>
              <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30, padding: 6 }} onClick={() => toast('Editar ' + m.label)}><Icon name="pencil" size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Auto rules */}
      <div className="card card-pad">
        <h2 className="section-title">Reglas de auto-categorización</h2>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 4, marginBottom: 18 }}>Cuando una descripción coincide, Tatú aplica la categoría automáticamente al importar.</p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', padding: 16, background: 'var(--surface-2)', borderRadius: 12, marginBottom: 18 }}>
          <div style={{ flex: '1 1 220px' }}>
            <label className="field-label">Si la descripción…</label>
            <input className="input" placeholder="ej. tienda inglesa" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} />
          </div>
          <div style={{ width: 150 }}>
            <label className="field-label">Coincidencia</label>
            <select className="select" value={form.match} onChange={(e) => setForm({ ...form, match: e.target.value })}>
              <option>contiene</option><option>empieza con</option><option>es igual a</option>
            </select>
          </div>
          <div style={{ width: 180 }}>
            <label className="field-label">Categoría</label>
            <select className="select" value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })}>
              {cats.map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={addRule}><Icon name="plus" size={15} /> Agregar</button>
        </div>

        <div>
          {rules.map((r) => {
            const m = T.CATEGORIES[r.cat];
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderBottom: '1px solid var(--border)' }}>
                <span className="tag" style={{ fontFamily: 'var(--font-mono)' }}>{r.match}</span>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>"{r.pattern}"</span>
                <Icon name="arrowRight" size={15} className="faint" />
                <CategoryBadge cat={r.cat} />
                <div style={{ flex: 1 }}></div>
                <button className="btn btn-ghost btn-icon" style={{ width: 30, height: 30, padding: 6, color: 'var(--text-faint)' }} onClick={() => { setRules(rules.filter((x) => x.id !== r.id)); toast('Regla eliminada'); }}><Icon name="trash" size={14} /></button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Configuración ---------------- */
function SettingRow({ title, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '18px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Settings({ theme, setTheme, homeCur, setHomeCur, rate, setRate, toast, onImport }) {
  return (
    <div className="view-anim">
      <div className="page-head">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-desc">Apariencia, monedas, cuenta y tus datos</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, maxWidth: 760 }}>
        <div className="card card-pad">
          <h2 className="section-title" style={{ marginBottom: 4 }}>Apariencia</h2>
          <SettingRow title="Tema" desc="Elegí cómo se ve Tatú">
            <Segment value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />
          </SettingRow>
        </div>

        <div className="card card-pad">
          <h2 className="section-title" style={{ marginBottom: 4 }}>Monedas</h2>
          <SettingRow title="Moneda principal" desc="Tatú convierte y combina todo en esta moneda">
            <Segment value={homeCur} onChange={setHomeCur} options={[{ value: 'USD', label: 'Dólares' }, { value: 'UYU', label: 'Pesos' }]} />
          </SettingRow>
          <SettingRow title="Tipo de cambio" desc="Pesos uruguayos por cada dólar (USD)">
            <input
              className="input mono"
              type="number"
              step="0.1"
              value={rate}
              onChange={(e) => { const n = parseFloat(e.target.value); if (n > 0) setRate(n); }}
              style={{ width: 110, textAlign: 'right' }}
            />
          </SettingRow>
        </div>

        <div className="card card-pad">
          <h2 className="section-title" style={{ marginBottom: 4 }}>Cuenta</h2>
          <SettingRow title="José Gazzano" desc="jose@gazzano.uy · sincronizado en la nube">
            <span className="badge" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}><span className="dot" style={{ background: 'var(--pos)' }}></span>Conectado</span>
          </SettingRow>
          <SettingRow title="Cerrar sesión" desc="Salir de tu cuenta en este dispositivo">
            <button className="btn" onClick={() => toast('Sesión cerrada')}><Icon name="logout" size={15} /> Salir</button>
          </SettingRow>
        </div>

        <div className="card card-pad">
          <h2 className="section-title" style={{ marginBottom: 4 }}>Datos</h2>
          <SettingRow title="Importar movimientos" desc="Agregá un nuevo extracto CSV de Santander">
            <button className="btn" onClick={onImport}><Icon name="upload" size={15} /> Importar</button>
          </SettingRow>
          <SettingRow title="Exportar todo" desc="Descargá todas tus transacciones en CSV o PDF">
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => toast('Exportando CSV…')}>CSV</button>
              <button className="btn btn-sm" onClick={() => toast('Exportando PDF…')}>PDF</button>
            </div>
          </SettingRow>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: '18px 0' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neg)' }}>Eliminar todos los datos</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Borra transacciones, reglas y categorías. No se puede deshacer.</div>
            </div>
            <button className="btn" style={{ color: 'var(--neg)', borderColor: 'var(--neg)' }} onClick={() => toast('Datos eliminados')}><Icon name="trash" size={15} /> Eliminar</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 16, background: 'var(--brand-soft)', borderRadius: 12, color: 'var(--brand-text)' }}>
          <Icon name="shield" size={18} />
          <p style={{ fontSize: 13, lineHeight: 1.55 }}><strong>Tu privacidad es importante.</strong> Tus movimientos se guardan cifrados en tu cuenta y se sincronizan de forma segura. Nunca compartimos tus datos financieros con terceros.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Importar (overlay) ---------------- */
function ImportModal({ onClose, toast }) {
  const T = window.TATU;
  const [drag, setDrag] = useStateMg(false);
  const types = [
    { icon: 'card', title: 'Tarjeta de Crédito', desc: 'Compras y pagos en UYU y USD', color: 'var(--brand)' },
    { icon: 'dollar', title: 'Cuenta USD', desc: 'Caja de ahorro en dólares', color: 'var(--pos)' },
    { icon: 'bank', title: 'Cuenta UYU', desc: 'Caja de ahorro en pesos', color: 'var(--accent)' },
  ];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 19, fontFamily: 'var(--font-display)' }}>Importar movimientos</h3>
            <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>Extractos CSV de Santander Uruguay</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div style={{ padding: 26 }}>
          <div
            className={'dropzone' + (drag ? ' drag' : '')}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); toast('Procesando archivo… (demo)'); onClose(); }}
          >
            <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
              <Icon name="upload" size={24} strokeWidth={2} />
            </span>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Arrastrá tu archivo CSV aquí</div>
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 16px' }}>Detectamos el tipo de cuenta automáticamente</p>
            <button className="btn btn-primary" onClick={() => { toast('Selector de archivos (demo)'); }}>Seleccionar archivo</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 18 }}>
            {types.map((t) => (
              <div key={t.title} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 12 }}>
                <span style={{ color: t.color }}><AccountIcon kind={t.icon} size={20} /></span>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{t.title}</div>
                <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{t.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 18, padding: 14, background: 'var(--surface-2)', borderRadius: 10 }}>
            <Icon name="shield" size={17} className="faint" style={{ flexShrink: 0, marginTop: 1 }} />
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Tu archivo se procesa y guarda de forma segura en tu cuenta. Nunca compartimos tus datos con terceros.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Categories = Categories;
window.Settings = Settings;
window.ImportModal = ImportModal;
