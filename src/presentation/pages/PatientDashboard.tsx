import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Appointment,
  ClinicalDocument,
  Consultation,
  FollowUp,
  MyData,
  Notification,
  QueuePosition,
} from '../../data/types';
import { consultationService } from '../../services/consultationService';
import {
  appointmentService,
  documentService,
  followUpService,
  notificationService,
} from '../../services/platformService';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { AppShell } from '../components/AppShell';
import { ChatPanel } from '../components/ChatPanel';
import { ProfilePanel } from '../components/ProfilePanel';
import { StatusTracker } from '../components/StatusTracker';
import { joinUser, useSocketEvent } from '../../hooks/useSocket';
import { ApiError } from '../../data/api';

type Tab =
  | 'dashboard'
  | 'appointments'
  | 'documents'
  | 'medicines'
  | 'followups'
  | 'notifications'
  | 'history'
  | 'profile';

const PATIENT_TABS: Tab[] = [
  'dashboard',
  'appointments',
  'documents',
  'medicines',
  'followups',
  'notifications',
  'history',
  'profile',
];

export function PatientDashboard() {
  const { profile, logout } = useAuth();
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [documents, setDocuments] = useState<ClinicalDocument[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [myData, setMyData] = useState<MyData | null>(null);
  const [replyText, setReplyText] = useState('');
  const [queue, setQueue] = useState<QueuePosition | null>(null);

  const refresh = useCallback(async () => {
    const [c, a, d, f, n, md] = await Promise.all([
      consultationService.listPatient(),
      appointmentService.listPatient(),
      documentService.list(),
      followUpService.listPatient(),
      notificationService.list().catch(() => []),
      consultationService.getMyData().catch(() => null),
    ]);
    setConsultations(c);
    setAppointments(a);
    setDocuments(d);
    setFollowUps(f);
    setNotifications(n);
    setMyData(md);
    const active = c[0];
    if (active && active.status !== 'complete') {
      consultationService.getQueuePosition(active.id).then(setQueue).catch(() => setQueue(null));
    } else {
      setQueue(null);
    }
  }, []);

  useEffect(() => {
    if (profile) joinUser(profile.id);
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [profile, refresh]);

  useSocketEvent<Consultation>('consultation:updated', (c) => {
    setConsultations((prev) => prev.map((x) => (x.id === c.id ? c : x)));
  });

  const latest = consultations[0];
  const upcoming = appointments.find((a) => a.status === 'confirmed' || a.status === 'pending');

  return (
    <AppShell onLogout={() => logout()}>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-800">{t('dashboard.patient')}</h1>
        <p className="text-sm text-slate-500">{profile?.fullName}</p>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {PATIENT_TABS.map((tb) => {
            const unread = tb === 'notifications' ? notifications.filter((n) => !n.isRead).length : 0;
            return (
              <button
                key={tb}
                className={`relative whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${tab === tb ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
                onClick={() => setTab(tb)}
              >
                {t(`patient.tab.${tb}`)}
                {unread > 0 && (
                  <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === 'dashboard' && (
          <div className="mt-6 space-y-4">
            {!latest ? (
              <div className="card p-6 text-center">
                <p className="text-slate-500">{t('patient.noConsultation')}</p>
                <Link to="/patient/triage" className="btn-primary mt-4 inline-block">
                  {t('patient.startTriage')}
                </Link>
              </div>
            ) : (
              <>
                <div className="card p-5">
                  <StatusTracker status={latest.status} />
                </div>

                {queue && queue.position > 0 && latest.status !== 'complete' && (
                  <div className="card flex items-center gap-3 border-brand-200 bg-brand-50 p-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
                      #{queue.position}
                    </span>
                    <div className="text-sm">
                      <p className="font-semibold text-brand-800">{t('queue.title')}</p>
                      <p className="text-brand-600">
                        {t('queue.position')
                          .replace('{n}', String(queue.position))
                          .replace('{total}', String(queue.total))}
                      </p>
                    </div>
                  </div>
                )}

                {latest.aiSuggestions && (
                  <details className="card overflow-hidden">
                    <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-indigo-700">
                      🧠 {t('patient.aiSuggestions')}
                    </summary>
                    <div className="border-t border-slate-100 p-4">
                      <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700">{latest.aiSuggestions}</pre>
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        {t('patient.aiDisclaimer')}
                      </p>
                    </div>
                  </details>
                )}

                {upcoming && (
                  <div className="card p-4">
                    <h3 className="font-semibold text-slate-700">{t('patient.appointment')}</h3>
                    <p className="text-sm text-slate-500">
                      {upcoming.requestedDate} — {t(`appointment.status.${upcoming.status}`)}
                    </p>
                  </div>
                )}

                {latest.status === 'pending_payment' && (
                  <PaymentCard consultation={latest} onSubmitted={refresh} />
                )}

                {(latest.status === 'in_process' || latest.status === 'complete') && (
                  <div>
                    <h3 className="mb-2 font-semibold text-slate-700">{t('chat.title')}</h3>
                    <ChatPanel consultation={latest} />
                  </div>
                )}

                {latest.status === 'complete' && <RatingCard consultationId={latest.id} />}

                {latest.status === 'complete' && followUps.length > 0 && (
                  <div className="card p-4">
                    <h3 className="font-semibold">{t('followUp.title')}</h3>
                    {followUps.map((f) => (
                      <div key={f.id} className="mt-3 border-t border-slate-100 pt-3 text-sm">
                        <p className="text-slate-600">{f.doctorMessage}</p>
                        {f.patientReply ? (
                          <p className="mt-2 text-brand-700">{f.patientReply}</p>
                        ) : (
                          <div className="mt-2 flex gap-2">
                            <input
                              className="input flex-1 py-2"
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder={t('followUp.reply')}
                            />
                            <button
                              className="btn-primary px-3"
                              onClick={async () => {
                                await followUpService.reply(f.id, replyText);
                                setReplyText('');
                                refresh();
                              }}
                            >
                              {t('chat.send')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <Link to="/patient/triage" className="btn-ghost block text-center text-sm">
                  {t('patient.newTriage')}
                </Link>
              </>
            )}
          </div>
        )}

        {tab === 'appointments' && (
          <div className="mt-6 space-y-3">
            <div className="flex justify-between">
              <h3 className="font-semibold text-slate-700">{t('patient.tab.appointments')}</h3>
              {latest && (
                <Link to={`/patient/booking/${latest.id}`} className="btn-ghost px-3 py-1 text-xs">
                  + {t('booking.title')}
                </Link>
              )}
            </div>
            {appointments.length === 0 ? (
              <p className="card p-6 text-center text-slate-500">{t('appointments.empty')}</p>
            ) : (
              appointments.map((a) => (
                <div key={a.id} className="card flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{a.requestedDate}</p>
                    {a.notes && <p className="text-xs text-slate-500">{a.notes}</p>}
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {t(`appointment.status.${a.status}`)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="card mt-6 divide-y divide-slate-100">
            {documents.length === 0 ? (
              <p className="p-6 text-center text-slate-500">{t('documents.empty')}</p>
            ) : (
              documents.map((d) => (
                <a
                  key={d.id}
                  href={d.pdfStorageUrl ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-4 hover:bg-slate-50"
                >
                  <span className="font-medium capitalize">{d.documentKind}</span>
                  <span className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</span>
                </a>
              ))
            )}
          </div>
        )}

        {tab === 'medicines' && (
          <div className="card mt-6 divide-y divide-slate-100">
            {!myData || myData.dispenses.length === 0 ? (
              <p className="p-6 text-center text-slate-500">{t('medicines.empty')}</p>
            ) : (
              myData.dispenses.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-4 text-sm">
                  <span className="font-medium">{d.medicineName} × {d.quantity}</span>
                  <span className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'followups' && (
          <div className="mt-6 space-y-3">
            {followUps.length === 0 ? (
              <p className="card p-6 text-center text-slate-500">{t('followUp.empty')}</p>
            ) : (
              followUps.map((f) => (
                <div key={f.id} className="card p-4 text-sm">
                  <p className="text-slate-600">{f.doctorMessage}</p>
                  {f.patientReply ? (
                    <p className="mt-2 text-brand-700">↳ {f.patientReply}</p>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <input
                        className="input flex-1 py-2"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={t('followUp.reply')}
                      />
                      <button
                        className="btn-primary px-3"
                        onClick={async () => {
                          await followUpService.reply(f.id, replyText);
                          setReplyText('');
                          refresh();
                        }}
                      >
                        {t('chat.send')}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'notifications' && (
          <div className="card mt-6 divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-slate-500">{t('notifications.empty')}</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  className={`flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50 ${n.isRead ? '' : 'bg-brand-50/40'}`}
                  onClick={async () => {
                    if (!n.isRead) {
                      await notificationService.markRead(n.id);
                      refresh();
                    }
                  }}
                >
                  {!n.isRead && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />}
                  <div className={n.isRead ? 'opacity-70' : ''}>
                    <p className="text-sm font-semibold text-slate-700">{n.title}</p>
                    <p className="text-sm text-slate-500">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="mt-6 space-y-3">
            {consultations.length === 0 ? (
              <p className="card p-6 text-center text-slate-500">{t('patient.noConsultation')}</p>
            ) : (
              consultations.map((c) => (
                <div key={c.id} className="card p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.symptomCategory ?? '—'}</span>
                    <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-slate-500">{c.severity} · {t(`status.${c.status}`)}</p>
                  {c.symptomDescription && <p className="mt-1 text-slate-600">{c.symptomDescription}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'profile' && <ProfilePanel />}
      </main>
    </AppShell>
  );
}

function RatingCard({ consultationId }: { consultationId: string }) {
  const { t } = useLocale();
  const [existing, setExisting] = useState<{ stars: number; comment: string | null } | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    consultationService.getRating(consultationId).then(setExisting).catch(() => {});
  }, [consultationId]);

  async function submit() {
    if (!stars) return;
    await consultationService.submitRating(consultationId, stars, comment);
    setDone(true);
  }

  if (existing || done) {
    const shown = existing?.stars ?? stars;
    return (
      <div className="card p-5 text-center">
        <p className="font-semibold text-slate-700">{t('rating.thanks')}</p>
        <div className="mt-2 text-2xl">{'★'.repeat(shown)}{'☆'.repeat(5 - shown)}</div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-700">{t('rating.title')}</h3>
      <p className="mt-1 text-xs text-slate-500">{t('rating.subtitle')}</p>
      <div className="mt-3 flex justify-center gap-2 text-3xl">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStars(s)}
            className={s <= stars ? 'text-amber-400' : 'text-slate-300'}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="input mt-3"
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('rating.commentPlaceholder')}
      />
      <button className="btn-primary mt-3 w-full" disabled={!stars} onClick={submit}>
        {t('rating.submit')}
      </button>
    </div>
  );
}

/** Generates a realistic mobile-money transaction reference for the demo. */
function genTxn(provider: 'momo' | 'airtel'): string {
  const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  const digits = Math.floor(1000000000 + Math.random() * 8999999999);
  return `${provider === 'airtel' ? 'AM' : 'MP'}${digits}.${ref}`;
}

function PaymentCard({
  consultation,
  onSubmitted,
}: {
  consultation: Consultation;
  onSubmitted: () => void;
}) {
  const { t } = useLocale();
  const [doctor, setDoctor] = useState<{ momoNumber: string | null; consultationFee: number | null } | null>(null);
  const [provider, setProvider] = useState<'momo' | 'airtel'>('momo');
  const [txn, setTxn] = useState(consultation.momoTransactionId ?? genTxn('momo'));
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [gateway, setGateway] = useState(false);

  useEffect(() => {
    consultationService.getDoctorInfo().then(setDoctor);
  }, []);

  // Keep the default transaction ID in sync with the selected provider until the
  // user manually edits it, so a valid reference is always pre-filled.
  useEffect(() => {
    if (!edited && !consultation.momoTransactionId) {
      setTxn(genTxn(provider));
    }
  }, [provider, edited, consultation.momoTransactionId]);

  const fee = consultation.consultationFee ?? doctor?.consultationFee ?? 5000;
  const submitted = Boolean(consultation.momoTransactionId);

  function simulate() {
    setEdited(false);
    setTxn(genTxn(provider));
  }

  async function submit() {
    if (!txn.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await consultationService.submitPayment(consultation.id, txn.trim(), provider);
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card border-brand-200 bg-brand-50 p-5">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-brand-800">{t('payment.title')}</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          {t('payment.demoBadge')}
        </span>
      </div>
      <p className="mt-2 text-sm text-brand-700">{t('payment.instructions')}</p>

      {/* Tariff reference */}
      <div className="mt-3 rounded-xl bg-white p-4 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t('payment.tariffTitle')}
        </p>
        <div className="flex justify-between border-b border-slate-100 py-1">
          <span className="text-slate-500">{t('payment.tariffConsultation')}</span>
          <span className="font-semibold">{fee.toLocaleString()} RWF</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-500">{t('payment.momo')}</span>
          <span className="font-mono font-semibold">{doctor?.momoNumber ?? '—'}</span>
        </div>
      </div>

      {submitted ? (
        <div className="mt-4 rounded-xl bg-white p-4 text-sm">
          <p className="font-semibold text-brand-700">{t('payment.submittedTitle')}</p>
          <p className="mt-1 text-slate-500">
            {t('payment.txnLabel')}: <span className="font-mono">{consultation.momoTransactionId}</span>
          </p>
          <p className="mt-2 text-xs text-slate-500">{t('payment.waiting')}</p>
        </div>
      ) : (
        <div className="mt-4">
          <label className="label">{t('payment.provider')}</label>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(['momo', 'airtel'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                  provider === p ? 'border-brand-500 bg-white text-brand-700' : 'border-slate-200 bg-white/50 text-slate-500'
                }`}
              >
                {p === 'momo' ? t('payment.mtnMomo') : t('payment.airtelMoney')}
              </button>
            ))}
          </div>

          {/* Primary: pay directly through the in-app gateway */}
          <button className="btn-primary w-full" onClick={() => setGateway(true)}>
            💳 {t('payment.payNow')} · {fee.toLocaleString()} RWF
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">{t('payment.gatewayHint')}</p>

          {/* Secondary: manual transaction-ID entry (kept for reference/offline) */}
          <button
            type="button"
            className="mt-3 w-full text-center text-xs font-medium text-brand-600 hover:underline"
            onClick={() => setShowManual((s) => !s)}
          >
            {showManual ? t('payment.hideManual') : t('payment.manualOption')}
          </button>

          {showManual && (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/60 p-3">
              <label className="label">{t('payment.enterTxn')}</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={txn}
                  onChange={(e) => {
                    setEdited(true);
                    setTxn(e.target.value);
                  }}
                  placeholder="MP2601..."
                />
                <button type="button" className="btn-ghost whitespace-nowrap" onClick={simulate}>
                  {t('payment.simulate')}
                </button>
              </div>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <button className="btn-ghost mt-3 w-full" disabled={busy || !txn.trim()} onClick={submit}>
                {busy ? t('common.loading') : t('payment.submit')}
              </button>
              <p className="mt-2 text-xs text-slate-500">{t('payment.demoHint')}</p>
            </div>
          )}
        </div>
      )}

      {gateway && (
        <PaymentGateway
          provider={provider}
          amount={fee}
          consultationId={consultation.id}
          momoNumber={doctor?.momoNumber ?? null}
          onClose={() => setGateway(false)}
          onSuccess={onSubmitted}
        />
      )}
    </div>
  );
}

type GatewayStep = 'form' | 'processing' | 'success';

/** In-app mobile-money payment gateway (demo simulation). */
function PaymentGateway({
  provider,
  amount,
  consultationId,
  momoNumber,
  onClose,
  onSuccess,
}: {
  provider: 'momo' | 'airtel';
  amount: number;
  consultationId: string;
  momoNumber: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useLocale();
  const [step, setStep] = useState<GatewayStep>('form');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [txnId, setTxnId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const brand =
    provider === 'airtel'
      ? { name: t('payment.airtelMoney'), color: 'bg-red-600', ring: 'ring-red-200' }
      : { name: t('payment.mtnMomo'), color: 'bg-yellow-500', ring: 'ring-yellow-200' };

  async function pay() {
    setError(null);
    if (!phone.trim() || !pin.trim()) {
      setError(t('payment.gwRequired'));
      return;
    }
    setStep('processing');
    try {
      const res = await consultationService.payViaSystem(consultationId, {
        provider,
        phone: phone.trim(),
        pin: pin.trim(),
      });
      setTxnId(res.transactionId);
      setStep('success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
      setStep('form');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Gateway header */}
        <div className={`flex items-center gap-3 ${brand.color} px-5 py-4 text-white`}>
          <span className="text-2xl">📱</span>
          <div>
            <p className="text-sm font-bold">{brand.name}</p>
            <p className="text-xs opacity-90">{t('payment.gatewayTitle')}</p>
          </div>
        </div>

        <div className="p-5">
          {step === 'form' && (
            <>
              <div className="mb-4 rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-500">{t('payment.amountToPay')}</p>
                <p className="text-2xl font-bold text-slate-800">{amount.toLocaleString()} RWF</p>
                {momoNumber && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {t('payment.payTo')}: <span className="font-mono">{momoNumber}</span>
                  </p>
                )}
              </div>
              <label className="label">{t('payment.gwPhone')}</label>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                type="tel"
              />
              <label className="label mt-3">{t('payment.gwPin')}</label>
              <input
                className="input tracking-[0.4em]"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="••••"
                type="password"
                inputMode="numeric"
              />
              <p className="mt-1 text-[11px] text-slate-400">{t('payment.gwPinHint')}</p>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-4 flex gap-2">
                <button className="btn-ghost flex-1" onClick={onClose}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary flex-1" onClick={pay}>
                  {t('payment.gwConfirm')}
                </button>
              </div>
            </>
          )}

          {step === 'processing' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className={`mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 ${brand.ring} border-t-brand-500`} />
              <p className="text-sm font-medium text-slate-700">{t('payment.gwProcessing')}</p>
              <p className="mt-1 text-xs text-slate-400">{t('payment.gwProcessingHint')}</p>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">
                ✓
              </div>
              <p className="text-lg font-bold text-emerald-700">{t('payment.gwSuccess')}</p>
              <p className="mt-1 text-sm text-slate-600">
                {amount.toLocaleString()} RWF · {brand.name}
              </p>
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1 font-mono text-xs text-slate-500">
                {txnId}
              </p>
              <button
                className="btn-primary mt-5 w-full"
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
              >
                {t('payment.gwDone')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
