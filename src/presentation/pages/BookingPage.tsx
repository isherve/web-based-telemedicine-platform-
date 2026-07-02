import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { appointmentService, scheduleService } from '../../services/platformService';
import { useLocale } from '../../state/LocaleProvider';
import { useAuth } from '../../state/AuthProvider';
import { AppShell } from '../components/AppShell';
import { ApiError } from '../../data/api';

export function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocale();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [dates, setDates] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    scheduleService.getAvailableDates().then(setDates).catch(() => setDates([]));
  }, []);

  async function book() {
    if (!id || !selected) return;
    setBusy(true);
    setError(null);
    try {
      await appointmentService.book({ consultationId: id, requestedDate: selected, notes });
      navigate('/patient');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell onLogout={() => logout()}>
      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-800">{t('booking.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('booking.subtitle')}</p>

        <div className="card mt-6 p-5">
          <p className="mb-3 text-sm font-medium text-slate-600">{t('booking.pickDate')}</p>
          {dates.length === 0 ? (
            <p className="text-sm text-amber-600">{t('booking.noDates')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`rounded-xl border-2 p-3 text-sm font-medium ${selected === d ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                  onClick={() => setSelected(d)}
                >
                  {new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4">
            <label className="label">{t('booking.notes')}</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="btn-primary mt-4 w-full" disabled={busy || !selected} onClick={book}>
            {busy ? t('common.loading') : t('booking.confirm')}
          </button>
        </div>
      </main>
    </AppShell>
  );
}
