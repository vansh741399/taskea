'use client'

import { useState } from 'react'

const defaultHolidays = [
  { id: 'h1', name: 'Republic Day', date: '2025-01-26', type: 'National' },
  { id: 'h2', name: 'Holi', date: '2025-03-14', type: 'Regional' },
  { id: 'h3', name: 'Ram Navami', date: '2025-04-06', type: 'Regional' },
  { id: 'h4', name: 'Independence Day', date: '2025-08-15', type: 'National' },
  { id: 'h5', name: 'Diwali', date: '2025-10-20', type: 'Regional' },
  { id: 'h6', name: 'Dussehra', date: '2025-10-02', type: 'Regional' },
  { id: 'h7', name: 'Gandhi Jayanti', date: '2025-10-02', type: 'National' },
  { id: 'h8', name: 'Christmas', date: '2025-12-25', type: 'National' },
]

export function LaxreeHolidays() {
  const [holidays, setHolidays] = useState(defaultHolidays)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newType, setNewType] = useState('National')

  const handleAdd = () => {
    if (!newName.trim() || !newDate) return
    setHolidays([...holidays, { id: `h${Date.now()}`, name: newName.trim(), date: newDate, type: newType }])
    setNewName(''); setNewDate('')
  }

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Holidays</h2>
          <p>Company holiday calendar</p>
        </div>
      </div>
      <div className="page-accent" />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ch"><div className="ct">+ Add Holiday</div></div>
        <div className="cb">
          <div className="form-row fr-3">
            <div className="fg">
              <label>Holiday Name</label>
              <input className="fi" placeholder="Holiday name..." value={newName}
                onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="fg">
              <label>Date</label>
              <input className="fi" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
            </div>
            <div className="fg">
              <label>Type</label>
              <select className="sel" value={newType} onChange={e => setNewType(e.target.value)}>
                <option>National</option>
                <option>Regional</option>
                <option>Company</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-gold" onClick={handleAdd}>Add Holiday</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch"><div className="ct">📅 Holiday Calendar</div><span className="badge b-gold" style={{ fontSize: 10 }}>{holidays.length}</span></div>
        <div className="tw">
          <table>
            <thead><tr><th>Holiday</th><th>Date</th><th>Type</th></tr></thead>
            <tbody>
              {holidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
                <tr key={h.id}>
                  <td style={{ fontWeight: 600 }}>{h.name}</td>
                  <td>{new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td><span className={`badge ${h.type === 'National' ? 'b-blue' : h.type === 'Regional' ? 'b-amber' : 'b-green'}`} style={{ fontSize: 10 }}>{h.type}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
