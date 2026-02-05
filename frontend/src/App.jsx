import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PageTransition } from './components/PageTransition'
import {
  LandingPage,
  SignUpPage,
  LoginPage,
  AppPage,
  TeamPage,
  SettingsPage,
  ProfilePage,
} from './pages'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PageTransition />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<AppPage />} />
          <Route path="/app/profile" element={<ProfilePage />} />
          <Route path="/app/settings" element={<SettingsPage />} />
          <Route path="/app/org/:orgId" element={<Navigate to="/app" replace />} />
          <Route path="/app/org/:orgId/admin" element={<Navigate to="/app" replace />} />
          <Route path="/app/org/:orgId/teams/:teamId" element={<TeamPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
