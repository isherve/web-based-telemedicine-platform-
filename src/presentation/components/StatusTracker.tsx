import type { CareStatus } from '../../data/types';
import { useLocale } from '../../state/LocaleProvider';

const STEPS: { key: CareStatus | 'triage'; labelKey: string }[] = [
  { key: 'triage', labelKey: 'status.triage' },
  { key: 'pending_payment', labelKey: 'status.payment' },
  { key: 'in_process', labelKey: 'status.consult' },
  { key: 'complete', labelKey: 'status.done' },
];

function stepIndex(status: CareStatus, hasTriage: boolean): number {
  if (!hasTriage) return 0;
  if (status === 'pending_payment') return 1;
  if (status === 'in_process') return 2;
  return 3;
}

export function StatusTracker({
  status,
  hasTriage = true,
}: {
  status?: CareStatus;
  hasTriage?: boolean;
}) {
  const { t } = useLocale();
  const active = status ? stepIndex(status, hasTriage) : 0;

  return (
    <div className="flex items-center justify-between gap-1">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex flex-1 flex-col items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
              i <= active ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {i + 1}
          </div>
          <span className="mt-1 text-center text-[10px] font-medium text-slate-500 sm:text-xs">
            {t(s.labelKey)}
          </span>
        </div>
      ))}
    </div>
  );
}
