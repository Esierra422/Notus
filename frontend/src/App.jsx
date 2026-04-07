import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PageTransition } from './components/PageTransition'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/error/ErrorBoundary'
import { AppErrorPage } from './components/error/AppErrorPage'
import { AuthRedirectHandler } from './components/AuthRedirectHandler'
import { LandingOrRedirect } from './components/LandingOrRedirect'
import { Skeleton } from './components/ui/Skeleton'
import './pages/AppLayout.css'

const FeaturesPage = lazy(() => import('./pages/FeaturesPage.jsx').then((m) => ({ default: m.FeaturesPage })))
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage.jsx').then((m) => ({ default: m.HowItWorksPage })))
const SignUpPage = lazy(() => import('./pages/SignUpPage.jsx').then((m) => ({ default: m.SignUpPage })))
const LoginPage = lazy(() => import('./pages/LoginPage.jsx').then((m) => ({ default: m.LoginPage })))
const AppPage = lazy(() => import('./pages/AppPage.jsx').then((m) => ({ default: m.AppPage })))
const AppFeaturesPage = lazy(() => import('./pages/AppFeaturesPage.jsx').then((m) => ({ default: m.AppFeaturesPage })))
const AppHowItWorksPage = lazy(() => import('./pages/AppHowItWorksPage.jsx').then((m) => ({ default: m.AppHowItWorksPage })))
const AppHelpCenterPage = lazy(() =>
  import('./pages/AppResourcePages.jsx').then((m) => ({ default: m.AppHelpCenterPage }))
)
const AppBlogPage = lazy(() =>
  import('./pages/AppResourcePages.jsx').then((m) => ({ default: m.AppBlogPage }))
)
const AppCommunityPage = lazy(() =>
  import('./pages/AppResourcePages.jsx').then((m) => ({ default: m.AppCommunityPage }))
)
const AppAboutPage = lazy(() =>
  import('./pages/AppCompanyPages.jsx').then((m) => ({ default: m.AppAboutPage }))
)
const AppCareersPage = lazy(() =>
  import('./pages/AppCompanyPages.jsx').then((m) => ({ default: m.AppCareersPage }))
)
const AppContactPage = lazy(() =>
  import('./pages/AppCompanyPages.jsx').then((m) => ({ default: m.AppContactPage }))
)
const AppPrivacyPage = lazy(() =>
  import('./pages/AppLegalPages.jsx').then((m) => ({ default: m.AppPrivacyPage }))
)
const AppTermsPage = lazy(() =>
  import('./pages/AppLegalPages.jsx').then((m) => ({ default: m.AppTermsPage }))
)
const AppSecurityPage = lazy(() =>
  import('./pages/AppLegalPages.jsx').then((m) => ({ default: m.AppSecurityPage }))
)
const AppCookiesPage = lazy(() =>
  import('./pages/AppLegalPages.jsx').then((m) => ({ default: m.AppCookiesPage }))
)
const TeamPage = lazy(() => import('./pages/TeamPage.jsx').then((m) => ({ default: m.TeamPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx').then((m) => ({ default: m.SettingsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx').then((m) => ({ default: m.ProfilePage })))
const OrgProfilePage = lazy(() => import('./pages/OrgProfilePage.jsx').then((m) => ({ default: m.OrgProfilePage })))
const OrgDashboardPage = lazy(() => import('./pages/OrgDashboardPage.jsx').then((m) => ({ default: m.OrgDashboardPage })))
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage.jsx').then((m) => ({ default: m.OrganizationsPage })))
const AdminSelectorPage = lazy(() => import('./pages/AdminSelectorPage.jsx').then((m) => ({ default: m.AdminSelectorPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage.jsx').then((m) => ({ default: m.CalendarPage })))
const ChatsPage = lazy(() => import('./pages/ChatsPage.jsx').then((m) => ({ default: m.ChatsPage })))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx').then((m) => ({ default: m.AdminPage })))
const VideoCallPage = lazy(() => import('./pages/VideoCallPage.jsx').then((m) => ({ default: m.VideoCallPage })))
const MeetingSummaryPage = lazy(() =>
  import('./pages/MeetingSummaryPage.jsx').then((m) => ({ default: m.MeetingSummaryPage }))
)
const MeetingTranscriptPage = lazy(() =>
  import('./pages/MeetingTranscriptPage.jsx').then((m) => ({ default: m.MeetingTranscriptPage }))
)
const PreviousMeetingsPage = lazy(() =>
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

function App() {
  return (
    <BrowserRouter>
      <AuthRedirectHandler>
        <ErrorBoundary>
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
        </ErrorBoundary>
      </AuthRedirectHandler>
    </BrowserRouter>
  )
}

export default App
