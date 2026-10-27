import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Toast = { id: number; message: string }

type ToastApi = {
  pushError: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const pushError = useCallback((message: string) => {
    const id = nextId++
    setItems((prev) => [...prev, { id, message }])
  }, [])

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value = useMemo(() => ({ pushError }), [pushError])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="assertive">
        {items.map((t) => (
          <div key={t.id} className="toast toast-error" role="alert">
            <p>{t.message}</p>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Закрыть">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast вне ToastProvider')
  return ctx
}
