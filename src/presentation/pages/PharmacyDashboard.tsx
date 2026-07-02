import { useCallback, useEffect, useState } from 'react';
import type { Dispense, Medicine, PharmacyReport, Prescription } from '../../data/types';
import { pharmacyService } from '../../services/pharmacyService';
import { reportService } from '../../services/reportService';
import { downloadBlob, generatePharmacyReportPdf } from '../../services/pdfService';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { AppShell } from '../components/AppShell';
import { ProfilePanel } from '../components/ProfilePanel';
import { ApiError } from '../../data/api';

type Tab =
  | 'overview'
  | 'stock'
  | 'dispense'
  | 'prescriptions'
  | 'lowstock'
  | 'history'
  | 'analytics'
  | 'reports'
  | 'profile';

const PHARMACY_TABS: Tab[] = [
  'overview',
  'stock',
  'dispense',
  'prescriptions',
  'lowstock',
  'history',
  'analytics',
  'reports',
  'profile',
];

export function PharmacyDashboard() {
  const { profile, logout } = useAuth();
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>('overview');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [dispenses, setDispenses] = useState<Dispense[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [report, setReport] = useState<PharmacyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // add-medicine form
  const [newMed, setNewMed] = useState({ name: '', form: '', quantity: 0, reorderLevel: 10, unitPrice: 0 });

  // dispense form
  const [disp, setDisp] = useState({ medicineId: '', quantity: 1, patientId: '', consultationId: '', note: '' });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastDispensed, setLastDispensed] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [meds, hist, presc, rep] = await Promise.all([
      pharmacyService.listMedicines(),
      pharmacyService.listDispenses(),
      pharmacyService.listPrescriptions(),
      reportService.pharmacy().catch(() => null),
    ]);
    setMedicines(meds);
    setDispenses(hist);
    setPrescriptions(presc);
    setReport(rep);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addMedicine() {
    if (!newMed.name.trim()) return;
    await pharmacyService.addMedicine(newMed);
    setNewMed({ name: '', form: '', quantity: 0, reorderLevel: 10, unitPrice: 0 });
    refresh();
  }

  async function restock(m: Medicine) {
    const amount = Number(prompt(`${t('pharmacy.restockPrompt')} — ${m.name}`, '50'));
    if (!amount || amount <= 0) return;
    await pharmacyService.restock(m.id, amount);
    refresh();
  }

  // Live safety preview when a medicine + patient are chosen.
  useEffect(() => {
    if (disp.medicineId && disp.patientId) {
      pharmacyService.safetyCheck(disp.medicineId, disp.patientId).then(setWarnings).catch(() => setWarnings([]));
    } else {
      setWarnings([]);
    }
  }, [disp.medicineId, disp.patientId]);

  async function doDispense() {
    setError(null);
    setLastDispensed(null);
    if (!disp.medicineId || disp.quantity <= 0) return;
    // If there are safety warnings, require explicit confirmation.
    if (warnings.length > 0 && !window.confirm(`${t('pharmacy.confirmWarn')}\n\n${warnings.join('\n')}`)) {
      return;
    }
    try {
      const res = await pharmacyService.dispense({
        medicineId: disp.medicineId,
        quantity: Number(disp.quantity),
        patientId: disp.patientId || undefined,
        consultationId: disp.consultationId || undefined,
        note: disp.note || undefined,
      });
      setDisp({ medicineId: '', quantity: 1, patientId: '', consultationId: '', note: '' });
      setWarnings([]);
      setLastDispensed(res.dispense.medicineName ?? t('pharmacy.dispense'));
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function downloadReport() {
    if (!report) return;
    const blob = await generatePharmacyReportPdf(report, profile?.clinicName ?? 'Gara Clinic');
    downloadBlob(blob, `gara-pharmacy-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const lowCount = medicines.filter((m) => m.low).length;

  return (
    <AppShell onLogout={() => logout()}>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('pharmacy.title')}</h1>
            <p className="text-sm text-slate-500">{profile?.fullName}</p>
          </div>
          <div className="flex items-center gap-3">
            {lowCount > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600">
                {lowCount} {t('pharmacy.lowStock')}
              </span>
            )}
            <button className="btn-ghost text-sm" onClick={downloadReport} disabled={!report}>
              ⬇ {t('finance.downloadPdf')}
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {PHARMACY_TABS.map((tb) => (
            <button
              key={tb}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${tab === tb ? 'bg-brand-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
              onClick={() => setTab(tb)}
            >
              {t(`pharmacy.tab.${tb}`)}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OvMetric label={t('pharmacy.medicines')} value={String(medicines.length)} />
            <OvMetric label={t('pharmacy.stockValue')} value={`${(report?.stockValue ?? 0).toLocaleString()}`} />
            <OvMetric label={t('pharmacy.dispensed')} value={String(report?.totalDispensed ?? 0)} />
            <OvMetric label={t('pharmacy.lowStock')} value={String(lowCount)} accent={lowCount > 0} />
          </div>
        )}

        {tab === 'stock' && (
          <div className="mt-6 space-y-6">
            <div className="card p-5">
              <h3 className="mb-3 font-semibold text-slate-700">{t('pharmacy.addMedicine')}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <input className="input" placeholder={t('pharmacy.name')} value={newMed.name} onChange={(e) => setNewMed({ ...newMed, name: e.target.value })} />
                <input className="input" placeholder={t('pharmacy.form')} value={newMed.form} onChange={(e) => setNewMed({ ...newMed, form: e.target.value })} />
                <input className="input" type="number" placeholder={t('pharmacy.quantity')} value={newMed.quantity} onChange={(e) => setNewMed({ ...newMed, quantity: Number(e.target.value) })} />
                <input className="input" type="number" placeholder={t('pharmacy.reorder')} value={newMed.reorderLevel} onChange={(e) => setNewMed({ ...newMed, reorderLevel: Number(e.target.value) })} />
                <input className="input" type="number" placeholder={t('pharmacy.price')} value={newMed.unitPrice} onChange={(e) => setNewMed({ ...newMed, unitPrice: Number(e.target.value) })} />
              </div>
              <button className="btn-primary mt-3" onClick={addMedicine}>{t('pharmacy.add')}</button>
            </div>

            <div className="card overflow-hidden">
              <div className="grid grid-cols-5 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                <span className="col-span-2">{t('pharmacy.name')}</span>
                <span>{t('pharmacy.quantity')}</span>
                <span>{t('pharmacy.price')}</span>
                <span></span>
              </div>
              {medicines.map((m) => (
                <div key={m.id} className="grid grid-cols-5 items-center gap-2 border-b border-slate-100 p-3 text-sm">
                  <div className="col-span-2">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.form}</p>
                  </div>
                  <span className={m.low ? 'font-bold text-red-600' : ''}>
                    {m.quantity}
                    {m.low && <span className="ml-1 text-[10px]">⚠</span>}
                  </span>
                  <span>{m.unitPrice.toLocaleString()} RWF</span>
                  <button className="btn-ghost justify-self-end px-3 py-1 text-xs" onClick={() => restock(m)}>
                    + {t('pharmacy.restock')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'dispense' && (
          <div className="card mt-6 p-5">
            <h3 className="mb-3 font-semibold text-slate-700">{t('pharmacy.dispenseTitle')}</h3>
            <div className="space-y-3">
              <div>
                <label className="label">{t('pharmacy.medicine')}</label>
                <select className="input" value={disp.medicineId} onChange={(e) => setDisp({ ...disp, medicineId: e.target.value })}>
                  <option value="">{t('pharmacy.selectMedicine')}</option>
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id} disabled={m.quantity <= 0}>
                      {m.name} ({m.quantity} {t('pharmacy.inStock')})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('pharmacy.quantity')}</label>
                  <input className="input" type="number" min={1} value={disp.quantity} onChange={(e) => setDisp({ ...disp, quantity: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label">{t('pharmacy.patientId')}</label>
                  <input className="input" placeholder={t('pharmacy.optional')} value={disp.patientId} onChange={(e) => setDisp({ ...disp, patientId: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">{t('pharmacy.note')}</label>
                <input className="input" value={disp.note} onChange={(e) => setDisp({ ...disp, note: e.target.value })} />
              </div>
              {warnings.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p className="font-semibold">{t('pharmacy.safetyWarnings')}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              {lastDispensed && <p className="text-sm text-brand-600">✓ {lastDispensed}</p>}
              <button className="btn-primary" onClick={doDispense}>{t('pharmacy.dispense')}</button>
            </div>
          </div>
        )}

        {tab === 'prescriptions' && (
          <div className="card mt-6 divide-y divide-slate-100">
            {prescriptions.length === 0 ? (
              <p className="p-6 text-center text-slate-500">{t('pharmacy.noPrescriptions')}</p>
            ) : (
              prescriptions.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <p className="font-medium">{p.patientName ?? 'Patient'}</p>
                    <p className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleString()}</p>
                  </div>
                  <button
                    className="btn-ghost px-3 py-1 text-xs"
                    onClick={() => {
                      setDisp((d) => ({ ...d, patientId: p.patientId, consultationId: p.consultationId }));
                      setTab('dispense');
                    }}
                  >
                    {t('pharmacy.dispenseFor')}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="card mt-6 divide-y divide-slate-100">
            {dispenses.length === 0 ? (
              <p className="p-6 text-center text-slate-500">{t('pharmacy.noHistory')}</p>
            ) : (
              dispenses.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-medium">{d.medicineName} × {d.quantity}</p>
                    <p className="text-xs text-slate-400">
                      {d.patientName ?? t('pharmacy.walkIn')} · {new Date(d.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-slate-500">{(d.quantity * d.unitPrice).toLocaleString()} RWF</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'lowstock' && (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-slate-500">{t('pharmacy.lowStockDesc')}</p>
            {medicines.filter((m) => m.low).length === 0 ? (
              <p className="card p-6 text-center text-slate-500">{t('pharmacy.noLowStock')}</p>
            ) : (
              medicines
                .filter((m) => m.low)
                .map((m) => (
                  <div key={m.id} className="card flex items-center justify-between p-4 text-sm">
                    <div>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-red-600">
                        {m.quantity} {t('pharmacy.inStock')} · {t('pharmacy.reorder')}: {m.reorderLevel}
                      </p>
                    </div>
                    <button className="btn-primary px-3 py-1 text-xs" onClick={() => restock(m)}>
                      + {t('pharmacy.restock')}
                    </button>
                  </div>
                ))
            )}
          </div>
        )}

        {tab === 'analytics' && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <OvMetric label={t('pharmacy.medicines')} value={String(medicines.length)} />
              <OvMetric label={t('pharmacy.stockValue')} value={`${(report?.stockValue ?? 0).toLocaleString()}`} />
              <OvMetric label={t('pharmacy.dispensed')} value={String(report?.totalDispensed ?? 0)} />
            </div>
            <div className="card p-4">
              <h3 className="mb-3 font-semibold text-slate-700">{t('pharmacy.topDispensed')}</h3>
              {(() => {
                const totals = new Map<string, number>();
                for (const d of dispenses) {
                  totals.set(d.medicineName ?? '—', (totals.get(d.medicineName ?? '—') ?? 0) + d.quantity);
                }
                const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
                const max = Math.max(1, ...rows.map((r) => r[1]));
                if (rows.length === 0) return <p className="text-sm text-slate-400">{t('pharmacy.noHistory')}</p>;
                return (
                  <div className="space-y-2">
                    {rows.map(([name, qty]) => (
                      <div key={name} className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-600">{name}</span>
                          <span className="font-semibold">{qty}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(qty / max) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {tab === 'reports' && (
          <div className="card mt-6 p-5">
            <h3 className="font-semibold text-slate-700">{t('finance.pharmacyReport')}</h3>
            <p className="mt-1 text-sm text-slate-500">{t('finance.pharmacyReportDesc')}</p>
            <button className="btn-primary mt-4" onClick={downloadReport} disabled={!report}>
              ⬇ {t('finance.downloadPdf')}
            </button>
          </div>
        )}

        {tab === 'profile' && <ProfilePanel />}
      </main>
    </AppShell>
  );
}

function OvMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-lg font-bold ${accent ? 'text-red-600' : 'text-brand-600'}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
