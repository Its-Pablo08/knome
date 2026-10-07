import React, { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import AuthGuard from './components/layout/AuthGuard'
import { ModalProvider } from './components/contexts/ModalContext'
import { UserProvider } from './components/contexts/UserContext'
import { AudioProvider } from './components/contexts/AudioContext'
import { ToastProvider } from './components/contexts/ToastContext'
import { ConfirmDialogProvider } from './components/contexts/ConfirmDialogContext'
import GlobalAudioPlayer from './components/widgets/GlobalAudioPlayer'

// Lazy Load Pages for Faster Initial Load Time
const Login = lazy(() => import('./pages/Login'))
const SsoPage = lazy(() => import('./pages/auth/SsoPage'))
const SsoLogoutPage = lazy(() => import('./pages/auth/SsoLogoutPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Communities = lazy(() => import('./pages/Communities'))
const CommunityView = lazy(() => import('./pages/CommunityView'))
const Jobs = lazy(() => import('./pages/Jobs'))
const Videos = lazy(() => import('./pages/Videos'))
const Clips = lazy(() => import('./pages/Clips'))
const Podcasts = lazy(() => import('./pages/Podcasts'))
const Articles = lazy(() => import('./pages/Articles'))
const ArticleView = lazy(() => import('./pages/ArticleView'))
const HRAnalytics = lazy(() => import('./pages/HRAnalytics'))
const AdminConsole = lazy(() => import('./pages/AdminConsole'))
const Search = lazy(() => import('./pages/Search'))
const Profile = lazy(() => import('./pages/Profile'))
const KarmaHistory = lazy(() => import('./pages/KarmaHistory'))
const Network = lazy(() => import('./pages/Network'))
const SavedContent = lazy(() => import('./pages/SavedContent'))
const Posts = lazy(() => import('./pages/Posts'))
const Messages = lazy(() => import('./pages/Messages'))
const Wiki = lazy(() => import('./pages/Wiki'))
const WikiView = lazy(() => import('./pages/WikiView'))

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin"></div>
  </div>
);

/**
 * Wraps a page in Layout + AuthGuard for protected routes.
 */
function ProtectedPage({ children }) {
  return (
    <AuthGuard>
      <Layout>{children}</Layout>
    </AuthGuard>
  );
}

import ErrorBoundary from './components/ui/ErrorBoundary'

function App() {
  useEffect(() => {
    const handleGlobalKeyGuard = (e) => {
      // Intercept and prevent browser Save As (Ctrl+S, Cmd+S, Ctrl+Shift+S)
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Intercept and prevent browser Print / Save As PDF (Ctrl+P, Cmd+P)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Intercept View Source (Ctrl+U)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const handleGlobalContextMenu = (e) => {
      // Prevent browser default context menu on documents, articles, images, and embeds
      const target = e.target;
      if (target && (
        target.closest?.('.article-body') ||
        target.closest?.('[id^="doc-viewer"]') ||
        target.closest?.('object') ||
        target.closest?.('iframe') ||
        target.tagName === 'OBJECT' ||
        target.tagName === 'IFRAME' ||
        target.tagName === 'EMBED' ||
        target.tagName === 'IMG' ||
        target.tagName === 'VIDEO'
      )) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyGuard, true);
    window.addEventListener('contextmenu', handleGlobalContextMenu, true);
    document.addEventListener('contextmenu', handleGlobalContextMenu, true);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyGuard, true);
      window.removeEventListener('contextmenu', handleGlobalContextMenu, true);
      document.removeEventListener('contextmenu', handleGlobalContextMenu, true);
    };
  }, []);

  return (
    <ErrorBoundary>
      <UserProvider>
        <AudioProvider>
          <ToastProvider>
            <ConfirmDialogProvider>
              <ModalProvider>
              <Router>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    {/* Public & SSO Routes */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/sso" element={<SsoPage />} />
                    <Route path="/sso-callback" element={<SsoPage />} />
                    <Route path="/sso-logout" element={<SsoLogoutPage />} />

                    {/* Protected Routes */}
                    <Route path="/"                element={<ProtectedPage><Dashboard /></ProtectedPage>} />
                    <Route path="/community"       element={<ProtectedPage><Communities /></ProtectedPage>} />
                    <Route path="/communities"     element={<ProtectedPage><Communities /></ProtectedPage>} />
                    <Route path="/community/view"  element={<ProtectedPage><CommunityView /></ProtectedPage>} />
                    <Route path="/jobs"            element={<ProtectedPage><Jobs /></ProtectedPage>} />
                    <Route path="/videos"          element={<ProtectedPage><Videos /></ProtectedPage>} />
                    <Route path="/clips"           element={<ProtectedPage><Clips /></ProtectedPage>} />
                    <Route path="/podcasts"        element={<ProtectedPage><Podcasts /></ProtectedPage>} />
                    <Route path="/articles"        element={<ProtectedPage><Articles /></ProtectedPage>} />
                    <Route path="/article-view"    element={<ProtectedPage><ArticleView /></ProtectedPage>} />
                    <Route path="/wiki"            element={<ProtectedPage><Wiki /></ProtectedPage>} />
                    <Route path="/wikis"           element={<ProtectedPage><Wiki /></ProtectedPage>} />
                    <Route path="/wiki/view"       element={<ProtectedPage><WikiView /></ProtectedPage>} />
                    <Route path="/wiki/:id"        element={<ProtectedPage><WikiView /></ProtectedPage>} />
                    <Route path="/hr-analytics"    element={<ProtectedPage><HRAnalytics /></ProtectedPage>} />
                    <Route path="/analytics"       element={<ProtectedPage><HRAnalytics /></ProtectedPage>} />
                    <Route path="/admin-console"   element={<ProtectedPage><AdminConsole /></ProtectedPage>} />
                    <Route path="/profile"         element={<ProtectedPage><Profile /></ProtectedPage>} />
                    <Route path="/profile/:id"     element={<ProtectedPage><Profile /></ProtectedPage>} />
                    <Route path="/search"          element={<ProtectedPage><Search /></ProtectedPage>} />
                    <Route path="/karma-history"   element={<ProtectedPage><KarmaHistory /></ProtectedPage>} />
                    <Route path="/suggested-people" element={<ProtectedPage><Network /></ProtectedPage>} />
                    <Route path="/network"         element={<ProtectedPage><Network /></ProtectedPage>} />
                    <Route path="/saved-content"   element={<ProtectedPage><SavedContent /></ProtectedPage>} />
                    <Route path="/posts"           element={<ProtectedPage><Posts /></ProtectedPage>} />
                    <Route path="/messages"        element={<ProtectedPage><Messages /></ProtectedPage>} />
                    <Route path="/chat"            element={<Navigate to="/messages" replace />} />
                    <Route path="*"               element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
                <GlobalAudioPlayer />
              </Router>
              </ModalProvider>
            </ConfirmDialogProvider>
          </ToastProvider>
        </AudioProvider>
      </UserProvider>
    </ErrorBoundary>
  )
}

export default App
