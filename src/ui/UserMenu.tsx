import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from './ToastContext'

export function UserMenu() {
  const { user, logout } = useAuth()
  const { pushError } = useToast()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!user) return null

  return (
    <div className="user-menu" ref={root}>
      <button
        type="button"
        className="user-menu-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-avatar" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M5 19.5c1.8-3.2 4.2-4.8 7-4.8s5.2 1.6 7 4.8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="user-name">{user.username}</span>
      </button>
      {open && (
        <div className="user-dropdown">
          <button
            type="button"
            className="user-dropdown-item"
            onClick={async () => {
              setOpen(false)
              try {
                await logout()
              } catch (e) {
                pushError(e instanceof Error ? e.message : 'Не удалось выйти')
              }
            }}
          >
            Выйти
          </button>
        </div>
      )}
    </div>
  )
}
