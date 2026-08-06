'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useState } from 'react'

const CMD_ITEMS = [
  { label: 'Dashboard', icon: '⬛', page: 'dashboard' as const, key: 'D' },
  { label: 'Executive View', icon: '📡', page: 'executive' as const, key: 'E' },
  { label: 'All Tasks', icon: '📋', page: 'tasks' as const, key: 'T' },
  { label: 'Approvals', icon: '🔔', page: 'approvals' as const, key: 'A' },
  { label: 'Analytics', icon: '📊', page: 'analytics' as const, key: 'R' },
  { label: 'Performance', icon: '📈', page: 'performance' as const, key: 'P' },
  { label: 'Departments', icon: '🏢', page: 'departments' as const, key: '' },
  { label: 'Team Directory', icon: '👥', page: 'team' as const, key: '' },
  { label: 'Director Dependency', icon: '👔', page: 'dirDep' as const, key: '' },
  { label: 'Categories', icon: '🗂', page: 'categories' as const, key: '' },
  { label: 'Leave Management', icon: '🏖', page: 'leaves' as const, key: '' },
  { label: 'My Dashboard', icon: '👤', page: 'employee-dashboard' as const, key: '' },

  { label: 'Monday Meeting', icon: '🗓', page: 'monday' as const, key: '' },
]

export function LaxreeCmdPalette() {
  const { cmdPaletteOpen, setCmdPaletteOpen, setActivePage } = useWorkflowStore()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)

  if (!cmdPaletteOpen) return null

  const filtered = query ? CMD_ITEMS.filter(i => i.label.toLowerCase().includes(query.toLowerCase())) : CMD_ITEMS

  const handleSelect = (page: any) => {
    setActivePage(page)
    setCmdPaletteOpen(false)
    setQuery('')
    setActiveIdx(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { setActiveIdx(Math.min(activeIdx + 1, filtered.length - 1)); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setActiveIdx(Math.max(activeIdx - 1, 0)); e.preventDefault() }
    else if (e.key === 'Enter' && activeIdx >= 0 && filtered[activeIdx]) { handleSelect(filtered[activeIdx].page) }
    else if (e.key === 'Escape') { setCmdPaletteOpen(false); setQuery(''); setActiveIdx(-1) }
  }

  return (
    <div id="cmdPalette" className="show" onClick={e => { if (e.target === e.currentTarget) { setCmdPaletteOpen(false); setQuery('') } }}>
      <div className="cmd-box">
        <div className="cmd-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--t3)' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Search commands, pages, tasks…"
            value={query} onChange={e => { setQuery(e.target.value); setActiveIdx(-1) }}
            onKeyDown={handleKeyDown} autoFocus />
          <kbd style={{ fontSize: 10, background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4, color: 'var(--t3)', fontFamily: 'monospace' }}>ESC</kbd>
        </div>
        <div className="cmd-items">
          <div className="cmd-section">Navigation & Actions</div>
          {filtered.map((item, idx) => (
            <div key={item.page} className={`cmd-item${idx === activeIdx ? ' active' : ''}`}
              onClick={() => handleSelect(item.page)}
              onMouseEnter={() => setActiveIdx(idx)}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.key && <span className="cmd-key">{item.key}</span>}
            </div>
          ))}
        </div>
        <div className="cmd-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Open</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  )
}
