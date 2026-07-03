import { useCallback, useEffect, useState } from 'react';
import type { Consultation, FinancialReport, PharmacyReport, Profile } from '../../data/types';
import { financeService } from '../../services/pharmacyService';
import { reportService } from '../../services/reportService';
import { consultationService } from '../../services/consultationService';
import { ApiError } from '../../data/api';
import {
  downloadBlob,
  generateFinancialReportPdf,
  generatePharmacyReportPdf,
} from '../../services/pdfService';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { AppShell } from '../components/AppShell';
import { ProfilePanel } from '../components/ProfilePanel';
import { AssignmentsPanel } from '../components/AssignmentsPanel';
import { joinUser, useSocketEvent } from '../../hooks/useSocket';
import { tabClass, ROLE_ACCENT_BORDER } from '../theme';

type Tab =
  | 'overview'
  | 'verify'
  | 'assignments'
  | 'transactions'
  | 'income'
  | 'outstanding'
  | 'pharmacy'
  | 'tariff'
  | 'reports'
  | 'profile';

const FINANCE_TABS: Tab[] = [
  'overview',
  'verify',
  'assignments',
  'transactions',
  'income',
  'outstanding',
  'pharmacy',
  'tariff',
  'reports',
  'profile',
];

export function FinanceDashboard() {
  const { profile, logout } = useAuth();
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>('overview');
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [pharmacy, setPharmacy] = useState<PharmacyReport | null>(null);
  const [pending, setPending] = useState<Consultation[]>([]);
  const [doctor, setDoctor] = useState<Profile | null>(null);
  const [txnById, setTxnById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [fin, pend, pharm, doc] = await Promise.all([
      reportService.financial(),
      financeService.pendingPayments(),
      reportService.pharmacy().catch(() => null),
      consultationService.getDoctorInfo().catch(() => null),
    ]);
    setReport(fin);
    setPending(pend);
    setPharmacy(pharm);
    setDoctor(doc);
  }, []);

  useEffect(() => {
    if (profile) joinUser(profile.id);
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [profile, refresh]);

  useSocketEvent('consultation:updated', () => refresh());
  useSocketEvent('notification:new', () => refresh());

  async function verify(c: Consultation) {
    const txn = (txnById[c.id] ?? c.momoTransactionId ?? '').trim();
    if (!txn) return;
    setBusy(c.id);
    try {
      await financeService.verifyPayment(c.id, txn);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function downloadFinancial() {
    if (!report) return;
    const blob = await generateFinancialReportPdf(report, profile?.clinicName ?? 'Gara Clinic');
    downloadBlob(blob, `gara-financial-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function downloadPharmacy() {
    if (!pharmacy) return;
    const blob = await generatePharmacyReportPdf(pharmacy, profile?.clinicName ?? 'Gara Clinic');
    downloadBlob(blob, `gara-pharmacy-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <AppShell onLogout={() => logout()}>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className={`border-l-4 pl-3 ${ROLE_ACCENT_BORDER.finance}`}>
          <h1 className="text-2xl font-bold text-slate-800">{t('finance.title')}</h1>
          <p className="text-sm text-slate-500">{profile?.fullName}</p>
        </div>

        {report && (
          <>
            {/* Grand total — all money collected across the system */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-emerald-600 p-5 text-white shadow-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/80">
                  {t('finance.grandTotal')}
                </p>
                <p className="text-3xl font-extrabold">
                  {(report.totalIncome + (report.pharmacyRevenue ?? 0)).toLocaleString()} RWF
                </p>
                <p className="mt-1 text-xs text-white/80">{t('finance.grandTotalDesc')}</p>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-xs text-white/70">{t('finance.consultationIncome')}</p>
                  <p className="text-lg font-bold">{report.totalIncome.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-white/70">{t('finance.pharmacyRevenueLabel')}</p>
                  <p className="text-lg font-bold">{(report.pharmacyRevenue ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label={t('doctor.today')} value={`${report.todayIncome.toLocaleString()} RWF`} />
              <Metric label={t('doctor.month')} value={`${report.monthIncome.toLocaleString()} RWF`} />
              <Metric label={t('finance.total')} value={`${report.totalIncome.toLocaleString()} RWF`} />
              <Metric label={t('finance.pending')} value={String(report.pendingConsultations)} />
            </div>
          </>
        )}

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {FINANCE_TABS.map((tb) => (
            <button
              key={tb}
              className={tabClass('finance', tab === tb)}
              onClick={() => setTab(tb)}
            >
              {t(`finance.tab.${tb}`)}
            </button>
          ))}
        </div>

        {tab === 'overview' && report && (
          <div className="mt-6 space-y-4">
            {/* Money totals breakdown */}
            <div className="card p-5">
              <h3 className="mb-3 font-semibold text-slate-700">{t('finance.moneyBreakdown')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <span className="text-slate-600">{t('finance.consultationIncome')}</span>
                  <span className="font-semibold">{report.totalIncome.toLocaleString()} RWF</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <span className="text-slate-600">{t('finance.pharmacyRevenueLabel')}</span>
                  <span className="font-semibold">{(report.pharmacyRevenue ?? 0).toLocaleString()} RWF</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <span className="text-slate-600">{t('finance.paidConsultations')}</span>
                  <span className="font-semibold">{report.paidConsultations}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <span className="text-slate-600">{t('finance.avgPerConsultation')}</span>
                  <span className="font-semibold">
                    {(report.paidConsultations
                      ? Math.round(report.totalIncome / report.paidConsultations)
                      : 0
                    ).toLocaleString()}{' '}
                    RWF
                  </span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="font-bold text-slate-800">{t('finance.grandTotal')}</span>
                  <span className="text-lg font-extrabold text-brand-600">
                    {(report.totalIncome + (report.pharmacyRevenue ?? 0)).toLocaleString()} RWF
                  </span>
                </div>
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 p-4 font-semibold text-slate-700">
                {t('finance.recent')}
              </div>
            <div className="divide-y divide-slate-100">
              {report.recent.length === 0 ? (
                <p className="p-6 text-center text-slate-500">{t('finance.noPayments')}</p>
              ) : (
                report.recent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <p className="font-medium">{r.patientName ?? '—'}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(r.date).toLocaleDateString()} · {r.txn ?? '—'}
                      </p>
                    </div>
                    <span className="font-semibold text-brand-600">{r.amount?.toLocaleString()} RWF</span>
                  </div>
                ))
              )}
              </div>
            </div>
          </div>
        )}

        {tab === 'verify' && (
          <div className="mt-6 space-y-2">
            {pending.length === 0 ? (
              <p className="text-sm text-slate-500">{t('finance.noPending')}</p>
            ) : (
              pending.map((c) => (
                <div key={c.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{c.patientName ?? 'Patient'}</p>
                      <p className="text-xs text-slate-500">
                        {c.patientPhone} · {(c.consultationFee ?? 0).toLocaleString()} RWF
                      </p>
                    </div>
                    {c.momoTransactionId && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        {t('payment.txnLabel')}: {c.momoTransactionId}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="input flex-1 py-2"
                      placeholder={t('payment.verifyTxn')}
                      value={txnById[c.id] ?? c.momoTransactionId ?? ''}
                      onChange={(e) => setTxnById((m) => ({ ...m, [c.id]: e.target.value }))}
                    />
                    <button className="btn-primary px-4" disabled={busy === c.id} onClick={() => verify(c)}>
                      {busy === c.id ? t('common.loading') : t('payment.verify')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'transactions' && report && (
          <div className="card mt-6 overflow-hidden">
            <div className="grid grid-cols-4 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">
              <span>{t('finance.date')}</span>
              <span>{t('finance.patient')}</span>
              <span>{t('payment.txnLabel')}</span>
              <span className="text-right">{t('finance.amount')}</span>
            </div>
            {report.recent.length === 0 ? (
              <p className="p-6 text-center text-slate-500">{t('finance.noPayments')}</p>
            ) : (
              report.recent.map((r, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 border-b border-slate-100 p-3 text-sm">
                  <span className="text-slate-500">{new Date(r.date).toLocaleDateString()}</span>
                  <span className="font-medium">{r.patientName ?? '—'}</span>
                  <span className="font-mono text-xs text-slate-500">{r.txn ?? '—'}</span>
                  <span className="text-right font-semibold text-brand-600">{r.amount?.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'income' && report && (
          <div className="card mt-6 p-5">
            <h3 className="mb-4 font-semibold text-slate-700">{t('finance.incomeTrend')}</h3>
            {report.byDay.length === 0 ? (
              <p className="text-sm text-slate-500">{t('finance.noPayments')}</p>
            ) : (
              <div className="flex items-end gap-2" style={{ height: 160 }}>
                {[...report.byDay].reverse().map((d) => {
                  const max = Math.max(1, ...report.byDay.map((x) => x.income));
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center justify-end">
                      <span className="mb-1 text-[9px] text-slate-400">{(d.income / 1000).toFixed(0)}k</span>
                      <div
                        className="w-full rounded-t bg-brand-400"
                        style={{ height: `${(d.income / max) * 100}%`, minHeight: 2 }}
                      />
                      <span className="mt-1 text-[9px] text-slate-400">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'outstanding' && (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-slate-500">{t('finance.outstandingDesc')}</p>
            {pending.filter((c) => c.momoTransactionId).length === 0 ? (
              <p className="card p-6 text-center text-slate-500">{t('finance.noPending')}</p>
            ) : (
              pending
                .filter((c) => c.momoTransactionId)
                .map((c) => (
                  <div key={c.id} className="card flex items-center justify-between p-4 text-sm">
                    <div>
                      <p className="font-semibold">{c.patientName ?? 'Patient'}</p>
                      <p className="text-xs text-slate-500">{c.patientPhone}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-amber-600">{(c.consultationFee ?? 0).toLocaleString()} RWF</p>
                      <p className="font-mono text-[10px] text-slate-400">{c.momoTransactionId}</p>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {tab === 'pharmacy' && pharmacy && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label={t('pharmacy.stockValue')} value={`${pharmacy.stockValue.toLocaleString()}`} />
              <Metric label={t('finance.pharmacyRevenueLabel')} value={`${report?.pharmacyRevenue.toLocaleString() ?? 0}`} />
              <Metric label={t('pharmacy.dispensed')} value={String(pharmacy.totalDispensed)} />
              <Metric label={t('pharmacy.lowStock')} value={String(pharmacy.lowStockCount)} />
            </div>
            <div className="card overflow-hidden">
              <div className="border-b border-slate-100 p-3 font-semibold text-slate-700">
                {t('finance.recentDispensing')}
              </div>
              {pharmacy.dispenses.slice(0, 15).map((d, i) => (
                <div key={i} className="flex items-center justify-between border-b border-slate-100 p-3 text-sm">
                  <span>{d.medicineName} × {d.quantity}</span>
                  <span className="text-slate-500">{(d.quantity * d.unitPrice).toLocaleString()} RWF</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'assignments' && <AssignmentsPanel />}

        {tab === 'tariff' && (
          <TariffEditor doctor={doctor} onSaved={refresh} />
        )}

        {tab === 'reports' && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700">{t('finance.financialReport')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('finance.financialReportDesc')}</p>
              <button className="btn-primary mt-4" onClick={downloadFinancial} disabled={!report}>
                ⬇ {t('finance.downloadPdf')}
              </button>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-slate-700">{t('finance.pharmacyReport')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('finance.pharmacyReportDesc')}</p>
              <button className="btn-primary mt-4" onClick={downloadPharmacy} disabled={!pharmacy}>
                ⬇ {t('finance.downloadPdf')}
              </button>
            </div>
          </div>
        )}

        {tab === 'profile' && <ProfilePanel />}
      </main>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="text-lg font-bold text-brand-600">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

/** Finance-editable clinic tariff (fee + MoMo number + clinic name). */
function TariffEditor({ doctor, onSaved }: { doctor: Profile | null; onSaved: () => void }) {
  const { t } = useLocale();
  const [fee, setFee] = useState('');
  const [momo, setMomo] = useState('');
  const [clinic, setClinic] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setFee(doctor?.consultationFee?.toString() ?? '');
    setMomo(doctor?.momoNumber ?? '');
    setClinic(doctor?.clinicName ?? '');
  }, [doctor]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await consultationService.updateClinicTariff({
        consultationFee: fee ? Number(fee) : undefined,
        momoNumber: momo,
        clinicName: clinic,
      });
      setMsg({ ok: true, text: t('common.saved') });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : t('common.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6 p-5">
      <h3 className="font-semibold text-slate-700">{t('tariff.title')}</h3>
      <p className="mt-1 text-sm text-slate-500">{t('finance.tariffEditDesc')}</p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="label">{t('tariff.consultation')}</label>
          <div className="flex items-center gap-2">
            <input
              className="input"
              type="number"
              min={0}
              step={500}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
            <span className="text-sm font-medium text-slate-500">RWF</span>
          </div>
        </div>
        <div>
          <label className="label">{t('payment.momo')}</label>
          <input
            className="input font-mono"
            value={momo}
            onChange={(e) => setMomo(e.target.value)}
            placeholder="*182*8*1*..."
          />
        </div>
        <div>
          <label className="label">{t('finance.clinic')}</label>
          <input className="input" value={clinic} onChange={(e) => setClinic(e.target.value)} />
        </div>
      </div>

      {/* Live reference preview */}
      <div className="mt-5 rounded-xl bg-brand-50 p-4 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
          {t('tariff.reference')}
        </p>
        <div className="flex justify-between border-b border-brand-100 py-1">
          <span className="text-slate-600">{t('tariff.consultation')}</span>
          <span className="font-semibold">{(Number(fee) || 0).toLocaleString()} RWF</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-600">{t('payment.momo')}</span>
          <span className="font-mono font-semibold">{momo || '—'}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? t('common.loading') : t('common.save')}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-brand-600' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
