import { useState, type FormEvent } from 'react';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { authService } from '../../services/authService';
import { ApiError } from '../../data/api';
import { LanguageToggle } from '../components/LanguageToggle';
import { Logo } from '../components/Logo';

type Mode = 'login' | 'register';
type View = 'auth' | 'reset';
type RegRole = 'patient' | 'doctor' | 'finance' | 'pharmacy';

export function AuthPage() {
  const { t } = useLocale();
  const { login, registerPatient, registerDoctor, registerStaff } = useAuth();

  const [view, setView] = useState<View>('auth');
  const [mode, setMode] = useState<Mode>('login');
  const [regRole, setRegRole] = useState<RegRole>('patient');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [staffToken, setStaffToken] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);

  const usesEmail = regRole !== 'patient';

  function fail(err: unknown) {
    setError(err instanceof ApiError ? err.message : 'Unexpected error. Try again.');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(identifier, password);
      } else {
        if (password !== confirm) throw new ApiError(400, t('auth.passwordsDontMatch'));
        if (regRole === 'doctor') {
          await registerDoctor({ fullName, email, password, clinicName, doctorToken: staffToken });
        } else if (regRole === 'finance' || regRole === 'pharmacy') {
          await registerStaff({ fullName, email, password, role: regRole, staffToken });
        } else {
          if (!consent) throw new ApiError(400, t('auth.consentRequired'));
          await registerPatient({ fullName, phoneNumber: phone, password, aiConsent: consent });
        }
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-brand-50 via-white to-brand-100">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
        <header className="mb-8 flex items-center justify-between">
          <Logo withTagline />
          <LanguageToggle />
        </header>

        {view === 'reset' ? (
          <ResetFlow onBack={() => setView('auth')} />
        ) : (
          <div className="card p-6">
            <h1 className="text-2xl font-bold text-slate-800">
              {mode === 'login' ? t('auth.welcome') : t('auth.getStarted')}
            </h1>

            {/* Tabs */}
            <div className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError(null);
                  }}
                  className={`rounded-lg py-2 text-sm font-semibold transition ${
                    mode === m ? 'bg-white text-brand-700 shadow' : 'text-slate-500'
                  }`}
                >
                  {m === 'login' ? t('auth.login') : t('auth.register')}
                </button>
              ))}
            </div>

            {/* Role selector (register only) */}
            {mode === 'register' && (
              <div className="mt-4">
                <label className="label">{t('auth.registerAs')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['patient', 'doctor', 'finance', 'pharmacy'] as RegRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRegRole(r)}
                      className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                        regRole === r ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      {t(`role.${r}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="label">{t('auth.fullName')}</label>
                  <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}

              {mode === 'register' && !usesEmail && (
                <div>
                  <label className="label">{t('auth.phone')}</label>
                  <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2507…" required />
                </div>
              )}

              {mode === 'register' && usesEmail && (
                <>
                  <div>
                    <label className="label">{t('auth.email')}</label>
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  {regRole === 'doctor' && (
                    <div>
                      <label className="label">{t('auth.clinicName')}</label>
                      <input className="input" value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
                    </div>
                  )}
                  <div>
                    <label className="label">
                      {regRole === 'doctor' ? t('auth.doctorToken') : t('auth.staffToken')}
                    </label>
                    <input className="input" value={staffToken} onChange={(e) => setStaffToken(e.target.value)} required />
                  </div>
                </>
              )}

              {mode === 'login' && (
                <div>
                  <label className="label">{t('auth.identifier')}</label>
                  <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
                </div>
              )}

              <div>
                <label className="label">{t('auth.password')}</label>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              {mode === 'register' && (
                <div>
                  <label className="label">{t('auth.confirmPassword')}</label>
                  <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </div>
              )}

              {mode === 'register' && regRole === 'patient' && (
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>{t('auth.consentText')}</span>
                </label>
              )}

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? t('common.loading') : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between text-sm">
              <button className="text-brand-600 hover:underline" onClick={() => setView('reset')}>
                {t('auth.forgotPassword')}
              </button>
              <button
                className="text-slate-500 hover:underline"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResetFlow({ onBack }: { onBack: () => void }) {
  const { t } = useLocale();
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await authService.requestPasswordReset(identifier);
      setDevOtp(res.devOtp ?? null);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authService.confirmPasswordReset(identifier, otp, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6">
      <h1 className="text-2xl font-bold text-slate-800">{t('reset.title')}</h1>

      {done ? (
        <>
          <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{t('reset.success')}</p>
          <button className="btn-primary mt-5 w-full" onClick={onBack}>
            {t('reset.backToLogin')}
          </button>
        </>
      ) : step === 1 ? (
        <form onSubmit={sendCode} className="mt-4 space-y-4">
          <p className="text-sm text-slate-500">{t('reset.enterIdentifier')}</p>
          <div>
            <label className="label">{t('auth.identifier')}</label>
            <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? t('common.loading') : t('reset.sendCode')}
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="mt-4 space-y-4">
          {devOtp && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {t('reset.offlineNotice')} <span className="font-mono font-bold">{devOtp}</span>
            </p>
          )}
          <div>
            <label className="label">{t('reset.otp')}</label>
            <input className="input tracking-[0.5em]" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} required />
          </div>
          <div>
            <label className="label">{t('reset.newPassword')}</label>
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? t('common.loading') : t('reset.confirm')}
          </button>
        </form>
      )}

      {!done && (
        <button className="mt-4 text-sm text-slate-500 hover:underline" onClick={onBack}>
          {t('reset.backToLogin')}
        </button>
      )}
    </div>
  );
}
