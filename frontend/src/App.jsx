import { Suspense } from 'react'
import { lazyRoute } from './lib/lazyRoute.js'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { PageTransition } from './components/PageTransition'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/error/ErrorBoundary'
import { AppErrorPage } from './components/error/AppErrorPage'
import { AuthRedirectHandler } from './components/AuthRedirectHandler'
import { LandingOrRedirect } from './components/LandingOrRedirect'
import { Skeleton } from './components/ui/Skeleton'
import './pages/AppLayout.css'

const FeaturesPage = lazyRoute(() => import('./pages/FeaturesPage.jsx').then((m) => ({ default: m.FeaturesPage })))
const HowItWorksPage = lazyRoute(() => import('./pages/HowItWorksPage.jsx').then((m) => ({ default: m.HowItWorksPage })))
const SignUpPage = lazyRoute(() => import('./pages/SignUpPage.jsx').then((m) => ({ default: m.SignUpPage })))
const LoginPage = lazyRoute(() => import('./pages/LoginPage.jsx').then((m) => ({ default: m.LoginPage })))
const AppPage = lazyRoute(() => import('./pages/AppPage.jsx').then((m) => ({ default: m.AppPage })))
const AppFeaturesPage = lazyRoute(() => import('./pages/AppFeaturesPage.jsx').then((m) => ({ default: m.AppFeaturesPage })))
const AppHowItWorksPage = lazyRoute(() => import('./pages/AppHowItWorksPage.jsx').then((m) => ({ default: m.AppHowItWorksPage })))
const AppHelpCenterPage = lazyRoute(() =>
  import('./pages/AppResourcePages.jsx').then((m) => ({ default: m.AppHelpCenterPage }))
)
const AppBlogPage = lazyRoute(() =>
  import('./pages/AppResourcePages.jsx').then((m) => ({ default: m.AppBlogPage }))
)
const AppCommunityPage = lazyRoute(() =>
  import('./pages/AppResourcePages.jsx').then((m) => ({ default: m.AppCommunityPage }))
)
const AppAboutPage = lazyRoute(() =>
  import('./pages/AppCompanyPages.jsx').then((m) => ({ default: m.AppAboutPage }))
)
const AppCareersPage = lazyRoute(() =>
  import('./pages/AppCompanyPages.jsx').then((m) => ({ default: m.AppCareersPage }))
)
const AppContactPage = lazyRoute(() =>
  import('./pages/AppCompanyPages.jsx').then((m) => ({ default: m.AppContactPage }))
)
const AppPrivacyPage = lazyRoute(() =>
  import('./pages/AppLegalPages.jsx').then((m) => ({ default: m.AppPrivacyPage }))
)
const AppTermsPage = lazyRoute(() =>
  import('./pages/AppLegalPages.jsx').then((m) => ({ default: m.AppTermsPage }))
)
const AppSecurityPage = lazyRoute(() =>
  import('./pages/AppLegalPages.jsx').then((m) => ({ default: m.AppSecurityPage }))
)
const AppCookiesPage = lazyRoute(() =>
  import('./pages/AppLegalPages.jsx').then((m) => ({ default: m.AppCookiesPage }))
)
const TeamPage = lazyRoute(() => import('./pages/TeamPage.jsx').then((m) => ({ default: m.TeamPage })))
const SettingsPage = lazyRoute(() => import('./pages/SettingsPage.jsx').then((m) => ({ default: m.SettingsPage })))
const ProfilePage = lazyRoute(() => import('./pages/ProfilePage.jsx').then((m) => ({ default: m.ProfilePage })))
const OrgProfilePage = lazyRoute(() => import('./pages/OrgProfilePage.jsx').then((m) => ({ default: m.OrgProfilePage })))
const OrgDashboardPage = lazyRoute(() => import('./pages/OrgDashboardPage.jsx').then((m) => ({ default: m.OrgDashboardPage })))
const OrganizationsPage = lazyRoute(() => import('./pages/OrganizationsPage.jsx').then((m) => ({ default: m.OrganizationsPage })))
const AdminSelectorPage = lazyRoute(() => import('./pages/AdminSelectorPage.jsx').then((m) => ({ default: m.AdminSelectorPage })))
const CalendarPage = lazyRoute(() => import('./pages/CalendarPage.jsx').then((m) => ({ default: m.CalendarPage })))
const ChatsPage = lazyRoute(() => import('./pages/ChatsPage.jsx').then((m) => ({ default: m.ChatsPage })))
const AdminPage = lazyRoute(() => import('./pages/AdminPage.jsx').then((m) => ({ default: m.AdminPage })))
const VideoCallPage = lazyRoute(() => import('./pages/VideoCallPage.jsx').then((m) => ({ default: m.VideoCallPage })))
const MeetingSummaryPage = lazyRoute(() =>
  import('./pages/MeetingSummaryPage.jsx').then((m) => ({ default: m.MeetingSummaryPage }))
)
const MeetingTranscriptPage = lazyRoute(() =>
  import('./pages/MeetingTranscriptPage.jsx').then((m) => ({ default: m.MeetingTranscriptPage }))
)
const PreviousMeetingsPage = lazyRoute(() =>
  import('./pages/PreviousMeetingsPage.jsx').then((m) => ({ default: m.PreviousMeetingsPage }))
)

function AppRouteFallback() {
  return (
    <div
      className="app-layout app-layout-auth-loading"
      style={{ minHeight: '100vh', width: '100%', background: '#0a0908' }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="app-auth-loading" aria-label="Loading page">
        <div style={{ width: '220px' }}>
          <Skeleton lines={2} />
        </div>
      </div>
    </div>
  )
}

function RoutedErrorBoundary({ children }) {
  const location = useLocation()
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
}

function App() {
  return (
    <BrowserRouter>
      <AuthRedirectHandler>
        <RoutedErrorBoundary>
          <Suspense fallback={<AppRouteFallback />}>
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
                <Route path="help" element={<AppHelpCenterPage />} />
                <Route path="blog" element={<AppBlogPage />} />
                <Route path="community" element={<AppCommunityPage />} />
                <Route path="about" element={<AppAboutPage />} />
                <Route path="careers" element={<AppCareersPage />} />
                <Route path="contact" element={<AppContactPage />} />
                <Route path="privacy" element={<AppPrivacyPage />} />
                <Route path="terms" element={<AppTermsPage />} />
                <Route path="security" element={<AppSecurityPage />} />
                <Route path="cookies" element={<AppCookiesPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="video" element={<VideoCallPage />} />
                <Route path="video/meetings" element={<PreviousMeetingsPage />} />
                <Route path="previous-meetings" element={<Navigate to="/app/video/meetings" replace />} />
                <Route path="meeting-summary/:summaryId" element={<MeetingSummaryPage />} />
                <Route path="meeting-transcript/:sessionId" element={<MeetingTranscriptPage />} />
                <Route path="chats" element={<ChatsPage />} />
                <Route path="org/:orgId/calendar" element={<CalendarPage />} />
                <Route path="org/:orgId/video" element={<VideoCallPage />} />
                <Route path="org/:orgId/video/meetings" element={<PreviousMeetingsPage />} />
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
              <Route
                path="*"
                element={
                  <AppErrorPage
                    title="Page not found"
                    message="The page you requested is unavailable. Return to the dashboard to continue."
                  />
                }
              />
            </Routes>
          </Suspense>
        </RoutedErrorBoundary>
      </AuthRedirectHandler>
    </BrowserRouter>
  )
}

export default App
