import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './stores/auth.store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import League from './pages/League'
import Draft from './pages/Draft'
import MatchReport from './pages/MatchReport'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { hydrate } = useAuth()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/league/:id" element={<RequireAuth><League /></RequireAuth>} />
        <Route path="/league/:id/draft" element={<RequireAuth><Draft /></RequireAuth>} />
        <Route path="/league/:id/match/:matchId" element={<RequireAuth><MatchReport /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
