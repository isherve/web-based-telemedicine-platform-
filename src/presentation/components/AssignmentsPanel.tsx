import { useCallback, useEffect, useState } from 'react';
import type { AssignmentConsultation, AssignmentSuggestion, DoctorCandidate } from '../../data/types';
import { assignmentService } from '../../services/assignmentService';
import { ApiError } from '../../data/api';
import { useLocale } from '../../state/LocaleProvider';
import { URGENCY_STYLE } from '../theme';

/**
 * Coordinator view: distribute waiting/active patients to doctors. The AI reads
 * each doctor's schedule + live workload + rating and recommends the best match;
 * staff can accept the AI pick (auto-assign) or choose a doctor manually.
 */
export function AssignmentsPanel() {
  const { t, language } = useLocale();
  const [consultations, setConsultations] = useState<AssignmentConsultation[]>([]);
  const [candidates, setCandidates] = useState<DoctorCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<AssignmentSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const lang = language;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([
        assignmentService.consultations().catch(() => []),
        assignmentService.candidates().catch(() => []),
      ]);
      setConsultations(c);
      setCandidates(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openSuggestion(id: string) {
    if (openId === id) {
      setOpenId(null);
      setSuggestion(null);
      return;
    }
    setOpenId(id);
    setSuggestion(null);
    setMsg(null);
    setBusy(true);
    try {
      setSuggestion(await assignmentService.suggest(id, lang));
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : t('common.error') });
    } finally {
      setBusy(false);
    }
  }

  async function assign(id: string, doctorId: string) {
    setBusy(true);
    setMsg(null);
    try {
      await assignmentService.assign(id, doctorId);
      setMsg({ ok: true, text: t('assign.assigned') });
      setOpenId(null);
      setSuggestion(null);
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : t('common.error') });
    } finally {
      setBusy(false);
    }
  }

  async function auto(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await assignmentService.auto(id, lang);
      setMsg({ ok: true, text: res.suggestion.summary });
      setOpenId(null);
      setSuggestion(null);
      await refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : t('common.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      {/* On-duty roster */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">{t('assign.roster')}</h3>
          <button className="text-xs font-semibold text-brand-600" onClick={refresh}>
            {t('common.refresh')}
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">{t('assign.rosterDesc')}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {candidates.length === 0 && (
            <p className="text-sm text-slate-400">{t('assign.noDoctors')}</p>
          )}
          {candidates.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-700">{c.fullName ?? '—'}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.onDuty
                      ? 'bg-emerald-100 text-emerald-700'
                      : c.availableToday
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {c.onDuty ? t('assign.onDuty') : c.availableToday ? t('assign.availableToday') : t('assign.offDuty')}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {c.todayOpen && c.todayClose && (
                  <span>
                    🕒 {c.todayOpen}–{c.todayClose}
                  </span>
                )}
                <span>
                  📋 {c.activeLoad} {t('assign.active')} · {c.waitingLoad} {t('assign.waiting')}
                </span>
                {c.avgRating != null && <span>⭐ {c.avgRating.toFixed(1)}</span>}
                <span className="font-semibold text-brand-600">{t('assign.score')}: {c.score}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-xl p-3 text-sm ${
            msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Consultations to distribute */}
      <div className="space-y-3">
        <h3 className="font-semibold text-slate-700">{t('assign.queue')}</h3>
        {loading ? (
          <p className="card p-6 text-center text-slate-500">{t('common.loading')}</p>
        ) : consultations.length === 0 ? (
          <p className="card p-6 text-center text-slate-500">{t('assign.emptyQueue')}</p>
        ) : (
          consultations.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-slate-700">{c.patientName ?? '—'}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${URGENCY_STYLE[c.urgency] ?? URGENCY_STYLE.low}`}
                    >
                      {t(`urgency.${c.urgency}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {c.symptomCategory ?? '—'} · {t('assign.currentDoctor')}: {c.doctorName ?? t('assign.unassigned')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => auto(c.id)}
                    disabled={busy}
                  >
                    {t('assign.autoAssign')}
                  </button>
                  <button
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    onClick={() => openSuggestion(c.id)}
                    disabled={busy}
                  >
                    {openId === c.id ? t('common.close') : t('assign.chooseDoctor')}
                  </button>
                </div>
              </div>

              {openId === c.id && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  {busy && !suggestion ? (
                    <p className="text-sm text-slate-500">{t('assign.thinking')}</p>
                  ) : suggestion ? (
                    <>
                      <div className="rounded-lg bg-brand-50 p-3 text-sm text-slate-700">
                        <span className="font-semibold text-brand-600">🤖 {t('assign.aiPick')}: </span>
                        {suggestion.summary}
                      </div>
                      <div className="mt-3 space-y-2">
                        {suggestion.candidates.map((cand) => (
                          <div
                            key={cand.id}
                            className="flex items-center justify-between rounded-lg bg-white p-2.5 ring-1 ring-slate-100"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-slate-700">
                                  {cand.fullName ?? '—'}
                                </p>
                                {cand.id === suggestion.recommendedDoctorId && (
                                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                                    {t('assign.recommended')}
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-slate-500">
                                {cand.reasons.join(' · ')}
                              </p>
                            </div>
                            <button
                              className="ml-2 shrink-0 rounded-lg bg-brand-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                              onClick={() => assign(c.id, cand.id)}
                              disabled={busy}
                            >
                              {t('assign.assign')}
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
