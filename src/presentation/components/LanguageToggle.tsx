import { useLocale } from '../../state/LocaleProvider';

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLocale();
  return (
    <div className={`inline-flex rounded-full bg-white/80 p-1 text-xs font-semibold shadow-sm ${className}`}>
      {(['en', 'rw', 'fr'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          className={`rounded-full px-3 py-1 uppercase transition ${
            language === lang ? 'bg-brand-500 text-white' : 'text-slate-500 hover:text-brand-600'
          }`}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}
