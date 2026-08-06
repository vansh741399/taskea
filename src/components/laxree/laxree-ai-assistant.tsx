'use client'

import { useMutation } from '@tanstack/react-query'
import { useWorkflowStore } from '@/stores/workflow-store'
import React, { useState, useRef, useEffect, useCallback } from 'react'

interface ChatMessage {
  role: 'user' | 'ai'
  text: string
  timestamp: Date
  isError?: boolean
  retryQuestion?: string
}

// Quick action presets that employees can click
const QUICK_ACTIONS = [
  {
    icon: '📋',
    label: 'Divide my work into workflow steps',
    question: 'I have multiple tasks assigned to me. Can you help me divide my work into a clear workflow with steps and priorities?',
  },
  {
    icon: '⏰',
    label: 'Help me prioritize my tasks',
    question: 'What should I work on first? Help me prioritize my tasks based on deadlines and importance.',
  },
  {
    icon: '📊',
    label: 'What is my task progress?',
    question: 'Give me a summary of all my tasks and their progress. What steps are remaining in each task?',
  },
  {
    icon: '🗓️',
    label: 'Plan my week',
    question: 'Help me plan my work for this week. I want to organize my tasks day-by-day from Monday to Saturday.',
  },
  {
    icon: '⚠️',
    label: 'What is overdue or at risk?',
    question: 'Are any of my tasks overdue or at risk? What should I do immediately to avoid missing deadlines?',
  },
  {
    icon: '🏖️',
    label: 'Can I take leave this week?',
    question: 'I want to apply for leave. Can you check my current tasks and tell me when would be the best day to take leave this week without affecting work?',
  },
  {
    icon: '🔄',
    label: 'How to handle too many tasks',
    question: 'I feel overwhelmed with tasks. Can you help me organize and batch similar work together so I can be more efficient?',
  },
  {
    icon: '📈',
    label: 'How to improve my performance',
    question: 'Based on my current tasks and progress, what tips can you give me to improve my performance score this week?',
  },
]

// Simple markdown-like renderer for AI responses
function renderAIText(text: string) {
  // Split by lines and process each
  const lines = text.split('\n')
  return lines.map((line, i) => {
    // Bold text: **text**
    let processed = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic text: *text* (but not inside **)
    processed = processed.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    
    return (
      <span key={i} dangerouslySetInnerHTML={{ __html: processed || '&nbsp;' }} />
    )
  }).reduce<React.ReactNode[]>((acc, elem, i) => {
    if (i > 0) acc.push(<br key={`br-${i}`} />)
    acc.push(elem)
    return acc
  }, [])
}

const AVATAR_COLORS = ['#B45309', '#6D28D9', '#0F766E', '#1D4ED8', '#BE123C', '#15803D', '#C2410C', '#7C3AED']
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export function LaxreeAiAssistant() {
  const { currentUserId, currentUserName, addToast } = useWorkflowStore()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendQuestion = useCallback((question: string) => {
    if (!question || !currentUserId) return

    setMessages(prev => [...prev, { role: 'user', text: question, timestamp: new Date() }])
    setInputText('')
    setIsLoading(true)
    setShowQuickActions(false)

    fetch('/api/ai-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        question,
        history: messages.slice(-10),
      }),
    })
    .then(res => res.json())
    .then(data => {
      // The API now always returns an `answer` field (even on fallback)
      const answer = data.answer || data.error || 'I couldn\'t generate a response. Please try again.'
      const isError = !!data.error && !data.answer
      setMessages(prev => [...prev, {
        role: 'ai',
        text: answer,
        timestamp: new Date(),
        isError,
        retryQuestion: isError ? question : undefined,
      }])
      setIsLoading(false)
      if (isError) {
        addToast('err', 'AI assistant encountered an issue — see response below')
      }
    })
    .catch(err => {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: 'I\'m having trouble connecting right now. Please check your internet connection and try again.',
        timestamp: new Date(),
        isError: true,
        retryQuestion: question,
      }])
      setIsLoading(false)
      addToast('err', 'Connection error — please try again')
    })
  }, [currentUserId, messages, addToast])

  const handleSend = useCallback((text?: string) => {
    const question = text || inputText.trim()
    if (!question || isLoading) return
    sendQuestion(question)
  }, [inputText, isLoading, sendQuestion])

  const handleRetry = useCallback((retryQuestion: string) => {
    // Remove the error message
    setMessages(prev => prev.slice(0, -1))
    // Re-send the question
    sendQuestion(retryQuestion)
  }, [sendQuestion])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const clearChat = () => {
    setMessages([])
    setShowQuickActions(true)
    inputRef.current?.focus()
  }

  const firstName = currentUserName?.split(' ')[0] || 'there'
  const userInitials = getInitials(currentUserName || 'E')
  const userAvatarColor = avatarColor(currentUserName || 'Employee')

  return (
    <>
      <div className="ph">
        <div className="ph-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="av" style={{ width: 36, height: 36, fontSize: 14, background: 'linear-gradient(135deg, #6D28D9, #7C3AED)' }}>
            🤖
          </div>
          <div>
            <h2>AI Workflow Assistant</h2>
            <p>Get help organizing your tasks, dividing work into steps, and managing your workflow</p>
          </div>
        </div>
        <div className="ph-right">
          {messages.length > 0 && (
            <button
              className="btn"
              style={{ fontSize: 11, padding: '6px 14px', background: 'var(--bg2)', color: 'var(--t2)', fontWeight: 700 }}
              onClick={clearChat}
            >
              🗑️ Clear Chat
            </button>
          )}
        </div>
      </div>
      <div className="page-accent" />

      {!currentUserId && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#DC2626', borderRadius: 8, marginBottom: 12, fontWeight: 700 }}>
          Please log in to use the AI Assistant
        </div>
      )}

      {/* Main Chat Container */}
      <div className="lcard" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 210px)', minHeight: 480 }}>
        {/* Chat Header */}
        <div className="ch" style={{ flexShrink: 0, borderBottom: '1px solid var(--b1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #6D28D9, #7C3AED)', fontSize: 18,
            }}>
              🤖
            </div>
            <div>
              <div className="ct" style={{ fontSize: 14 }}>AI Workflow Assistant</div>
              <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isLoading ? '#F59E0B' : '#22C55E', display: 'inline-block' }} />
                {isLoading ? 'Thinking...' : 'Online — Ready to help'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#6D28D9', background: 'rgba(109,40,217,.1)', padding: '2px 10px', borderRadius: 10 }}>
              Powered by AI
            </span>
            {messages.length > 0 && (
              <span style={{ fontSize: 9, color: 'var(--t4)', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 10 }}>
                {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Chat Messages Area */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px',
          display: 'flex', flexDirection: 'column', gap: 12,
          background: 'var(--card2)',
        }}>
          {/* Welcome Message with Quick Actions */}
          {messages.length === 0 && showQuickActions && (
            <div style={{ textAlign: 'center', padding: '20px 8px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t1)', marginBottom: 4 }}>
                Hi, {firstName}!
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto', marginBottom: 20 }}>
                I&apos;m your AI Workflow Assistant. I can help you divide your work into steps, prioritize tasks, plan your week, and stay on top of deadlines.
              </div>

              {/* Feature Highlights */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxWidth: 560, margin: '0 auto 20px' }}>
                {[
                  { icon: '📋', title: 'Divide Work', desc: 'Break tasks into clear workflow steps' },
                  { icon: '⏰', title: 'Prioritize', desc: 'Know what to do first' },
                  { icon: '🗓️', title: 'Plan Week', desc: 'Day-by-day work schedule' },
                ].map(f => (
                  <div key={f.title} style={{
                    padding: '12px 8px', borderRadius: 10, background: 'var(--card)',
                    border: '1px solid var(--b1)', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--t1)' }}>{f.title}</div>
                    <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2 }}>{f.desc}</div>
                  </div>
                ))}
              </div>

              {/* Quick Action Buttons */}
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--t3)', marginBottom: 10 }}>
                Try asking...
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, maxWidth: 560, margin: '0 auto' }}>
                {QUICK_ACTIONS.map(action => (
                  <button
                    key={action.label}
                    className="btn"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', background: 'var(--card)',
                      border: '1px solid var(--b1)', borderRadius: 10,
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => handleSend(action.question)}
                    disabled={isLoading}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{action.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)', lineHeight: 1.3 }}>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat Messages */}
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{ display: 'flex', gap: 8, maxWidth: '85%', alignItems: 'flex-start' }}>
                {msg.role === 'ai' && (
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: 'linear-gradient(135deg, #6D28D9, #7C3AED)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, color: '#fff',
                  }}>
                    🤖
                  </div>
                )}
                <div>
                  <div style={{
                    padding: '12px 16px', borderRadius: 14, fontSize: 13, lineHeight: 1.7,
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, var(--g2), #B8860B)'
                      : msg.isError
                        ? '#FEF2F2'
                        : 'var(--card)',
                    color: msg.role === 'user' ? '#fff' : msg.isError ? '#991B1B' : 'var(--t1)',
                    border: msg.role === 'user' ? 'none' : msg.isError ? '1px solid rgba(220,38,38,.3)' : '1px solid var(--b1)',
                    whiteSpace: 'pre-wrap',
                    borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
                    borderBottomLeftRadius: msg.role === 'ai' ? 4 : 14,
                  }}>
                    {msg.role === 'ai' && (
                      <div style={{ fontSize: 9, fontWeight: 800, color: msg.isError ? '#DC2626' : '#6D28D9', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {msg.isError ? '⚠️ Error' : 'AI Assistant'}
                      </div>
                    )}
                    {msg.role === 'ai' ? renderAIText(msg.text) : msg.text}
                    <div style={{
                      fontSize: 8, color: msg.role === 'user' ? 'rgba(255,255,255,.6)' : 'var(--t4)',
                      marginTop: 6, textAlign: 'right',
                    }}>
                      {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {/* Retry button for error messages */}
                  {msg.isError && msg.retryQuestion && (
                    <button
                      className="btn"
                      style={{
                        marginTop: 6, fontSize: 10, padding: '4px 12px',
                        background: '#DC2626', color: '#fff', fontWeight: 700,
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                      onClick={() => handleRetry(msg.retryQuestion!)}
                      disabled={isLoading}
                    >
                      🔄 Retry
                    </button>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="av" style={{
                    width: 28, height: 28, fontSize: 11, flexShrink: 0,
                    background: userAvatarColor,
                  }}>
                    {userInitials}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading Animation */}
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #6D28D9, #7C3AED)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, color: '#fff',
                }}>
                  🤖
                </div>
                <div style={{
                  padding: '12px 16px', borderRadius: 14, background: 'var(--card)',
                  border: '1px solid var(--b1)', borderBottomLeftRadius: 4,
                }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span className="dot-pulse" />
                    <span className="dot-pulse" style={{ animationDelay: '0.2s' }} />
                    <span className="dot-pulse" style={{ animationDelay: '0.4s' }} />
                    <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 6 }}>Thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick Re-suggest bar when chat has messages */}
        {messages.length > 0 && !isLoading && (
          <div style={{
            flexShrink: 0, padding: '6px 16px', borderTop: '1px solid var(--b1)',
            display: 'flex', gap: 4, overflowX: 'auto', background: 'var(--card2)',
          }}>
            {QUICK_ACTIONS.slice(0, 4).map(action => (
              <button
                key={action.label}
                className="btn"
                style={{
                  fontSize: 9, padding: '4px 10px', background: 'var(--card)',
                  border: '1px solid var(--b1)', borderRadius: 14, cursor: 'pointer',
                  whiteSpace: 'nowrap', color: 'var(--t2)', fontWeight: 700,
                }}
                onClick={() => handleSend(action.question)}
              >
                {action.icon} {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Chat Input Bar */}
        <div style={{
          flexShrink: 0, padding: '12px 16px', borderTop: '2px solid var(--b1)',
          display: 'flex', gap: 8, alignItems: 'center', background: 'var(--card)',
        }}>
          <input
            ref={inputRef}
            className="fi"
            type="text"
            placeholder="Ask how to divide your work, prioritize tasks, or plan your week..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1, fontSize: 13, padding: '10px 14px', borderRadius: 10 }}
            disabled={isLoading || !currentUserId}
          />
          <button
            className="btn btn-gold"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isLoading || !currentUserId}
            style={{ padding: '10px 20px', fontSize: 12, fontWeight: 800, borderRadius: 10, minWidth: 70 }}
          >
            {isLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="dot-pulse" /> 
              </span>
            ) : 'Send →'}
          </button>
        </div>
      </div>
    </>
  )
}
