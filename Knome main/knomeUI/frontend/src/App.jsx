import React, { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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

function NormalizeTrailingSlash() {
  const location = useLocation();
  if (location.pathname.length > 1 && location.pathname.endsWith('/')) {
    return <Navigate to={location.pathname.slice(0, -1) + location.search + location.hash} replace />;
  }
  return null;
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    const fullPath = location.pathname + location.search + location.hash;
    if (fullPath && !fullPath.startsWith('/login') && !fullPath.startsWith('/sso')) {
      try {
        sessionStorage.setItem('knome_last_route', fullPath);
        sessionStorage.setItem('knome_return_url', fullPath);
      } catch (_) {}
    }
  }, [location]);
  return null;
}

import { useSystemConfig } from './utils/systemConfig'

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

function FeatureDisabledView({ featureName, icon = 'block' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] p-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-5 shadow-lg shadow-rose-500/10">
        <span className="material-symbols-outlined text-[42px]">{icon}</span>
      </div>
      <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800 mb-3">
        Feature Disabled
      </span>
      <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
        {featureName} is Currently Unavailable
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
        The {featureName} module has been temporarily disabled by the System Administrator in the Approval Policy settings. Please check back later or return to the main dashboard.
      </p>
      <a
        href="/"
        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-700 hover:to-rose-700 text-white font-bold text-sm shadow-md shadow-indigo-500/20 transition-all flex items-center gap-2 cursor-pointer"
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        <span>Return to Dashboard</span>
      </a>
    </div>
  );
}

function FeatureProtectedPage({ feature, featureName, icon, children }) {
  const config = useSystemConfig();
  const rawKey = feature.replace(/^is/, '').replace(/Enabled$/, '');
  const camelKey = 'enable' + rawKey;
  const isEnabled = config[feature] !== false && config[camelKey] !== false;

  if (!config.isLoaded) {
    return (
      <ProtectedPage>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Verifying module permissions...</p>
        </div>
      </ProtectedPage>
    );
  }

  if (!isEnabled) {
    return (
      <ProtectedPage>
        <FeatureDisabledView featureName={featureName} icon={icon} />
      </ProtectedPage>
    );
  }

  return <ProtectedPage>{children}</ProtectedPage>;
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
                <NormalizeTrailingSlash />
                <RouteTracker />
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
                    <Route path="/videos"          element={<FeatureProtectedPage feature="isVideosEnabled" featureName="Videos" icon="videocam"><Videos /></FeatureProtectedPage>} />
                    <Route path="/videos/:id"      element={<FeatureProtectedPage feature="isVideosEnabled" featureName="Videos" icon="videocam"><Videos /></FeatureProtectedPage>} />
                    <Route path="/clips"           element={<FeatureProtectedPage feature="isClipsEnabled" featureName="Clips" icon="movie"><Clips /></FeatureProtectedPage>} />
                    <Route path="/clips/:id"       element={<FeatureProtectedPage feature="isClipsEnabled" featureName="Clips" icon="movie"><Clips /></FeatureProtectedPage>} />
                    <Route path="/podcasts"        element={<FeatureProtectedPage feature="isPodcastsEnabled" featureName="Podcasts" icon="podcasts"><Podcasts /></FeatureProtectedPage>} />
                    <Route path="/podcasts/:id"    element={<FeatureProtectedPage feature="isPodcastsEnabled" featureName="Podcasts" icon="podcasts"><Podcasts /></FeatureProtectedPage>} />
                    <Route path="/articles"        element={<FeatureProtectedPage feature="isArticlesEnabled" featureName="Articles" icon="article"><Articles /></FeatureProtectedPage>} />
                    <Route path="/articles/:id"    element={<FeatureProtectedPage feature="isArticlesEnabled" featureName="Articles" icon="article"><ArticleView /></FeatureProtectedPage>} />
                    <Route path="/article-view"    element={<FeatureProtectedPage feature="isArticlesEnabled" featureName="Articles" icon="article"><ArticleView /></FeatureProtectedPage>} />
                    <Route path="/wiki"            element={<FeatureProtectedPage feature="isWikiEnabled" featureName="Wiki" icon="menu_book"><Wiki /></FeatureProtectedPage>} />
                    <Route path="/wikis"           element={<FeatureProtectedPage feature="isWikiEnabled" featureName="Wiki" icon="menu_book"><Wiki /></FeatureProtectedPage>} />
                    <Route path="/wiki/view"       element={<FeatureProtectedPage feature="isWikiEnabled" featureName="Wiki" icon="menu_book"><WikiView /></FeatureProtectedPage>} />
                    <Route path="/wiki/:id"        element={<FeatureProtectedPage feature="isWikiEnabled" featureName="Wiki" icon="menu_book"><WikiView /></FeatureProtectedPage>} />
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
                    <Route path="/posts"           element={<FeatureProtectedPage feature="isPostsEnabled" featureName="Posts" icon="dynamic_feed"><Posts /></FeatureProtectedPage>} />
                    <Route path="/posts/:id"       element={<FeatureProtectedPage feature="isPostsEnabled" featureName="Posts" icon="dynamic_feed"><Posts /></FeatureProtectedPage>} />
                    <Route path="/messages"        element={<FeatureProtectedPage feature="isMessagingEnabled" featureName="Direct Messaging" icon="chat"><Messages /></FeatureProtectedPage>} />
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
