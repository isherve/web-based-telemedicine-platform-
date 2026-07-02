import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/AuthProvider';
import { useLocale } from './state/LocaleProvider';
import { AuthPage } from './presentation/pages/AuthPage';
import { PatientDashboard } from './presentation/pages/PatientDashboard';
import { DoctorDashboard } from './presentation/pages/DoctorDashboard';
import { FinanceDashboard } from './presentation/pages/FinanceDashboard';
import { PharmacyDashboard } from './presentation/pages/PharmacyDashboard';
import { TriagePage } from './presentation/pages/TriagePage';
import { BookingPage } from './presentation/pages/BookingPage';
import type { Role } from './data/types';

const HOME_BY_ROLE: Record<Role, string> = {
  patient: '/patient',
  doctor: '/doctor',
  finance: '/finance',
  pharmacy: '/pharmacy',
};

export default function App() {
  const { loading, isAuthenticated, role } = useAuth();
  const { t } = useLocale();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        {t('common.loading')}
      </div>
    );
  }

  const home = role ? HOME_BY_ROLE[role] : '/';

  const guard = (allowed: Role, element: React.ReactNode) =>
    isAuthenticated && role === allowed ? element : <Navigate to="/" replace />;

  return (
    <Routes>
      <Route
        path="/"
        element={!isAuthenticated ? <AuthPage /> : <Navigate to={home} replace />}
      />
      <Route path="/patient" element={guard('patient', <PatientDashboard />)} />
      <Route path="/patient/triage" element={guard('patient', <TriagePage />)} />
      <Route path="/patient/booking/:id" element={guard('patient', <BookingPage />)} />
      <Route path="/doctor" element={guard('doctor', <DoctorDashboard />)} />
      <Route path="/finance" element={guard('finance', <FinanceDashboard />)} />
      <Route path="/pharmacy" element={guard('pharmacy', <PharmacyDashboard />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
