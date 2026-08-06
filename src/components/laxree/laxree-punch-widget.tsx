'use client'

import { useState, useEffect } from 'react'
import { useWorkflowStore } from '@/stores/workflow-store'

// ════════════════════════════════════════════════════════════════════════
// v25·0801 — Punch-in/Punch-out Widget with 100m Geofencing
// ════════════════════════════════════════════════════════════════════════
// Shown on employee/manager dashboard. Uses browser geolocation (high accuracy).
// Punch allowed only when within 100m of assigned office.
// ════════════════════════════════════════════════════════════════════════

interface PunchRecord {
  id: string
  punchIn: string
  punchOut: string | null
  status: string
  punchInDistance: number
  punchOutDistance: number | null
  punchInAccuracy: number | null
  punchOutAccuracy: number | null
  office: {
    name: string
    city: string
    address: string
  }
}

interface ApiResponse {
  records: PunchRecord[]
  activePunch: PunchRecord | null
  count: number
}

interface PunchResponse {
  success?: boolean
  message?: string
  error?: string
  code?: string
  punch?: any
  distance?: number
  officeRadius?: number
  office?: any
}

export function LaxreePunchWidget() {
  const { currentUserId, currentRole, addToast } = useWorkflowStore()
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [activePunch, setActivePunch] = useState<PunchRecord | null>(null)
  const [todayRecords, setTodayRecords] = useState<PunchRecord[]>([])
  const [locationError, setLocationError] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())

  // Only employees and managers can punch
  const canPunch = currentRole === 'EMPLOYEE' || currentRole === 'MANAGER'

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch today's punch records
  const fetchTodayPunches = async () => {
    if (!currentUserId) return
    try {
      const res = await fetch(`/api/attendance/punch?userId=${currentUserId}`)
      if (res.ok) {
        const data: ApiResponse = await res.json()
        setActivePunch(data.activePunch)
        setTodayRecords(data.records)
      }
    } catch (e) {
      console.error('Failed to fetch punch records:', e)
    }
  }

  useEffect(() => {
    if (canPunch && currentUserId) {
      fetchTodayPunches()
      // Refresh every 30 seconds
      const timer = setInterval(fetchTodayPunches, 30000)
      return () => clearInterval(timer)
    }
  }, [canPunch, currentUserId])

  // Get current GPS position with high accuracy
  const getCurrentPosition = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported by this browser'))
        return
      }

      setLocating(true)
      setLocationError(null)

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocating(false)
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
        },
        (error) => {
          setLocating(false)
          let msg = 'Failed to get location'
          switch (error.code) {
            case error.PERMISSION_DENIED:
              msg = 'Location permission denied. Please enable location access in your browser settings.'
              break
            case error.POSITION_UNAVAILABLE:
              msg = 'Location unavailable. Check your GPS/internet connection.'
              break
            case error.TIMEOUT:
              msg = 'Location request timed out. Try again outside with clear sky view.'
              break
          }
          setLocationError(msg)
          reject(new Error(msg))
        },
        {
          enableHighAccuracy: true,  // Force GPS, not just WiFi
          timeout: 30000,             // 30 seconds
          maximumAge: 0,              // Don't use cached position
        }
      )
    })
  }

  const handlePunch = async (action: 'in' | 'out') => {
    if (!currentUserId) return

    setLoading(true)
    try {
      const pos = await getCurrentPosition()
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          action,
          latitude: pos.lat,
          longitude: pos.lng,
          accuracy: pos.accuracy,
        }),
      })

      const data: PunchResponse = await res.json()

      if (res.ok && data.success) {
        addToast('ok', data.message || `Punched ${action} successfully`)
        await fetchTodayPunches()
      } else {
        // Handle specific error codes
        let errorMsg = data.error || 'Punch failed'

        if (data.code === 'OUTSIDE_GEOFENCE') {
          errorMsg = `🚫 ${data.error}\n\nYou are ${data.distance}m away. Punch allowed only within ${data.officeRadius}m of ${data.office?.name}.`
        } else if (data.code === 'NO_OFFICE_ASSIGNED') {
          errorMsg = 'No office assigned to your account. Contact admin.'
        } else if (data.code === 'ALREADY_PUNCHED_IN') {
          errorMsg = 'You are already punched in.'
          await fetchTodayPunches()
        } else if (data.code === 'NO_ACTIVE_PUNCH') {
          errorMsg = 'No active punch-in found. Punch in first.'
          await fetchTodayPunches()
        }

        addToast('err', errorMsg)
      }
    } catch (e: any) {
      addToast('err', e.message || 'Failed to punch. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!canPunch) return null

  // Format time
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

  const isPunchedIn = !!activePunch

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      border: `2px solid ${isPunchedIn ? '#10B981' : '#F59E0B'}`,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: isPunchedIn ? '#10B981' : '#F59E0B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}>
            {isPunchedIn ? '✅' : '📍'}
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>
              {isPunchedIn ? 'You are Punched In' : 'Ready to Punch In'}
            </div>
            <div style={{ color: '#9CA3AF', fontSize: 11 }}>
              {formatDate(now)}
            </div>
          </div>
        </div>

        <div style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 1,
        }}>
          {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
        </div>
      </div>

      {/* Status / Action row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {isPunchedIn ? (
            <div style={{ color: '#fff', fontSize: 13 }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ color: '#9CA3AF' }}>Punch In:</span>{' '}
                <span style={{ fontWeight: 700, color: '#10B981' }}>{formatTime(activePunch.punchIn)}</span>
                {activePunch.office && (
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}> @ {activePunch.office.name}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                ⏱️ Working for{' '}
                <span style={{ color: '#fff', fontWeight: 600 }}>
                  {Math.floor((now.getTime() - new Date(activePunch.punchIn).getTime()) / 60000)} min
                </span>
                {activePunch.punchInAccuracy && (
                  <span> · 📍 GPS accuracy ±{Math.round(activePunch.punchInAccuracy)}m</span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ color: '#9CA3AF', fontSize: 12 }}>
              {todayRecords.length > 0 ? (
                <span>✓ Completed {todayRecords.length} punch{todayRecords.length > 1 ? 'es' : ''} today</span>
              ) : (
                <span>📍 Make sure you are within 100m of your office to punch in</span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => handlePunch(isPunchedIn ? 'out' : 'in')}
          disabled={loading || locating}
          style={{
            padding: '14px 32px',
            borderRadius: 10,
            border: 'none',
            background: loading || locating
              ? '#6B7280'
              : isPunchedIn
                ? '#EF4444'
                : '#10B981',
            color: '#fff',
            fontWeight: 800,
            fontSize: 15,
            cursor: loading || locating ? 'wait' : 'pointer',
            minWidth: 140,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            transition: 'all 0.2s',
          }}
        >
          {loading ? '⏳ Please wait...' :
           locating ? '📡 Getting location...' :
           isPunchedIn ? '🔴 Punch OUT' : '🟢 Punch IN'}
        </button>
      </div>

      {/* Location error */}
      {locationError && (
        <div style={{
          marginTop: 12,
          padding: '10px 12px',
          background: 'rgba(239,68,68,0.15)',
          border: '1px solid #EF4444',
          borderRadius: 8,
          color: '#FCA5A5',
          fontSize: 12,
        }}>
          ⚠️ {locationError}
        </div>
      )}

      {/* Today's history */}
      {todayRecords.length > 0 && (
        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ color: '#9CA3AF', fontSize: 10, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Today's Punch History
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {todayRecords.slice(0, 5).map(r => (
              <div key={r.id} style={{
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 6,
                fontSize: 11,
                color: '#D1D5DB',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <span style={{ color: '#10B981', fontWeight: 600 }}>↓ {formatTime(r.punchIn)}</span>
                {r.punchOut && (
                  <span style={{ color: '#EF4444', fontWeight: 600, marginLeft: 6 }}>↑ {formatTime(r.punchOut)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginTop: 12,
        paddingTop: 8,
        fontSize: 10,
        color: '#6B7280',
        textAlign: 'center',
      }}>
        🔒 Punch requires GPS location within 100m of your assigned office · High accuracy mode enabled
      </div>
    </div>
  )
}
