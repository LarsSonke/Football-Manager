import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './stores/auth.store'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import League from './pages/League'
import Draft from './pages/Draft'
import MatchReport from './pages/MatchReport'
import ClubProfile from './pages/ClubProfile'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function RootRoute() {
  const { token } = useAuth()
  return token ? <Navigate to="/dashboard" replace /> : <Home />
}

export default function App() {
  const { hydrate } = useAuth()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/league/:id" element={<RequireAuth><League /></RequireAuth>} />
        <Route path="/league/:id/draft" element={<RequireAuth><Draft /></RequireAuth>} />
        <Route path="/league/:id/match/:matchId" element={<RequireAuth><MatchReport /></RequireAuth>} />
        <Route path="/league/:id/club/:clubId" element={<RequireAuth><ClubProfile /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
