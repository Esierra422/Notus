import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { PageTransition } from './components/PageTransition'
import { AppShell } from './components/AppShell'
import { AuthRedirectHandler } from './components/AuthRedirectHandler'
import { LandingOrRedirect } from './components/LandingOrRedirect'
import {
  LandingPage,
  FeaturesPage,
  HowItWorksPage,
  SignUpPage,
  LoginPage,
  AppPage,
  AppFeaturesPage,
  AppHowItWorksPage,
  TeamPage,
  SettingsPage,
  ProfilePage,
  OrgProfilePage,
  OrgDashboardPage,
  OrganizationsPage,
  AdminSelectorPage,
  CalendarPage,
  ChatsRedirect,
  ChatsPage,
  AdminPage,
  VideoCallPage,
} from './pages'

function App() {
  return (
    <BrowserRouter>
      <AuthRedirectHandler>
      <Routes>
        <Route element={<PageTransition />}>
          <Route path="/" element={<LandingOrRedirect />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>
          <Route path="/app" element={<AppShell />}>
          <Route index element={<AppPage />} />
          <Route path="features" element={<AppFeaturesPage />} />
          <Route path="how-it-works" element={<AppHowItWorksPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="video" element={<VideoCallPage />} />
          <Route path="chats" element={<ChatsRedirect />} />
          <Route path="org/:orgId/calendar" element={<CalendarPage />} />
          <Route path="org/:orgId/chats" element={<ChatsPage />} />
          <Route path="org/:orgId/chats/:chatId" element={<ChatsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="admin" element={<AdminSelectorPage />} />
          <Route path="org/:orgId" element={<OrgDashboardPage />} />
          <Route path="org/:orgId/profile" element={<OrgProfilePage />} />
          <Route path="org/:orgId/admin" element={<AdminPage />} />
          <Route path="org/:orgId/teams/:teamId" element={<TeamPage />} />
        </Route>
      </Routes>
      </AuthRedirectHandler>
    </BrowserRouter>
  )
}

export default App
