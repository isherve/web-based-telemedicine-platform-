import { useCallback, useEffect, useState } from 'react';
import type { LabOrder } from '../../data/types';
import { clinicalService } from '../../services/clinicalService';
import { useLocale } from '../../state/LocaleProvider';
import { ApiError } from '../../data/api';

interface Props {
  // Doctor mode: pass patientId (+ consultationId) and canOrder.
  // Patient mode: pass mine=true.
  patientId?: string;
  consultationId?: string;
  canOrder?: boolean;
  canComplete?: boolean;
  mine?: boolean;
}

const COMMON_TESTS = ['Malaria RDT', 'Complete Blood Count', 'Blood Glucose', 'Urinalysis', 'HIV Test', 'Widal Test'];

export function LabOrdersPanel({ patientId, consultationId, canOrder, canComplete, mine }: Props) {
  const { t } = useLocale();
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [testName, setTestName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultDraft, setResultDraft] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    const p = mine
      ? clinicalService.myLabOrders()
      : patientId
        ? clinicalService.labOrdersForPatient(patientId)
        : Promise.resolve<LabOrder[]>([]);
    p.then(setOrders).catch(() => setOrders([]));
  }, [mine, patientId]);

  useEffect(load, [load]);

  async function order() {
    if (!patientId || !testName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await clinicalService.createLabOrder({ patientId, consultationId, testName: testName.trim(), note: note || undefined });
      setTestName('');
      setNote('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function complete(id: string) {
    const result = resultDraft[id];
    if (!result?.trim()) return;
    await clinicalService.completeLabOrder(id, result.trim());
    setResultDraft((d) => ({ ...d, [id]: '' }));
    load();
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-700">{t('labs.title')}</h3>

      {canOrder && patientId && (
        <div className="card space-y-2 p-4">
          <input
            className="input"
            list="lab-tests"
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            placeholder={t('labs.testName')}
          />
          <datalist id="lab-tests">
            {COMMON_TESTS.map((tst) => (
              <option key={tst} value={tst} />
            ))}
          </datalist>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('labs.note')}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || !testName.trim()} onClick={order}>
            {busy ? t('common.loading') : t('labs.order')}
          </button>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="card p-6 text-center text-slate-500">{t('labs.empty')}</p>
      ) : (
        orders.map((o) => (
          <div key={o.id} className="card p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{o.testName}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  o.status === 'ordered' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {t(`labs.status.${o.status}`)}
              </span>
            </div>
            {o.note && <p className="mt-1 text-xs text-slate-500">{o.note}</p>}
            {o.result && (
              <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
                <span className="font-semibold">{t('labs.result')}: </span>
                {o.result}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</p>

            {canComplete && o.status === 'ordered' && (
              <div className="mt-2 flex gap-2">
                <input
                  className="input flex-1 py-1.5 text-xs"
                  value={resultDraft[o.id] ?? ''}
                  onChange={(e) => setResultDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                  placeholder={t('labs.enterResult')}
                />
                <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => complete(o.id)}>
                  {t('labs.saveResult')}
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
