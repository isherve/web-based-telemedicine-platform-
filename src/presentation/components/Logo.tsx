import { useLocale } from '../../state/LocaleProvider';

export function Logo({ withTagline = false }: { withTagline?: boolean }) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-md">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
          <path d="M12 21s-7-4.4-7-9.5C5 8 7.2 6 9.6 6c1.3 0 2.1.9 2.4 1.4.3-.5 1.1-1.4 2.4-1.4C16.8 6 19 8 19 11.5 19 16.6 12 21 12 21z" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="text-xl font-extrabold tracking-tight text-brand-700">{t('app.name')}</div>
        {withTagline && <div className="text-xs text-slate-500">{t('app.tagline')}</div>}
      </div>
    </div>
  );
}
