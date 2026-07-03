import { useEffect, useState } from 'react';
import type { Consultation, Vital } from '../../data/types';
import { clinicalService } from '../../services/clinicalService';
import { useLocale } from '../../state/LocaleProvider';

/**
 * Floating patient-summary panel for the doctor. A person-icon button sits on
 * the right edge, in front of the dashboard; tapping it slides in a compact
 * "Patient Summary" card (demographics, presenting complaint, safety flags and
 * the latest recorded vital signs) so the doctor has key context at a glance.
 */
export function PatientSummary({ consultation }: { consultation: Consultation }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [loading, setLoading] = useState(false);

  const patientId = consultation.patientId;

  useEffect(() => {
    if (!open || !patientId) return;
    let active = true;
    setLoading(true);
    clinicalService
      .listVitals(patientId)
      .then((v) => {
        if (active) setVitals(v);
      })
      .catch(() => {
        if (active) setVitals([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, patientId, consultation.id]);

  const latest = vitals[0] ?? null;

  function genderLabel(sex: string | null): string {
    if (sex === 'male') return t('triage.sex.male');
    if (sex === 'female') return t('triage.sex.female');
    return sex ?? '—';
  }

  return (
    <>
      {/* Floating person-icon button (right edge, in front of everything) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`fixed right-5 top-1/2 z-40 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-lg transition hover:scale-105 ${
          open ? 'bg-slate-700' : 'bg-blue-600 hover:bg-blue-700'
        }`}
        title={t('summary.title')}
        aria-label={t('summary.title')}
      >
        {open ? (
          <span className="text-lg">✕</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.76-3.58-5-8-5Z" />
          </svg>
        )}
      </button>

      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />}

      {/* Slide-in panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-slate-50 shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-xl font-bold text-slate-800">{t('summary.title')}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Demographics */}
          <section className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-600">
              <span>🪪</span> {t('summary.demographics')}
            </h3>
            <dl className="space-y-2 text-sm">
              <Row label={t('summary.name')} value={consultation.patientName ?? '—'} />
              <Row label={t('summary.gender')} value={genderLabel(consultation.biologicalSex)} />
              <Row label={t('summary.phone')} value={consultation.patientPhone ?? '—'} />
            </dl>
          </section>

          {/* Latest vital signs */}
          <section className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-600">
              <span>💓</span> {t('summary.vitals')}
            </h3>
            {loading ? (
              <p className="text-sm text-slate-400">{t('common.loading')}</p>
            ) : latest ? (
              <>
                <dl className="space-y-2 text-sm">
                  {latest.systolic != null && latest.diastolic != null && (
                    <Row label={t('summary.bp')} value={`${latest.systolic}/${latest.diastolic} mmHg`} />
                  )}
                  {latest.heartRate != null && (
                    <Row label={t('vitals.heartRate')} value={`${latest.heartRate} bpm`} />
                  )}
                  {latest.temperature != null && (
                    <Row label={t('vitals.temperature')} value={`${latest.temperature} °C`} />
                  )}
                  {latest.weight != null && (
                    <Row label={t('vitals.weight')} value={`${latest.weight} kg`} />
                  )}
                  {latest.bloodSugar != null && (
                    <Row label={t('vitals.bloodSugar')} value={`${latest.bloodSugar} mmol/L`} />
                  )}
                  {latest.spo2 != null && <Row label={t('vitals.spo2')} value={`${latest.spo2}%`} />}
                </dl>
                <p className="mt-3 text-[11px] text-slate-400">
                  {t('summary.recorded')}: {new Date(latest.createdAt).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">{t('summary.noVitals')}</p>
            )}
          </section>

          {/* Presenting complaint */}
          <section className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-600">
              <span>📋</span> {t('summary.complaint')}
            </h3>
            <dl className="space-y-2 text-sm">
              <Row label={t('triage.category')} value={consultation.symptomCategory ?? '—'} />
              <Row label={t('summary.severity')} value={consultation.severity ?? '—'} />
              <Row label={t('summary.duration')} value={consultation.duration ?? '—'} />
              <Row label={t('summary.urgency')} value={t(`urgency.${consultation.urgency}`)} />
            </dl>
            {consultation.symptomDescription && (
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                {consultation.symptomDescription}
              </p>
            )}
          </section>

          {/* Safety flags */}
          {(consultation.patientAllergies || consultation.patientChronic) && (
            <section className="card border border-red-200 bg-red-50 p-5">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-red-700">
                <span>⚠️</span> {t('summary.safety')}
              </h3>
              <dl className="space-y-1 text-sm text-red-800">
                {consultation.patientAllergies && (
                  <Row label={t('flags.allergy')} value={consultation.patientAllergies} />
                )}
                {consultation.patientChronic && (
                  <Row label={t('flags.chronic')} value={consultation.patientChronic} />
                )}
              </dl>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
