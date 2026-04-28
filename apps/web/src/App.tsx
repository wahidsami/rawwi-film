import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import { QuickAnalysis } from '@/pages/QuickAnalysis';
import { ClientLanding } from '@/pages/ClientLanding';
import { ClientRegister } from '@/pages/ClientRegister';
import { ClientPortal } from '@/pages/ClientPortal';
import { ClientSubmissions } from '@/pages/ClientSubmissions';
import { ENABLE_QUICK_ANALYSIS } from '@/lib/env';
import { Landing } from '@/pages/Landing';

const LANG_INIT_KEY = 'raawi-lang-initialized';

function LegacyAdminRedirect() {
  const location = useLocation();
  return <Navigate to={`/app${location.pathname}${location.search}`} replace />;
}

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
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/set-password" element={<SetPassword />} />
        <Route path="/portal" element={<ClientLanding />} />
        <Route path="/portal/register" element={<ClientRegister />} />
        <Route
          path="/client"
          element={
            <ProtectedRoute requiredUserType="client">
              <ClientPortal />
            </ProtectedRoute>
          }
        />

        {/* Protected Application Layout */}
        <Route
          path="/app"
          element={
            <ProtectedRoute requiredUserType="admin">
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
          <Route path="client-submissions" element={
            <ProtectedRoute requiredUserType="admin" requiredPermission="view_scripts">
              <ClientSubmissions />
            </ProtectedRoute>
          } />
          {ENABLE_QUICK_ANALYSIS && (
            <Route path="quick-analysis" element={
              <ProtectedRoute>
                <QuickAnalysis />
              </ProtectedRoute>
            } />
          )}
          <Route path="scripts/:id/workspace" element={
            <ProtectedRoute>
              <ScriptWorkspace />
            </ProtectedRoute>
          } />
          <Route path="workspace/:id" element={
            <ProtectedRoute>
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

        {/* Legacy admin URLs kept for compatibility after moving the app under /app */}
        <Route path="/access-control" element={<LegacyAdminRedirect />} />
        <Route path="/glossary" element={<LegacyAdminRedirect />} />
        <Route path="/clients" element={<LegacyAdminRedirect />} />
        <Route path="/clients/:id" element={<LegacyAdminRedirect />} />
        <Route path="/tasks" element={<LegacyAdminRedirect />} />
        <Route path="/scripts" element={<LegacyAdminRedirect />} />
        <Route path="/client-submissions" element={<LegacyAdminRedirect />} />
        {ENABLE_QUICK_ANALYSIS && <Route path="/quick-analysis" element={<LegacyAdminRedirect />} />}
        <Route path="/scripts/:id/workspace" element={<LegacyAdminRedirect />} />
        <Route path="/workspace/:id" element={<LegacyAdminRedirect />} />
        <Route path="/report/:id" element={<LegacyAdminRedirect />} />
        <Route path="/reports" element={<LegacyAdminRedirect />} />
        <Route path="/audit" element={<LegacyAdminRedirect />} />
        <Route path="/certificates" element={<LegacyAdminRedirect />} />
        <Route path="/settings" element={<LegacyAdminRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export { App };
