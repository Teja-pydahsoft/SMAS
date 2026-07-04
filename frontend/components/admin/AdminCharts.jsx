'use client';

export function Sparkline({ data, color = 'var(--primary)', height = 36 }) {
  const values = data?.length ? data : [4, 8, 6, 12, 9, 14, 11];
  const max = Math.max(...values, 1);
  const width = 100;
  const step = width / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${i * step},${height - (v / max) * (height - 4) - 2}`)
    .join(' ');

  return (
    <svg className="admin-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

export function BarChart({ data, labels }) {
  const items = data?.length ? data : [12, 18, 9, 22, 16, 24, 14];
  const max = Math.max(...items, 1);

  return (
    <div className="admin-bar-chart">
      {items.map((value, index) => (
        <div key={labels?.[index] || index} className="admin-bar-chart__item">
          <div className="admin-bar-chart__bar-wrap">
            <div
              className="admin-bar-chart__bar"
              style={{ height: `${(value / max) * 100}%` }}
              title={String(value)}
            />
          </div>
          {labels?.[index] && <span className="admin-bar-chart__label">{labels[index]}</span>}
        </div>
      ))}
    </div>
  );
}

export function AreaChart({ data }) {
  const values = data?.length ? data : [8, 12, 10, 18, 14, 22, 19, 25, 21];
  const max = Math.max(...values, 1);
  const width = 320;
  const height = 120;
  const step = width / Math.max(values.length - 1, 1);

  const linePoints = values
    .map((v, i) => `${i * step},${height - (v / max) * (height - 8) - 4}`)
    .join(' ');

  const areaPoints = `0,${height} ${linePoints} ${width},${height}`;

  return (
    <svg className="admin-area-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="adminAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(37, 99, 235, 0.22)" />
          <stop offset="100%" stopColor="rgba(37, 99, 235, 0)" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#adminAreaFill)" />
      <polyline fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" points={linePoints} />
    </svg>
  );
}

export function PieChart({ segments }) {
  const items = segments?.length
    ? segments
    : [
        { label: 'Active', value: 45, color: '#2563EB' },
        { label: 'Pending', value: 25, color: '#F59E0B' },
        { label: 'Completed', value: 30, color: '#22C55E' },
      ];

  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="admin-pie-chart">
      <svg viewBox="0 0 100 100" className="admin-pie-chart__svg" aria-hidden>
        {items.map((item) => {
          const dash = (item.value / total) * circumference;
          const circle = (
            <circle
              key={item.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += dash;
          return circle;
        })}
      </svg>
      <ul className="admin-pie-chart__legend">
        {items.map((item) => (
          <li key={item.label}>
            <span style={{ background: item.color }} />
            {item.label} ({Math.round((item.value / total) * 100)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}
