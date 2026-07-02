import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SYMPTOM_CATEGORIES } from '../../data/symptomCategories';
import { clearTriageDraft, loadTriageDraft, saveTriageDraft } from '../../data/triageDraft';
import type { TriageDraft } from '../../data/types';
import { consultationService } from '../../services/consultationService';
import { useLocale } from '../../state/LocaleProvider';
import { AppShell } from '../components/AppShell';
import { StatusTracker } from '../components/StatusTracker';
import { TriageChatbot } from '../components/TriageChatbot';
import { useAuth } from '../../state/AuthProvider';
import { ApiError } from '../../data/api';

const SEX_OPTIONS = ['male', 'female'];
const SEVERITY_OPTIONS = ['mild', 'moderate', 'severe'];
const DURATION_OPTIONS = ['today', 'few_days', 'week_plus', 'month_plus'];

type TriageMode = 'form' | 'chat';

export function TriagePage() {
  const { t, language } = useLocale();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<TriageMode>('chat');
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<TriageDraft>(() => loadTriageDraft() ?? { step: 1 });
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveTriageDraft({ ...draft, step });
  }, [draft, step]);

  const categories = useMemo(() => {
    const q = search.toLowerCase();
    return SYMPTOM_CATEGORIES.filter((c) => {
      const label = language === 'rw' ? c.rw : c.en;
      return label.toLowerCase().includes(q) || c.id.includes(q);
    });
  }, [search, language]);

  function update(patch: Partial<TriageDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.biologicalSex || !draft.severity || !draft.duration || !draft.symptomCategory || !draft.symptomDescription) {
      setError(t('triage.incomplete'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cat = SYMPTOM_CATEGORIES.find((c) => c.id === draft.symptomCategory);
      const label = cat ? (language === 'rw' ? cat.rw : cat.en) : draft.symptomCategory;
      const c = await consultationService.submitTriage({
        biologicalSex: draft.biologicalSex,
        severity: draft.severity,
        duration: draft.duration,
        symptomCategory: label,
        symptomDescription: draft.symptomDescription,
        language,
      });
      clearTriageDraft();
      navigate(`/patient/booking/${c.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell onLogout={() => logout()}>
      <main className="mx-auto max-w-lg px-4 py-6">
        <StatusTracker hasTriage={false} />
        <h1 className="mt-6 text-2xl font-bold text-slate-800">{t('triage.title')}</h1>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === 'chat' ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
            onClick={() => setMode('chat')}
          >
            🤖 {t('ai.triageModeChat')}
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === 'form' ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
            onClick={() => setMode('form')}
          >
            📋 {t('ai.triageModeForm')}
          </button>
        </div>

        {mode === 'chat' ? (
          <div className="mt-4">
            <TriageChatbot onSubmitted={(id) => navigate(`/patient/booking/${id}`)} />
          </div>
        ) : (
          <>
        <p className="text-sm text-slate-500">
          {t('triage.step')} {step}/6
        </p>

        <div className="card mt-4 p-5">
          {step === 1 && (
            <Step title={t('triage.sex')}>
              <div className="grid grid-cols-2 gap-3">
                {SEX_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={`rounded-xl border-2 p-4 font-semibold ${draft.biologicalSex === o ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200'}`}
                    onClick={() => update({ biologicalSex: o })}
                  >
                    {t(`triage.sex.${o}`)}
                  </button>
                ))}
              </div>
            </Step>
          )}
          {step === 2 && (
            <Step title={t('triage.severity')}>
              <div className="space-y-2">
                {SEVERITY_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={`w-full rounded-xl border-2 p-3 text-left font-medium ${draft.severity === o ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                    onClick={() => update({ severity: o })}
                  >
                    {t(`triage.severity.${o}`)}
                  </button>
                ))}
              </div>
            </Step>
          )}
          {step === 3 && (
            <Step title={t('triage.duration')}>
              <div className="space-y-2">
                {DURATION_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className={`w-full rounded-xl border-2 p-3 text-left font-medium ${draft.duration === o ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                    onClick={() => update({ duration: o })}
                  >
                    {t(`triage.duration.${o}`)}
                  </button>
                ))}
              </div>
            </Step>
          )}
          {step === 4 && (
            <Step title={t('triage.category')}>
              <input
                className="input mb-3"
                placeholder={t('triage.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`rounded-xl border-2 p-3 text-left text-sm font-medium ${draft.symptomCategory === c.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                    onClick={() => update({ symptomCategory: c.id })}
                  >
                    {language === 'rw' ? c.rw : c.en}
                  </button>
                ))}
              </div>
            </Step>
          )}
          {step === 5 && (
            <Step title={t('triage.description')}>
              <textarea
                className="input min-h-[120px]"
                value={draft.symptomDescription ?? ''}
                onChange={(e) => update({ symptomDescription: e.target.value })}
                placeholder={t('triage.descriptionPlaceholder')}
              />
            </Step>
          )}
          {step === 6 && (
            <Step title={t('triage.review')}>
              <dl className="space-y-2 text-sm">
                <Row label={t('triage.sex')} value={draft.biologicalSex ? t(`triage.sex.${draft.biologicalSex}`) : ''} />
                <Row label={t('triage.severity')} value={draft.severity ? t(`triage.severity.${draft.severity}`) : ''} />
                <Row label={t('triage.duration')} value={draft.duration ? t(`triage.duration.${draft.duration}`) : ''} />
                <Row label={t('triage.category')} value={draft.symptomCategory ?? ''} />
                <Row label={t('triage.description')} value={draft.symptomDescription ?? ''} />
              </dl>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <button className="btn-primary mt-4 w-full" disabled={busy} onClick={submit}>
                {busy ? t('common.loading') : t('triage.submit')}
              </button>
            </Step>
          )}

          {step < 6 && (
            <div className="mt-6 flex gap-3">
              {step > 1 && (
                <button className="btn-ghost flex-1" onClick={() => setStep((s) => s - 1)}>
                  {t('common.back')}
                </button>
              )}
              <button
                className="btn-primary flex-1"
                onClick={() => setStep((s) => s + 1)}
                disabled={
                  (step === 1 && !draft.biologicalSex) ||
                  (step === 2 && !draft.severity) ||
                  (step === 3 && !draft.duration) ||
                  (step === 4 && !draft.symptomCategory) ||
                  (step === 5 && !draft.symptomDescription?.trim())
                }
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </div>
          </>
        )}
        <button className="mt-4 text-sm text-slate-500 hover:underline" onClick={() => navigate('/patient')}>
          {t('triage.backDashboard')}
        </button>
      </main>
    </AppShell>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
