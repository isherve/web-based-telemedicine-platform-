import { useCallback, useEffect, useState } from 'react';
import type {
  Appointment,
  Consultation,
  DoctorAnalytics,
  DoctorRatings,
  DoctorSchedule,
  DoctorStats,
  FollowUp,
  PatientHistory,
  RegularPatient,
  Urgency,
} from '../../data/types';
import { consultationService } from '../../services/consultationService';
import {
  appointmentService,
  documentService,
  followUpService,
  scheduleService,
} from '../../services/platformService';
import { uploadFile } from '../../services/messageService';
import { generateClinicalPdf } from '../../services/pdfService';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { AppShell } from '../components/AppShell';
import { ProfilePanel } from '../components/ProfilePanel';
import { ChatPanel } from '../components/ChatPanel';
import { joinUser, useSocketEvent } from '../../hooks/useSocket';

type Tab =
  | 'awaiting'
  | 'active'
  | 'complete'
  | 'patients'
  | 'analytics'
  | 'followups'
  | 'bookings'
  | 'schedule'
  | 'tariff'
  | 'profile';

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const URGENCY_STYLES: Record<Urgency, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-500',
};

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const { t } = useLocale();
  if (urgency === 'low') return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${URGENCY_STYLES[urgency]}`}>
      {urgency === 'high' ? '🚨 ' : ''}
      {t(`urgency.${urgency}`)}
    </span>
  );
}

export function DoctorDashboard() {
  const { profile, logout } = useAuth();
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>('awaiting');
  const [stats, setStats] = useState<DoctorStats | null>(null);
  const [awaiting, setAwaiting] = useState<Consultation[]>([]);
  const [active, setActiveList] = useState<Consultation[]>([]);
  const [complete, setComplete] = useState<Consultation[]>([]);
  const [patients, setPatients] = useState<RegularPatient[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [bookings, setBookings] = useState<Appointment[]>([]);
  const [schedule, setSchedule] = useState<DoctorSchedule[]>([]);
  const [selected, setSelected] = useState<Consultation | null>(null);
  const [verifyTxn, setVerifyTxn] = useState('');
  const [followMsg, setFollowMsg] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState<PatientHistory | null>(null);

  const refresh = useCallback(async () => {
    const [st, aw, ac, co, pa, fu, bk, sch] = await Promise.all([
      consultationService.getStats(),
      consultationService.listDoctor('pending_payment'),
      consultationService.listDoctor('in_process'),
      consultationService.listDoctor('complete'),
      consultationService.getRegularPatients(),
      followUpService.listDoctor(),
      appointmentService.listDoctor(),
      scheduleService.get(),
    ]);
    setStats(st);
    setAwaiting(aw);
    setActiveList(ac);
    setComplete(co);
    setPatients(pa);
    setFollowUps(fu);
    setBookings(bk);
    setSchedule(sch);
  }, []);

  useEffect(() => {
    if (profile) joinUser(profile.id);
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [profile, refresh]);

  useSocketEvent<Consultation>('consultation:updated', () => refresh());

  const list =
    tab === 'awaiting' ? awaiting : tab === 'active' ? active : tab === 'complete' ? complete : [];
  const filtered = list.filter(
    (c) =>
      !search ||
      c.patientName?.toLowerCase().includes(search.toLowerCase()) ||
      c.patientPhone?.includes(search)
  );

  async function verifyPayment() {
    if (!selected || !verifyTxn) return;
    await consultationService.verifyPayment(selected.id, verifyTxn);
    setVerifyTxn('');
    refresh();
  }

  async function markComplete() {
    if (!selected) return;
    await consultationService.markComplete(selected.id);
    refresh();
  }

  async function createDoc(kind: 'prescription' | 'transfer') {
    if (!selected) return;
    const blob = await generateClinicalPdf({
      kind,
      patientName: selected.patientName ?? 'Patient',
      doctorName: profile?.fullName ?? 'Doctor',
      clinicName: profile?.clinicName ?? 'Gara Clinic',
      date: new Date().toLocaleDateString(),
      notes: docNotes || (kind === 'prescription' ? 'Take as directed.' : 'Refer to specialist.'),
    });
    const url = await uploadFile(blob, `${kind}.pdf`);
    await documentService.create(selected.id, { documentKind: kind, pdfStorageUrl: url });
    setDocNotes('');
  }

  async function sendFollowUp() {
    if (!selected || !followMsg) return;
    await followUpService.send(selected.id, followMsg);
    setFollowMsg('');
    refresh();
  }

  async function openHistory(patientId: string) {
    try {
      setHistory(await consultationService.getPatientHistory(patientId));
    } catch {
      setHistory(null);
    }
  }

  async function saveSchedule() {
    const slots = [1, 2, 3, 4, 5, 6, 7].map((dow) => {
      const s = schedule.find((x) => x.dayOfWeek === dow);
      return {
        dayOfWeek: dow,
        openTime: s?.openTime ?? '08:00',
        closeTime: s?.closeTime ?? '17:00',
        isAvailable: s?.isAvailable ?? dow <= 5,
        slotDurationMinutes: s?.slotDurationMinutes ?? 30,
      };
    });
    await scheduleService.save(slots);
    refresh();
  }

  return (
    <AppShell onLogout={() => logout()}>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('dashboard.doctor')}</h1>
            <p className="text-sm text-slate-500">{profile?.fullName} · {profile?.clinicName}</p>
          </div>
          {stats && (
            <div className="flex gap-4 text-sm">
              <Stat label={t('doctor.today')} value={`${stats.todayIncome} RWF`} />
              <Stat label={t('doctor.month')} value={`${stats.monthIncome} RWF`} />
              <Stat label={t('doctor.patients')} value={String(stats.confirmedPatients)} />
            </div>
          )}
        </div>

        <input
          className="input mt-4 max-w-md"
          placeholder={t('doctor.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {(
            ['awaiting', 'active', 'complete', 'patients', 'analytics', 'followups', 'bookings', 'schedule', 'tariff', 'profile'] as Tab[]
          ).map((tb) => (
            <button
              key={tb}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${tab === tb ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
              onClick={() => {
                setTab(tb);
                setSelected(null);
              }}
            >
              {t(`doctor.tab.${tb}`)}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            {tab === 'patients' &&
              patients.map((p) => (
                <div key={p.id} className="card flex items-center justify-between p-4 text-sm">
                  <div>
                    <p className="font-semibold">{p.fullName}</p>
                    <p className="text-slate-500">{p.phoneNumber} · {p.visitCount} visits</p>
                  </div>
                  <button className="btn-ghost px-3 py-1 text-xs" onClick={() => openHistory(p.id)}>
                    {t('history.view')}
                  </button>
                </div>
              ))}
            {tab === 'analytics' && <AnalyticsPanel />}
            {tab === 'followups' &&
              followUps.map((f) => (
                <div key={f.id} className="card p-4 text-sm">
                  <p className="font-medium">{f.patientName}</p>
                  <p className="text-slate-600">{f.doctorMessage}</p>
                  {f.patientReply && <p className="mt-1 text-brand-700">{f.patientReply}</p>}
                </div>
              ))}
            {tab === 'bookings' &&
              bookings.map((b) => (
                <div key={b.id} className="card flex items-center justify-between p-4 text-sm">
                  <div>
                    <p className="font-semibold">{b.patientName}</p>
                    <p className="text-slate-500">{b.requestedDate}</p>
                  </div>
                  <div className="flex gap-1">
                    {(['confirmed', 'declined'] as const).map((s) => (
                      <button
                        key={s}
                        className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium"
                        onClick={() => appointmentService.updateStatus(b.id, s).then(refresh)}
                      >
                        {t(`appointment.${s}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            {tab === 'schedule' && (
              <div className="card p-4">
                <h3 className="font-semibold">{t('schedule.title')}</h3>
                <div className="mt-3 space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
                    const slot = schedule.find((s) => s.dayOfWeek === dow);
                    const isAvailable = slot?.isAvailable ?? dow <= 5;
                    const openTime = slot?.openTime ?? '08:00';
                    const closeTime = slot?.closeTime ?? '17:00';
                    const update = (patch: Partial<DoctorSchedule>) => {
                      const base: DoctorSchedule = {
                        id: slot?.id ?? `new-${dow}`,
                        doctorId: profile!.id,
                        dayOfWeek: dow,
                        openTime,
                        closeTime,
                        isAvailable,
                        slotDurationMinutes: slot?.slotDurationMinutes ?? 30,
                        ...patch,
                      };
                      setSchedule([...schedule.filter((s) => s.dayOfWeek !== dow), base]);
                    };
                    return (
                      <div key={dow} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-10 font-medium">{DAY_NAMES[dow]}</span>
                        <input type="checkbox" checked={isAvailable} onChange={(e) => update({ isAvailable: e.target.checked })} />
                        <input className="input w-24 py-1" type="time" value={openTime} onChange={(e) => update({ openTime: e.target.value })} />
                        <span>–</span>
                        <input className="input w-24 py-1" type="time" value={closeTime} onChange={(e) => update({ closeTime: e.target.value })} />
                      </div>
                    );
                  })}
                </div>
                <button className="btn-primary mt-4" onClick={saveSchedule}>
                  {t('common.save')}
                </button>
              </div>
            )}
            {tab === 'tariff' && <TariffSettings />}
            {tab === 'profile' && <ProfilePanel />}
            {['awaiting', 'active', 'complete'].includes(tab) &&
              (filtered.length === 0 ? (
                <p className="text-sm text-slate-500">{t('doctor.empty')}</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    className={`card w-full p-4 text-left ${selected?.id === c.id ? 'ring-2 ring-brand-500' : ''}`}
                    onClick={() => {
                      setSelected(c);
                      setVerifyTxn(c.momoTransactionId ?? '');
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{c.patientName ?? 'Patient'}</p>
                      <UrgencyBadge urgency={c.urgency} />
                    </div>
                    <p className="text-xs text-slate-500">{c.symptomCategory} · {c.status}</p>
                    {c.patientAllergies && (
                      <p className="mt-1 text-xs font-medium text-red-600">⚠ {t('flags.allergy')}: {c.patientAllergies}</p>
                    )}
                    {tab === 'awaiting' && c.momoTransactionId && (
                      <p className="mt-1 text-xs font-medium text-amber-600">
                        {t('payment.txnLabel')}: <span className="font-mono">{c.momoTransactionId}</span>
                      </p>
                    )}
                  </button>
                ))
              ))}
          </div>

          {selected && ['awaiting', 'active', 'complete'].includes(tab) && (
            <div className="card space-y-4 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">{selected.patientName ?? 'Patient'}</span>
                  <UrgencyBadge urgency={selected.urgency} />
                </div>
                {selected.patientId && (
                  <button
                    className="btn-ghost px-3 py-1 text-xs"
                    onClick={() => openHistory(selected.patientId!)}
                  >
                    {t('history.view')}
                  </button>
                )}
              </div>

              {(selected.patientAllergies || selected.patientChronic) && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  {selected.patientAllergies && (
                    <p>⚠ <span className="font-semibold">{t('flags.allergy')}:</span> {selected.patientAllergies}</p>
                  )}
                  {selected.patientChronic && (
                    <p className="mt-1">🩺 <span className="font-semibold">{t('flags.chronic')}:</span> {selected.patientChronic}</p>
                  )}
                </div>
              )}

              {selected.aiBriefSummary && (
                <details className="rounded-xl bg-brand-50 p-3" open>
                  <summary className="cursor-pointer font-semibold text-brand-800">{t('doctor.aiBrief')}</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-brand-900">{selected.aiBriefSummary}</pre>
                </details>
              )}

              {selected.aiSuggestions && (
                <details className="rounded-xl border border-indigo-200 bg-indigo-50 p-3" open>
                  <summary className="flex cursor-pointer items-center gap-2 font-semibold text-indigo-800">
                    <span>🧠 {t('doctor.aiSuggestions')}</span>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-indigo-900">{selected.aiSuggestions}</pre>
                  <p className="mt-2 text-[10px] italic text-indigo-500">{t('doctor.aiSuggestionsNote')}</p>
                </details>
              )}

              {tab === 'awaiting' && (
                <div>
                  <div className="mb-3 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{t('payment.fee')}</span>
                      <span className="font-semibold">{(selected.consultationFee ?? 0).toLocaleString()} RWF</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span className="text-slate-500">{t('payment.patientSubmitted')}</span>
                      <span className="font-mono font-semibold">
                        {selected.momoTransactionId ?? t('payment.none')}
                      </span>
                    </div>
                  </div>
                  <label className="label">{t('payment.verifyTxn')}</label>
                  <div className="flex gap-2">
                    <input className="input flex-1" value={verifyTxn} onChange={(e) => setVerifyTxn(e.target.value)} />
                    <button className="btn-primary" onClick={verifyPayment}>{t('payment.verify')}</button>
                  </div>
                </div>
              )}

              {tab === 'active' && (
                <>
                  <ChatPanel consultation={selected} />
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="input min-w-[200px] flex-1"
                      placeholder={t('doctor.docNotes')}
                      value={docNotes}
                      onChange={(e) => setDocNotes(e.target.value)}
                    />
                    <button className="btn-ghost" onClick={() => createDoc('prescription')}>{t('doctor.prescribe')}</button>
                    <button className="btn-ghost" onClick={() => createDoc('transfer')}>{t('doctor.transfer')}</button>
                    <button className="btn-primary" onClick={markComplete}>{t('doctor.complete')}</button>
                  </div>
                </>
              )}

              {tab === 'complete' && (
                <div>
                  <label className="label">{t('followUp.send')}</label>
                  <textarea className="input min-h-[80px]" value={followMsg} onChange={(e) => setFollowMsg(e.target.value)} />
                  <button className="btn-primary mt-2" onClick={sendFollowUp}>{t('chat.send')}</button>
                </div>
              )}
            </div>
          )}
        </div>

        {history && <HistoryModal history={history} onClose={() => setHistory(null)} />}
      </main>
    </AppShell>
  );
}

function HistoryModal({ history, onClose }: { history: PatientHistory; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{history.patient.fullName}</h2>
            <p className="text-sm text-slate-500">{history.patient.phoneNumber}</p>
          </div>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        {(history.patient.allergies || history.patient.chronicConditions) && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {history.patient.allergies && <p>⚠ {t('flags.allergy')}: {history.patient.allergies}</p>}
            {history.patient.chronicConditions && <p className="mt-1">🩺 {t('flags.chronic')}: {history.patient.chronicConditions}</p>}
          </div>
        )}

        <h3 className="mt-5 font-semibold text-slate-700">{t('history.consultations')} ({history.consultations.length})</h3>
        <div className="mt-2 space-y-2">
          {history.consultations.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-100 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.symptomCategory ?? '—'}</span>
                <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-xs text-slate-500">{c.severity} · {c.status}</p>
              {c.symptomDescription && <p className="mt-1 text-xs text-slate-600">{c.symptomDescription}</p>}
            </div>
          ))}
        </div>

        {history.dispenses.length > 0 && (
          <>
            <h3 className="mt-5 font-semibold text-slate-700">{t('history.medicines')}</h3>
            <div className="mt-2 space-y-1 text-sm">
              {history.dispenses.map((d, i) => (
                <div key={i} className="flex justify-between">
                  <span>{d.medicineName} × {d.quantity}</span>
                  <span className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const { t } = useLocale();
  const [data, setData] = useState<DoctorAnalytics | null>(null);
  const [ratings, setRatings] = useState<DoctorRatings | null>(null);

  useEffect(() => {
    consultationService.getAnalytics().then(setData).catch(() => {});
    consultationService.getDoctorRatings().then(setRatings).catch(() => {});
  }, []);

  if (!data) return <p className="text-sm text-slate-500">{t('common.loading')}</p>;

  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.count));
  const maxWeek = Math.max(1, ...data.byWeek.map((w) => w.count));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label={t('analytics.total')} value={String(data.totalConsultations)} />
        <MetricCard label={t('analytics.completed')} value={String(data.completed)} />
        <MetricCard label={t('analytics.repeatRate')} value={`${data.repeatRate}%`} />
        <MetricCard
          label={t('analytics.rating')}
          value={data.ratingCount ? `${data.avgRating}★ (${data.ratingCount})` : '—'}
        />
      </div>

      <div className="card p-4">
        <h3 className="mb-3 font-semibold text-slate-700">{t('analytics.byCategory')}</h3>
        {data.byCategory.length === 0 ? (
          <p className="text-sm text-slate-400">{t('doctor.empty')}</p>
        ) : (
          <div className="space-y-2">
            {data.byCategory.map((c) => (
              <div key={c.category} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">{c.category}</span>
                  <span className="font-semibold">{c.count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="mb-3 font-semibold text-slate-700">{t('analytics.byWeek')}</h3>
        <div className="flex items-end gap-2" style={{ height: 120 }}>
          {data.byWeek.map((w) => (
            <div key={w.week} className="flex flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t bg-brand-400"
                style={{ height: `${(w.count / maxWeek) * 100}%`, minHeight: 2 }}
              />
              <span className="mt-1 text-[9px] text-slate-400">{w.week.split('-')[1]}</span>
            </div>
          ))}
        </div>
      </div>

      {ratings && ratings.recent.length > 0 && (
        <div className="card p-4">
          <h3 className="mb-3 font-semibold text-slate-700">{t('analytics.feedback')}</h3>
          <div className="space-y-2">
            {ratings.recent.filter((r) => r.comment).map((r, i) => (
              <div key={i} className="rounded-lg bg-slate-50 p-2 text-sm">
                <span className="text-amber-400">{'★'.repeat(r.stars)}</span>
                <span className="ml-2 text-slate-600">{r.comment}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-lg font-bold text-brand-600">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-brand-600">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function TariffSettings() {
  const { t } = useLocale();
  const [fee, setFee] = useState<number>(5000);
  const [momo, setMomo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    consultationService
      .getDoctorInfo()
      .then((d) => {
        setFee(d.consultationFee ?? 5000);
        setMomo(d.momoNumber ?? '');
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      await consultationService.updateDoctorProfile({ consultationFee: fee, momoNumber: momo });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-700">{t('tariff.title')}</h3>
      <p className="mt-1 text-sm text-slate-500">{t('tariff.subtitle')}</p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="label">{t('tariff.fee')}</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="input"
              value={fee}
              min={0}
              step={500}
              onChange={(e) => setFee(Number(e.target.value))}
            />
            <span className="text-sm font-medium text-slate-500">RWF</span>
          </div>
        </div>
        <div>
          <label className="label">{t('tariff.momo')}</label>
          <input className="input" value={momo} onChange={(e) => setMomo(e.target.value)} placeholder="*182*8*1*..." />
        </div>
      </div>

      {/* Reference tariff card */}
      <div className="mt-5 rounded-xl bg-brand-50 p-4 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
          {t('tariff.reference')}
        </p>
        <div className="flex justify-between border-b border-brand-100 py-1">
          <span className="text-slate-600">{t('tariff.consultation')}</span>
          <span className="font-semibold">{fee.toLocaleString()} RWF</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-600">{t('payment.momo')}</span>
          <span className="font-mono font-semibold">{momo || '—'}</span>
        </div>
      </div>

      {saved && <p className="mt-3 text-sm text-brand-600">{t('tariff.saved')}</p>}
      <button className="btn-primary mt-4" disabled={busy} onClick={save}>
        {busy ? t('common.loading') : t('common.save')}
      </button>
    </div>
  );
}
