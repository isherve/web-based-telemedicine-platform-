import { LanguageToggle } from './LanguageToggle';
import { Logo } from './Logo';
import { GlobalAssistant } from './GlobalAssistant';
import { useLocale } from '../../state/LocaleProvider';

export function AppShell({
  children,
  onLogout,
}: {
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="min-h-full bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <button className="btn-ghost text-sm" onClick={onLogout}>
            {t('common.logout')}
          </button>
        </div>
      </header>
      {children}
      <GlobalAssistant />
    </div>
  );
}
