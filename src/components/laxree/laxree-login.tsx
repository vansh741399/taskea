'use client'

import { useState } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'

export function LaxreeLogin() {
  const { login, setCurrentUserId, setCurrentUserName, setCurrentRole, setCurrentUser, setActivePage } = useWorkflowStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (attempts >= 5) {
      setError('Too many failed attempts. Please refresh the page.')
      return
    }
    setLoading(true)
    setError('')

    try {
      // Try API auth first (supports database-stored credentials and password resets)
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (res.ok) {
        // API auth successful — set user from database (DO NOT call login() which overwrites currentUserId)
        setCurrentUserId(data.id)
        setCurrentUserName(data.name)
        setCurrentRole(data.role as any)
        setCurrentUser({ username, role: data.role, name: data.name })
        // v24·0625 BUG FIX: route user to the correct landing page based on role.
        // Without this, employees land on `activePage === 'dashboard'` which is the
        // admin/EA view (the "employee sees admin page" bug). Now we explicitly send
        // EMPLOYEE/MANAGER users to 'employee-dashboard' on login.
        if (data.role === 'EMPLOYEE' || data.role === 'MANAGER') {
          setActivePage('employee-dashboard')
        } else {
          setActivePage('dashboard')
        }
        return
      }
    } catch (err) {
      console.error('API auth failed, falling back to client auth:', err)
    }

    // Fall back to client-side auth
    const success = login(username, password)
    if (!success) {
      const remaining = 5 - attempts - 1
      setAttempts(a => a + 1)
      setError(remaining > 0 ? `Invalid credentials. ${remaining} attempt(s) remaining.` : 'Account locked — please refresh.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(160deg, #fffcf2 0%, #fdf6d8 60%, #fff9ee 100%)',
      zIndex: 8000, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="lc">
        <div className="lc-brand">
          <div style={{
            width: 72, height: 72, margin: '0 auto 10px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8B6914, #D4AA50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700,
            color: '#fff', letterSpacing: 2,
          }}>L</div>
          <span className="lc-brand-name">LAXREE</span>
          <span className="lc-brand-sub">Enterprise Operating System</span>
        </div>
        <div className="lf-g">
          <label className="lf-l">Username</label>
          <input className="lf-i" type="text" placeholder="Enter your username"
            value={username} onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>
        <div className="lf-g">
          <label className="lf-l">Password</label>
          <input className="lf-i" type="password" placeholder="Enter your password"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>
        <button className="lf-btn" onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In to LOS'}
        </button>
        {error && (
          <div style={{
            background: 'var(--red-l)', border: '1px solid rgba(200,21,26,.3)',
            color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--r-sm)',
            fontSize: 12, marginTop: 10,
          }}>{error}</div>
        )}

        {/* Security notice - NO CREDENTIALS SHOWN */}
        <div style={{
          marginTop: 16, padding: '12px 14px', borderRadius: 8,
          background: 'rgba(109,40,217,.06)', border: '1px solid rgba(109,40,217,.15)',
          fontSize: 11, color: 'var(--t3)', lineHeight: 1.6, textAlign: 'center',
        }}>
          <div style={{ fontWeight: 800, color: '#6D28D9', marginBottom: 4, fontSize: 12 }}>
            🔐 Secure Login
          </div>
          <div>
            Contact your administrator for login credentials.
            <br />
            Credentials are managed securely by EA only.
          </div>
        </div>
      </div>
    </div>
  )
}
