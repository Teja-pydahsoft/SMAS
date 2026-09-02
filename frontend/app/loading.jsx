export default function Loading() {
  return (
    <div
      style={{
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        width: '100%',
        animation: 'fadeIn 150ms ease-out',
      }}
    >
      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              width: '180px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
          <div
            style={{
              width: '280px',
              height: '16px',
              borderRadius: '4px',
              background: 'linear-gradient(90deg, #f8fafc 25%, #f1f5f9 50%, #f8fafc 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
        </div>
        <div
          style={{
            width: '120px',
            height: '36px',
            borderRadius: '8px',
            background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      </div>

      {/* Metric cards skeleton grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: '100px',
              borderRadius: '12px',
              border: '1px solid var(--border-color, #e2e8f0)',
              background: 'linear-gradient(90deg, #ffffff 25%, #f8fafc 50%, #ffffff 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
              padding: '16px',
            }}
          />
        ))}
      </div>

      {/* Main content table skeleton */}
      <div
        style={{
          borderRadius: '12px',
          border: '1px solid var(--border-color, #e2e8f0)',
          background: '#ffffff',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '40px',
            borderRadius: '6px',
            background: 'linear-gradient(90deg, #f8fafc 25%, #f1f5f9 50%, #f8fafc 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }}
        />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              width: '100%',
              height: '36px',
              borderRadius: '4px',
              background: 'linear-gradient(90deg, #f8fafc 25%, #f1f5f9 50%, #f8fafc 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
            }}
          />
        ))}
      </div>
    </div>
  );
}
