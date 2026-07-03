import { useEffect, useState } from 'react';
import type { EPrescription, Medicine, RxItem } from '../../data/types';
import { clinicalService } from '../../services/clinicalService';
import { pharmacyService } from '../../services/pharmacyService';
import { useLocale } from '../../state/LocaleProvider';
import { ApiError } from '../../data/api';

const BLANK: RxItem = {
  medicineName: '',
  dosage: '',
  frequency: '',
  duration: '',
  quantity: 1,
  instructions: '',
};

/** Doctor-facing structured e-prescription builder with allergy/stock checks. */
export function PrescriptionBuilder({
  patientId,
  consultationId,
  onCreated,
}: {
  patientId: string;
  consultationId?: string;
  onCreated?: () => void;
}) {
  const { t } = useLocale();
  const [items, setItems] = useState<RxItem[]>([{ ...BLANK }]);
  const [note, setNote] = useState('');
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    pharmacyService.listMedicines().then(setMedicines).catch(() => setMedicines([]));
  }, []);

  function update(i: number, patch: Partial<RxItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function pickMedicine(i: number, name: string) {
    const med = medicines.find((m) => m.name === name);
    update(i, { medicineName: name, medicineId: med?.id ?? null });
  }

  async function submit() {
    setError(null);
    setOk(false);
    const clean = items.filter((it) => it.medicineName.trim());
    if (clean.length === 0) {
      setError(t('rx.needItem'));
      return;
    }
    setBusy(true);
    try {
      const res = await clinicalService.createPrescription({
        patientId,
        consultationId,
        note: note || undefined,
        items: clean,
      });
      setWarnings(res.warnings);
      setOk(true);
      setItems([{ ...BLANK }]);
      setNote('');
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <h3 className="font-semibold text-slate-700">{t('rx.builderTitle')}</h3>

      <datalist id="med-list">
        {medicines.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      {items.map((it, i) => {
        const med = medicines.find((m) => m.id === it.medicineId);
        return (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                list="med-list"
                value={it.medicineName}
                onChange={(e) => pickMedicine(i, e.target.value)}
                placeholder={t('rx.medicine')}
              />
              {items.length > 1 && (
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-500"
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  ✕
                </button>
              )}
            </div>
            {med && (
              <p className={`mt-1 text-[11px] ${med.low ? 'text-amber-600' : 'text-slate-400'}`}>
                {t('rx.inStock')}: {med.quantity} {med.low ? `· ${t('rx.lowStock')}` : ''}
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                className="input"
                value={it.dosage ?? ''}
                onChange={(e) => update(i, { dosage: e.target.value })}
                placeholder={t('rx.dosage')}
              />
              <input
                className="input"
                value={it.frequency ?? ''}
                onChange={(e) => update(i, { frequency: e.target.value })}
                placeholder={t('rx.frequency')}
              />
              <input
                className="input"
                value={it.duration ?? ''}
                onChange={(e) => update(i, { duration: e.target.value })}
                placeholder={t('rx.duration')}
              />
              <input
                className="input"
                type="number"
                min={1}
                value={it.quantity ?? 1}
                onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                placeholder={t('rx.quantity')}
              />
            </div>
            <input
              className="input mt-2"
              value={it.instructions ?? ''}
              onChange={(e) => update(i, { instructions: e.target.value })}
              placeholder={t('rx.instructions')}
            />
          </div>
        );
      })}

      <button
        type="button"
        className="btn-ghost w-full text-sm"
        onClick={() => setItems((prev) => [...prev, { ...BLANK }])}
      >
        + {t('rx.addItem')}
      </button>

      <textarea
        className="input"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('rx.note')}
      />

      {warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          <p className="font-semibold">{t('rx.warnings')}</p>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && warnings.length === 0 && <p className="text-sm text-emerald-600">{t('rx.created')}</p>}

      <button className="btn-primary w-full" disabled={busy} onClick={submit}>
        {busy ? t('common.loading') : t('rx.issue')}
      </button>
    </div>
  );
}

export function PrescriptionCard({
  rx,
  onDispense,
  showPatient,
}: {
  rx: EPrescription;
  onDispense?: (id: string) => void;
  showPatient?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="card p-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          {showPatient && <p className="font-semibold text-slate-700">{rx.patientName ?? '—'}</p>}
          <p className="text-xs text-slate-400">
            {rx.doctorName ? `${rx.doctorName} · ` : ''}
            {new Date(rx.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            rx.status === 'active'
              ? 'bg-brand-100 text-brand-700'
              : rx.status === 'dispensed'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
          }`}
        >
          {t(`rx.status.${rx.status}`)}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {rx.items.map((it, i) => (
          <li key={i} className="rounded-lg bg-slate-50 px-3 py-2">
            <span className="font-medium">{it.medicineName}</span>
            <span className="text-xs text-slate-500">
              {[it.dosage, it.frequency, it.duration].filter(Boolean).join(' · ')}
              {it.quantity ? ` · ×${it.quantity}` : ''}
            </span>
            {it.instructions && <p className="text-xs text-slate-400">{it.instructions}</p>}
          </li>
        ))}
      </ul>
      {rx.note && <p className="mt-2 text-xs italic text-slate-500">{rx.note}</p>}
      {onDispense && rx.status === 'active' && (
        <button className="btn-primary mt-3 w-full py-1.5 text-xs" onClick={() => onDispense(rx.id)}>
          {t('rx.markDispensed')}
        </button>
      )}
    </div>
  );
}
