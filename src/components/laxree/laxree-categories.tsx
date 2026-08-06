'use client'

import { useState } from 'react'

const defaultCategories = [
  { id: 'cat1', name: 'Routine Work', color: '#16A34A' },
  { id: 'cat2', name: 'Reconciliation', color: '#B8860B' },
  { id: 'cat3', name: 'One Time Work', color: '#2563EB' },
  { id: 'cat4', name: 'Compliance', color: '#DC2626' },
  { id: 'cat5', name: 'Operations', color: '#7C3AED' },
  { id: 'cat6', name: 'Procurement', color: '#0891B2' },
]

export function LaxreeCategories() {
  const [categories, setCategories] = useState(defaultCategories)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#B8860B')

  const handleAdd = () => {
    if (!newName.trim()) return
    setCategories([...categories, { id: `cat${Date.now()}`, name: newName.trim(), color: newColor }])
    setNewName('')
  }

  const handleDelete = (id: string) => {
    setCategories(categories.filter(c => c.id !== id))
  }

  return (
    <>
      <div className="ph">
        <div className="ph-left">
          <h2>Categories</h2>
          <p>Manage task categories and color coding</p>
        </div>
      </div>
      <div className="page-accent" />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="ch"><div className="ct">+ Add New Category</div></div>
        <div className="cb">
          <div className="form-row fr-2">
            <div className="fg">
              <label>Category Name</label>
              <input className="fi" placeholder="Enter category name..." value={newName}
                onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
            <div className="fg">
              <label>Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
                  style={{ width: 40, height: 36, border: '1px solid var(--b2)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }} />
                <button className="btn btn-gold" onClick={handleAdd}>Add</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch"><div className="ct">🗂 Category List</div><span className="badge b-gold" style={{ fontSize: 10 }}>{categories.length}</span></div>
        <div className="cb">
          {categories.map(cat => (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--b1)' }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: cat.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontWeight: 600 }}>{cat.name}</div>
              <span className="badge b-gray" style={{ fontSize: 9 }}>{cat.color}</span>
              <button className="btn btn-red btn-xs" onClick={() => handleDelete(cat.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
