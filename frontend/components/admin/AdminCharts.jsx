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

export function ChartLegend({ datasets, selectedDayIndex }) {
  if (!datasets || datasets.length === 0) return null;
  return (
    <div className="chart-legend">
      {datasets.map((ds, idx) => {
        const totalVal = typeof selectedDayIndex === 'number'
          ? (ds.data?.[selectedDayIndex] || 0)
          : (ds.data || []).reduce((sum, v) => sum + v, 0);
        return (
          <div key={ds.label || idx} className="chart-legend-item">
            <span className="legend-dot" style={{ backgroundColor: ds.color }} />
            <span className="legend-text">{ds.label} ({totalVal})</span>
          </div>
        );
      })}
    </div>
  );
}

export function BarChart({ data, labels, datasets, showLegend = false }) {
  const isMulti = Boolean(datasets && datasets.length > 0);

  if (isMulti) {
    const numColumns = labels?.length || 0;
    const colSums = Array(numColumns).fill(0);
    datasets.forEach(ds => {
      (ds.data || []).forEach((val, i) => {
        if (i < numColumns) colSums[i] += val;
      });
    });
    const max = Math.max(...colSums, 1);

    return (
      <div style={{ width: '100%' }}>
        <div className="admin-bar-chart">
          {Array(numColumns).fill(0).map((_, colIndex) => {
            const totalColVal = colSums[colIndex];
            return (
              <div key={labels?.[colIndex] || colIndex} className="admin-bar-chart__item">
                <div className="admin-bar-chart__bar-wrap">
                  {totalColVal > 0 ? (
                    <div className="admin-bar-chart__stacked-bar-container" style={{ height: `${(totalColVal / max) * 100}%` }}>
                      {datasets.map((ds, dsIndex) => {
                        const val = ds.data?.[colIndex] || 0;
                        if (val === 0) return null;
                        const segmentHeight = (val / totalColVal) * 100;
                        return (
                          <div
                            key={dsIndex}
                            className="admin-bar-chart__bar-segment"
                            style={{
                              height: `${segmentHeight}%`,
                              backgroundColor: ds.color || 'var(--primary)',
                            }}
                            title={`${ds.label}: ${val}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="admin-bar-chart__bar" style={{ height: '0%' }} />
                  )}
                </div>
                {labels?.[colIndex] && <span className="admin-bar-chart__label">{labels[colIndex]}</span>}
              </div>
            );
          })}
        </div>
        {showLegend && <ChartLegend datasets={datasets} />}
      </div>
    );
  }

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

export function AreaChart({ data, labels, datasets, showLegend = false }) {
  const isMulti = Boolean(datasets && datasets.length > 0);
  
  let max = 1;
  let valuesLength = 0;
  if (isMulti) {
    datasets.forEach(ds => {
      if (ds.data?.length) {
        max = Math.max(max, ...ds.data);
        valuesLength = Math.max(valuesLength, ds.data.length);
      }
    });
  } else {
    const values = data?.length ? data : [8, 12, 10, 18, 14, 22, 19, 25, 21];
    max = Math.max(...values, 1);
    valuesLength = values.length;
  }

  const width = 320;
  const height = 120;
  const step = width / Math.max(valuesLength - 1, 1);

  return (
    <div className="admin-area-chart-wrap" style={{ width: '100%' }}>
      <div className="admin-area-chart__plot">
        <svg className="admin-area-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
          {isMulti ? (
            datasets.map((ds, dsIndex) => {
              const linePoints = (ds.data || [])
                .map((v, i) => `${i * step},${height - (v / max) * (height - 8) - 4}`)
                .join(' ');
              const areaPoints = `0,${height} ${linePoints} ${width},${height}`;
              const gradientId = `areaFill-${dsIndex}`;
              const strokeColor = ds.color || 'var(--primary)';
              return (
                <g key={ds.label || dsIndex}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={strokeColor} stopOpacity="0.1" />
                      <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polygon points={areaPoints} fill={`url(#${gradientId})`} />
                  <polyline fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" points={linePoints} />
                </g>
              );
            })
          ) : (
            <>
              <defs>
                <linearGradient id="adminAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(37, 99, 235, 0.22)" />
                  <stop offset="100%" stopColor="rgba(37, 99, 235, 0)" />
                </linearGradient>
              </defs>
              {(() => {
                const values = data?.length ? data : [8, 12, 10, 18, 14, 22, 19, 25, 21];
                const linePoints = values
                  .map((v, i) => `${i * step},${height - (v / max) * (height - 8) - 4}`)
                  .join(' ');
                const areaPoints = `0,${height} ${linePoints} ${width},${height}`;
                return (
                  <>
                    <polygon points={areaPoints} fill="url(#adminAreaFill)" />
                    <polyline fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" points={linePoints} />
                  </>
                );
              })()}
            </>
          )}
        </svg>
        {!isMulti && labels?.length === valuesLength && (() => {
          const values = data?.length ? data : [8, 12, 10, 18, 14, 22, 19, 25, 21];
          return values.map((value, index) => {
            const left = (index / Math.max(values.length - 1, 1)) * 100;
            const top = ((height - (value / max) * (height - 8) - 4) / height) * 100;
            const edgeClass = index === 0 ? ' is-first' : index === values.length - 1 ? ' is-last' : '';
            return (
              <span
                key={labels[index]}
                className={`admin-area-chart__point${edgeClass}`}
                style={{ left: `${left}%`, top: `${top}%` }}
                tabIndex={0}
                aria-label={`${labels[index]}: ${value} registrations`}
              >
                <span className="admin-area-chart__dot" />
                <span className="admin-area-chart__tooltip">{labels[index]}: {value}</span>
              </span>
            );
          });
        })()}
      </div>
      {labels?.length === valuesLength && (
        <div className="admin-area-chart__labels">
          {labels.map(label => <span key={label}>{label}</span>)}
        </div>
      )}
      {isMulti && showLegend && <ChartLegend datasets={datasets} />}
    </div>
  );
}

export function PieChart({ segments, showLegend = false, className = '' }) {
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
    <div className={`admin-pie-chart ${className}`}>
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
      {showLegend && (
        <ul className="admin-pie-chart__legend">
          {items.map((item) => (
            <li key={item.label}>
              <span style={{ background: item.color }} />
              {item.label} ({Math.round((item.value / total) * 100)}%)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
