import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../ui/ToastContext'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const { pushError } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [workstation, setWorkstation] = useState('C')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/search" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await login(username.trim(), password, workstation || undefined)
    } catch (err) {
      pushError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Ирбис</h1>
        <p className="login-lead">Вход в каталог</p>
        <form className="login-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Логин</span>
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>АРМ</span>
            <select value={workstation} onChange={(e) => setWorkstation(e.target.value)}>
              <option value="C">Каталогизатор (C)</option>
              <option value="R">Читатель (R)</option>
              <option value="A">Администратор (A)</option>
              <option value="B">Книговыдача (B)</option>
              <option value="M">Комплектатор (M)</option>
              <option value="K">Книгообеспеченность (K)</option>
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Вход…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
