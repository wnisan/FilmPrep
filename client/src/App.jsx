import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuthStore } from './store/authStore.js';
import { RequireAuth } from './components/RequireAuth.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { GoogleAuthCallbackPage } from './pages/GoogleAuthCallbackPage.jsx';
import { CatalogPage } from './pages/CatalogPage.jsx';
import { MediaDetailPage } from './pages/MediaDetailPage.jsx';
import { QuizPage } from './pages/QuizPage.jsx';
import { ProgressPage } from './pages/ProgressPage.jsx';
import { AdminMediaPage } from './pages/AdminMediaPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage.jsx';
import { CommunityPage } from './pages/CommunityPage.jsx';
import { DictionaryPage } from './pages/DictionaryPage.jsx';
import { MyFilmsPage } from './pages/MyFilmsPage.jsx';
import { MyFilmEditorPage } from './pages/MyFilmEditorPage.jsx';

/** Profiles used to live at /u/<name>. */
function OldProfileLink() {
  const { username } = useParams();
  return <Navigate to={`/profile/${username}`} replace />;
}

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/auth/callback" element={<GoogleAuthCallbackPage />} />
      <Route
        path="/catalog"
        element={
          <RequireAuth>
            <CatalogPage />
          </RequireAuth>
        }
      />
      <Route
        path="/media/:id"
        element={
          <RequireAuth>
            <MediaDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/media/:id/quiz"
        element={
          <RequireAuth>
            <QuizPage />
          </RequireAuth>
        }
      />
      <Route
        path="/my-films"
        element={
          <RequireAuth>
            <MyFilmsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/my-films/new"
        element={
          <RequireAuth>
            <MyFilmEditorPage />
          </RequireAuth>
        }
      />
      <Route
        path="/my-films/:id"
        element={
          <RequireAuth>
            <MyFilmEditorPage />
          </RequireAuth>
        }
      />
      <Route
        path="/dictionary"
        element={
          <RequireAuth>
            <DictionaryPage />
          </RequireAuth>
        }
      />
      <Route
        path="/progress"
        element={
          <RequireAuth>
            <ProgressPage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile/:username"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route path="/u/:username" element={<OldProfileLink />} />
      <Route
        path="/profile/edit"
        element={
          <RequireAuth>
            <ProfileSettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/community"
        element={
          <RequireAuth>
            <CommunityPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/media"
        element={
          <RequireAuth roles={['admin']}>
            <AdminMediaPage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
