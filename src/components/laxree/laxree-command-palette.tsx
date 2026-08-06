'use client'

import { useWorkflowStore } from '@/stores/workflow-store'
import { useState, useEffect, useRef } from 'react'

const COMMANDS: Array<{ id: string; label: string; section: string; icon: string; shortcut?: string }> = [
  { id: 'dashboard', label: 'Go to Dashboard', section: 'Navigation', icon: '🏠' },
  { id: 'executive', label: 'Executive View', section: 'Navigation', icon: '👔', shortcut: 'E' },

  { id: 'tasks', label: 'All Tasks', section: 'Navigation', icon: '📋', shortcut: 'T' },
  { id: 'cancelled', label: 'Cancelled Tasks', section: 'Navigation', icon: '❌' },
  { id: 'analytics', label: 'Analytics & Reports', section: 'Navigation', icon: '📊' },
  { id: 'performance', label: 'Performance', section: 'Navigation', icon: '⚡' },
  { id: 'departments', label: 'Departments', section: 'Navigation', icon: '🏢' },
  { id: 'team', label: 'Team Members', section: 'Navigation', icon: '👥', shortcut: 'M' },
  { id: 'categories', label: 'Categories', section: 'Navigation', icon: '📁' },
  { id: 'leaves', label: 'Leave Management', section: 'Navigation', icon: '🏖️' },
  { id: 'employee-dashboard', label: 'My Dashboard', section: 'Navigation', icon: '👤' },


  { id: 'monday', label: 'Monday Meeting', section: 'Navigation', icon: '📅' },
]

export function LaxreeCommandPalette() {
  const { cmdPaletteOpen, setCmdPaletteOpen, setActivePage, setCreateTaskOpen, currentRole } = useWorkflowStore()
  const isEA = currentRole === 'EA' || currentRole === 'ADMIN'
  const [search, setSearch] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = COMMANDS.filter(c =>
    c.label.toLowerCase().includes(search.toLowerCase()) ||
    c.section.toLowerCase().includes(search.toLowerCase())
  )

  // Add Create Task as first item if search matches — ONLY for EA/Admin
  const allItems = [
    ...(isEA && (!search || 'create task'.includes(search.toLowerCase())) ? [{ id: 'tasks', label: 'Create New Task', section: 'Actions', icon: '➕', isCreateTask: true, shortcut: undefined as string | undefined }] : []),
    ...filtered,
  ]

  useEffect(() => {
    if (cmdPaletteOpen) {
      requestAnimationFrame(() => {
        setSearch('')
        setActiveIdx(0)
        setTimeout(() => inputRef.current?.focus(), 50)
      })
    }
  }, [cmdPaletteOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdPaletteOpen(!cmdPaletteOpen)
      }
      if (e.key === 'Escape' && cmdPaletteOpen) {
        setCmdPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cmdPaletteOpen, setCmdPaletteOpen])

  const handleSelect = (item: typeof allItems[0]) => {
    if ((item as { isCreateTask?: boolean }).isCreateTask) {
      setCreateTaskOpen(true)
    } else {
      setActivePage(item.id)
    }
    setCmdPaletteOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && allItems[activeIdx]) {
      handleSelect(allItems[activeIdx])
    }
  }

  if (!cmdPaletteOpen) return null

  return (
    <div className="overlay show" onClick={() => setCmdPaletteOpen(false)}>
      <div className="modal modal-md" style={{ maxHeight: 480, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--b1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search tasks, people, actions…"
            value={search}
            onChange={e => { setSearch(e.target.value); setActiveIdx(0) }}
            onKeyDown={handleKeyDown}
            style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 14, color: 'var(--t1)', fontFamily: 'DM Sans, sans-serif' }}
          />
          <span style={{ fontSize: 10, color: 'var(--t4)', background: 'var(--bg2)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>ESC</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {allItems.map((item, i) => (
            <div
              key={`${item.id}-${item.label}`}
              onClick={() => handleSelect(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px', cursor: 'pointer',
                background: i === activeIdx ? 'var(--g5)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 10, color: 'var(--t4)' }}>{item.section}</div>
              </div>
              {item.shortcut && (
                <span style={{ fontSize: 10, color: 'var(--t4)', background: 'var(--bg2)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{item.shortcut}</span>
              )}
            </div>
          ))}
          {allItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--t3)', fontSize: 12 }}>No results found</div>
          )}
        </div>
      </div>
    </div>
  )
}
