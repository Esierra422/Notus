import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PageTransition } from './components/PageTransition'
import { AppShell } from './components/AppShell'
import {
  LandingPage,
  SignUpPage,
  LoginPage,
  AppPage,
  TeamPage,
  SettingsPage,
  ProfilePage,
  CalendarPage,
  ChatsRedirect,
  ChatsPage,
  AdminPage,
} from './pages'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PageTransition />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<AppPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="chats" element={<ChatsRedirect />} />
          <Route path="org/:orgId/chats" element={<ChatsPage />} />
          <Route path="org/:orgId/chats/:chatId" element={<ChatsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="org/:orgId" element={<Navigate to="/app" replace />} />
          <Route path="org/:orgId/admin" element={<AdminPage />} />
          <Route path="org/:orgId/teams/:teamId" element={<TeamPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
