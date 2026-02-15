import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';
import { ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string; // LEGACY: Will be deprecated
  requiredSection?: string | string[]; // NEW: Preferred method (string or array of allowed sections)
}

export function ProtectedRoute({ children, requiredPermission, requiredSection }: ProtectedRouteProps) {
  const { isAuthenticated, hasPermission, hasSection, authReady } = useAuthStore();
  const { t } = useLangStore();
  const location = useLocation();

  if (!authReady) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // NEW: Check section access first (preferred)
  // If requiredSection is array, allow if user has ANY of them.
  // If string, check normally.
  if (requiredSection) {
    const sections = Array.isArray(requiredSection) ? requiredSection : [requiredSection];
    const hasAccess = sections.some(section => hasSection(section));

    if (!hasAccess) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-text-main">{t('accessDenied')}</h1>
            <p className="text-text-muted">You do not have access to this section.</p>
          </div>
          <Button onClick={() => window.history.back()} variant="outline">
            {t('backToHome')}
          </Button>
        </div>
      );
    }
  }

  // LEGACY: Check permission access (backward compatibility)
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-text-main">{t('accessDenied')}</h1>
          <p className="text-text-muted">You do not have the required permissions to view this page.</p>
        </div>
        <Button onClick={() => window.history.back()} variant="outline">
          {t('backToHome')}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
