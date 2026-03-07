import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useLangStore } from '@/store/langStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Login } from '@/pages/Login';
import { ForgotPassword } from '@/pages/ForgotPassword';
import { ResetPassword } from '@/pages/ResetPassword';
import { SetPassword } from '@/pages/SetPassword';
import { AccessControl } from '@/pages/AccessControl';
import { Overview } from '@/pages/Overview';
import { Clients } from '@/pages/Clients';
import { ClientDetails } from '@/pages/ClientDetails';
import { Tasks } from '@/pages/Tasks';
import { ScriptWorkspace } from '@/pages/ScriptWorkspace';
import { Results } from '@/pages/Results';
import { Glossary } from '@/pages/Glossary';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import { Audit } from '@/pages/Audit';
import { Scripts } from '@/pages/Scripts';
import { Certificates } from '@/pages/Certificates';
import { NotFound } from '@/pages/NotFound';

const LANG_INIT_KEY = 'raawi-lang-initialized';

function App() {
  useEffect(() => {
    if (typeof window === 'undefined' || localStorage.getItem(LANG_INIT_KEY)) return;
    const defaultLang = useSettingsStore.getState().settings?.platform?.defaultLanguage;
    if (defaultLang === 'ar' || defaultLang === 'en') {
      useLangStore.setState({ lang: defaultLang });
      document.documentElement.dir = defaultLang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = defaultLang;
    }
    localStorage.setItem(LANG_INIT_KEY, '1');
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/set-password" element={<SetPassword />} />

        {/* Protected Application Layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Overview />} />
          <Route
            path="access-control"
            element={
              <ProtectedRoute requiredPermission="manage_users">
                <AccessControl />
              </ProtectedRoute>
            }
          />
          <Route
            path="glossary"
            element={
              <ProtectedRoute requiredPermission="manage_glossary">
                <Glossary />
              </ProtectedRoute>
            }
          />
          <Route path="clients" element={
            <ProtectedRoute requiredPermission="view_clients">
              <Clients />
            </ProtectedRoute>
          } />
          <Route path="clients/:id" element={
            <ProtectedRoute requiredPermission="view_clients">
              <ClientDetails />
            </ProtectedRoute>
          } />
          <Route path="tasks" element={
            <ProtectedRoute requiredPermission="view_tasks">
              <Tasks />
            </ProtectedRoute>
          } />
          <Route path="scripts" element={
            <ProtectedRoute requiredPermission="view_scripts">
              <Scripts />
            </ProtectedRoute>
          } />
          <Route path="scripts/:id/workspace" element={
            <ProtectedRoute requiredPermission="upload_scripts">
              <ScriptWorkspace />
            </ProtectedRoute>
          } />
          <Route path="workspace/:id" element={
            <ProtectedRoute requiredPermission="upload_scripts">
              <ScriptWorkspace />
            </ProtectedRoute>
          } />
          <Route path="report/:id" element={
            <ProtectedRoute requiredSection={['reports', 'tasks', 'clients']}>
              <Results />
            </ProtectedRoute>
          } />
          <Route path="reports" element={
            <ProtectedRoute requiredPermission="view_reports">
              <Reports />
            </ProtectedRoute>
          } />
          <Route path="audit" element={
            <ProtectedRoute requiredPermission="view_audit">
              <Audit />
            </ProtectedRoute>
          } />
          <Route path="certificates" element={<Certificates />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  );
}

export { App };
