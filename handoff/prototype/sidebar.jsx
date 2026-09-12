/* Sidebar navigation + brand mark */
const { useState: useStateSh } = React;

function BrandMark({ size = 34 }) {
  // simple armadillo-arc glyph — geometric, not illustrative
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path d="M3 17c0-5 4-9 9-9s9 4 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M7 17c0-3 2.2-5 5-5s5 2 5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
        <circle cx="12" cy="18.5" r="1.5" fill="currentColor" />
      </svg>
    </span>
  );
}

function Sidebar({ view, setView, onImport, counts }) {
  const primary = [
    { id: 'overview', label: 'Resumen', icon: 'home' },
    { id: 'transactions', label: 'Transacciones', icon: 'list', count: counts.transactions },
  ];
  const manage = [
    { id: 'categories', label: 'Categorías', icon: 'tag' },
    { id: 'settings', label: 'Configuración', icon: 'settings' },
  ];

  const NavItem = ({ item }) => (
    <button className={'nav-item' + (view === item.id ? ' active' : '')} onClick={() => setView(item.id)}>
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
      {item.count != null && <span className="nav-count">{item.count}</span>}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <BrandMark />
        <div>
          <div className="brand-name">Tatú</div>
          <div className="brand-sub">Gastos · Uruguay</div>
        </div>
      </div>

      <button className="btn-import" onClick={onImport}>
        <Icon name="upload" size={16} strokeWidth={2} />
        Importar
      </button>

      <nav className="nav-group">
        <div className="nav-label">General</div>
        {primary.map((i) => <NavItem key={i.id} item={i} />)}
      </nav>

      <nav className="nav-group">
        <div className="nav-label">Gestión</div>
        {manage.map((i) => <NavItem key={i.id} item={i} />)}
      </nav>

      <div className="sidebar-foot">
        <div className="user-row">
          <span className="avatar">JG</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>José Gazzano</div>
            <div className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>jose@gazzano.uy</div>
          </div>
          <button className="btn btn-ghost btn-icon" title="Cerrar sesión" style={{ width: 30, height: 30, padding: 6 }}>
            <Icon name="logout" size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
window.BrandMark = BrandMark;
