import { useCallback, useEffect, useState } from 'react';
import type { Vital } from '../../data/types';
import { clinicalService } from '../../services/clinicalService';
import { useLocale } from '../../state/LocaleProvider';
import { ApiError } from '../../data/api';

interface Props {
  patientId: string;
  consultationId?: string;
  canRecord?: boolean;
}

/** Minimal dependency-free trend chart (line sparkline with min/max labels). */
function TrendChart({
  points,
  color,
  label,
  unit,
}: {
  points: { x: number; y: number }[];
  color: string;
  label: string;
  unit: string;
}) {
  if (points.length === 0) return null;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const range = max - min || 1;
  const w = 260;
  const h = 60;
  const pad = 6;
  const n = points.length;
  const coords = points.map((p, i) => {
    const x = n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.y - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = ys[ys.length - 1];
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="font-bold" style={{ color }}>
          {last} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 w-full" preserveAspectRatio="none">
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.length === 1 && (
          <circle cx={w / 2} cy={pad + (h - pad * 2) / 2} r={3} fill={color} />
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

const EMPTY = {
  systolic: '',
  diastolic: '',
  heartRate: '',
  temperature: '',
  weight: '',
  bloodSugar: '',
  spo2: '',
  note: '',
};

export function VitalsPanel({ patientId, consultationId, canRecord = true }: Props) {
  const { t } = useLocale();
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    clinicalService.listVitals(patientId).then(setVitals).catch(() => setVitals([]));
  }, [patientId]);

  useEffect(load, [load]);

  async function submit() {
    setError(null);
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    setBusy(true);
    try {
      await clinicalService.recordVitals({
        patientId,
        consultationId,
        systolic: num(form.systolic),
        diastolic: num(form.diastolic),
        heartRate: num(form.heartRate),
        temperature: num(form.temperature),
        weight: num(form.weight),
        bloodSugar: num(form.bloodSugar),
        spo2: num(form.spo2),
        note: form.note || undefined,
      });
      setForm({ ...EMPTY });
      setOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  const series = (key: keyof Vital) =>
    vitals
      .filter((v) => v[key] !== null && v[key] !== undefined)
      .map((v, i) => ({ x: i, y: Number(v[key]) }));

  const field = (
    key: keyof typeof EMPTY,
    labelKey: string,
    placeholder: string,
    step?: string
  ) => (
    <div>
      <label className="label">{t(labelKey)}</label>
      <input
        className="input"
        type="number"
        step={step}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">{t('vitals.title')}</h3>
        {canRecord && (
          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen((o) => !o)}>
            {open ? t('common.cancel') : `+ ${t('vitals.record')}`}
          </button>
        )}
      </div>

      {canRecord && open && (
        <div className="card space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            {field('systolic', 'vitals.systolic', '120')}
            {field('diastolic', 'vitals.diastolic', '80')}
            {field('heartRate', 'vitals.heartRate', '72')}
            {field('spo2', 'vitals.spo2', '98')}
            {field('temperature', 'vitals.temperature', '36.8', '0.1')}
            {field('weight', 'vitals.weight', '65', '0.1')}
            {field('bloodSugar', 'vitals.bloodSugar', '5.5', '0.1')}
          </div>
          <div>
            <label className="label">{t('vitals.note')}</label>
            <input
              className="input"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} onClick={submit}>
            {busy ? t('common.loading') : t('vitals.save')}
          </button>
        </div>
      )}

      {vitals.length === 0 ? (
        <p className="card p-6 text-center text-slate-500">{t('vitals.empty')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TrendChart points={series('systolic')} color="#e11d48" label={t('vitals.systolic')} unit="mmHg" />
            <TrendChart points={series('heartRate')} color="#7c3aed" label={t('vitals.heartRate')} unit="bpm" />
            <TrendChart points={series('temperature')} color="#f59e0b" label={t('vitals.temperature')} unit="°C" />
            <TrendChart points={series('weight')} color="#0ea5e9" label={t('vitals.weight')} unit="kg" />
            <TrendChart points={series('bloodSugar')} color="#16a34a" label={t('vitals.bloodSugar')} unit="mmol/L" />
            <TrendChart points={series('spo2')} color="#0891b2" label={t('vitals.spo2')} unit="%" />
          </div>

          <div className="card divide-y divide-slate-100">
            {[...vitals].reverse().slice(0, 12).map((v) => (
              <div key={v.id} className="flex items-center justify-between p-3 text-sm">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {v.systolic != null && <span>BP {v.systolic}/{v.diastolic}</span>}
                  {v.heartRate != null && <span>HR {v.heartRate}</span>}
                  {v.temperature != null && <span>{v.temperature}°C</span>}
                  {v.weight != null && <span>{v.weight}kg</span>}
                  {v.bloodSugar != null && <span>{v.bloodSugar}mmol/L</span>}
                  {v.spo2 != null && <span>SpO₂ {v.spo2}%</span>}
                </div>
                <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
