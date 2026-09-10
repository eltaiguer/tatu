/* Shared UI: badges, charts, sidebar */
const { useState, useRef, useEffect } = React;
const T = window.TATU;

function CategoryBadge({ cat, soft = true }) {
  const meta = T.CATEGORIES[cat] || T.CATEGORIES.uncategorized;
  return (
    <span
      className="badge"
      style={{
        background: soft ? meta.color + '1f' : 'transparent',
        color: meta.color,
        borderColor: soft ? 'transparent' : meta.color + '55',
      }}
    >
      <span className="dot" style={{ background: meta.color }}></span>
      {meta.label}
    </span>
  );
}

function ConfidenceDot({ value }) {
  const level = value >= 0.8 ? 'alta' : value >= 0.55 ? 'media' : 'baja';
  const color = value >= 0.8 ? 'var(--pos)' : value >= 0.55 ? 'var(--accent)' : 'var(--neg)';
  return (
    <span title={`Confianza ${level} · ${Math.round(value * 100)}%`} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 4, height: 11, borderRadius: 2,
          background: (value >= 0.8 ? 3 : value >= 0.55 ? 2 : 1) > i ? color : 'var(--surface-3)',
        }}></span>
      ))}
    </span>
  );
}

function Segment({ value, onChange, options }) {
  return (
    <div className="segment">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---- Donut chart ---- */
function Donut({ data, size = 200, thickness = 26, centerLabel, centerValue }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const [hover, setHover] = useState(null);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circ;
          const seg = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={hover === i ? thickness + 4 : thickness}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              style={{ transition: 'stroke-width 0.15s, opacity 0.15s', opacity: hover === null || hover === i ? 1 : 0.4, cursor: 'pointer' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
          offset += dash;
          return seg;
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="faint" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {hover !== null ? data[hover].label : centerLabel}
          </div>
          <div className="mono" style={{ fontSize: 19, fontWeight: 600, marginTop: 2 }}>
            {hover !== null ? Math.round((data[hover].value / total) * 100) + '%' : centerValue}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Area / line chart: income vs expense over months ---- */
function TrendChart({ series, height = 220 }) {
  // series: [{ label, income, expense }]
  const w = 760;
  const pad = { l: 8, r: 8, t: 18, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(...series.flatMap((s) => [s.income, s.expense]), 1);
  const n = series.length;
  const x = (i) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => pad.t + innerH - (v / max) * innerH;
  const line = (key) => series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(s[key])}`).join(' ');
  const area = (key) => `${line(key)} L ${x(n - 1)} ${pad.t + innerH} L ${x(0)} ${pad.t + innerH} Z`;
  const ticks = 4;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="gPos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pos)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--pos)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gNeg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--neg)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--neg)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const gy = pad.t + (i / ticks) * innerH;
        return <line key={i} x1={pad.l} y1={gy} x2={w - pad.r} y2={gy} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />;
      })}
      <path d={area('expense')} fill="url(#gNeg)" />
      <path d={area('income')} fill="url(#gPos)" />
      <path d={line('expense')} fill="none" stroke="var(--neg)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d={line('income')} fill="none" stroke="var(--pos)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {series.map((s, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(s.income)} r="3.5" fill="var(--surface)" stroke="var(--pos)" strokeWidth="2" />
          <circle cx={x(i)} cy={y(s.expense)} r="3.5" fill="var(--surface)" stroke="var(--neg)" strokeWidth="2" />
          <text x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--text-faint)" fontFamily="var(--font-sans)">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

/* ---- Mini sparkline bars ---- */
function MiniBars({ values, color = 'var(--brand)', height = 36 }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height }}>
      {values.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${Math.max((v / max) * 100, 6)}%`,
          background: color, borderRadius: 2, opacity: 0.25 + 0.75 * (i / values.length),
        }}></div>
      ))}
    </div>
  );
}

window.CategoryBadge = CategoryBadge;
window.ConfidenceDot = ConfidenceDot;
window.Segment = Segment;
window.Donut = Donut;
window.TrendChart = TrendChart;
window.MiniBars = MiniBars;

/* ---- Editable FX-rate chip ---- */
function FxChip({ rate, setRate }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(String(rate));
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const save = () => { const n = parseFloat(val); if (n > 0) setRate(n); setOpen(false); };
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn btn-sm" onClick={() => { setVal(String(rate)); setOpen(!open); }} title="Tipo de cambio usado para combinar monedas" style={{ gap: 6 }}>
        <Icon name="trendUp" size={13} />
        <span className="mono" style={{ fontSize: 12 }}>1 US$ = $U {rate.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</span>
        <Icon name="pencil" size={12} className="faint" />
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, padding: 14, width: 230, boxShadow: 'var(--shadow-lg)' }}>
          <label className="field-label">Tipo de cambio (UYU por USD)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" type="number" step="0.1" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} autoFocus />
            <button className="btn btn-primary btn-sm" onClick={save}>OK</button>
          </div>
          <p className="faint" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>Se usa para convertir y combinar tus movimientos en una sola moneda.</p>
        </div>
      )}
    </div>
  );
}

/* ---- Two-segment currency split bar ---- */
function SplitBar({ pctUSD, pctUYU }) {
  return (
    <div style={{ display: 'flex', height: 9, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)' }}>
      <div style={{ width: pctUSD + '%', background: 'var(--brand)' }}></div>
      <div style={{ width: pctUYU + '%', background: 'var(--accent)' }}></div>
    </div>
  );
}

/* ---- Diverging net-cashflow bars (income − expense per month) ---- */
function NetBars({ series, height = 180, fmt }) {
  const w = 720;
  const pad = { l: 8, r: 8, t: 18, b: 24 };
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxAbs = Math.max(...series.map((s) => Math.abs(s.net)), 1);
  const zeroY = pad.t + innerH / 2;
  const n = series.length;
  const slot = innerW / n;
  const bw = Math.min(slot * 0.46, 46);
  const cx = (i) => pad.l + (i + 0.5) * slot;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} style={{ overflow: 'visible' }}>
      <line x1={pad.l} y1={zeroY} x2={w - pad.r} y2={zeroY} stroke="var(--border-strong)" strokeWidth="1" />
      {series.map((s, i) => {
        const h = (Math.abs(s.net) / maxAbs) * (innerH / 2);
        const pos = s.net >= 0;
        const y = pos ? zeroY - h : zeroY;
        return (
          <g key={i}>
            <rect x={cx(i) - bw / 2} y={y} width={bw} height={Math.max(h, 2)} rx="4" fill={pos ? 'var(--pos)' : 'var(--neg)'} opacity={pos ? 0.9 : 0.85} />
            <text x={cx(i)} y={pos ? y - 6 : y + h + 13} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-mono)" fill="var(--text-faint)">
              {fmt ? fmt(s.net) : Math.round(s.net)}
            </text>
            <text x={cx(i)} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--text-faint)" fontFamily="var(--font-sans)">{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

window.FxChip = FxChip;
window.SplitBar = SplitBar;
window.NetBars = NetBars;
