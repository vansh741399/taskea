'use client'

export function LaxreeLoader() {
  return (
    <div id="loader" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(160deg, #0a0806 0%, #1a1100 50%, #080604 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
    }}>
      <div className="ld-ring" />
      <div style={{ animation: 'fadeUp 1s .3s ease forwards', opacity: 0 }}>
        <div className="ld-brand" style={{ marginTop: '12px' }}>LAXREE</div>
      </div>
      <div className="ld-sub">Enterprise Operating System v18</div>
      <div className="ld-bar"><div className="ld-fill" /></div>
    </div>
  )
}
