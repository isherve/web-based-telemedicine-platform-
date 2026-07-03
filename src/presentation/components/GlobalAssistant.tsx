import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { aiService, type ChatTurn } from '../../services/aiService';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { ApiError } from '../../data/api';
import type { Language } from '../../data/types';

const QUICK_BY_ROLE: Record<string, string[]> = {
  patient: ['ai.globalQ1', 'ai.globalQ2', 'ai.globalQ3'],
  doctor: ['ai.globalD1', 'ai.globalD2', 'ai.globalD3'],
  finance: ['ai.globalF1', 'ai.globalF2', 'ai.globalF3'],
  pharmacy: ['ai.globalP1', 'ai.globalP2', 'ai.globalP3'],
  admin: ['ai.globalA1', 'ai.globalA2', 'ai.globalA3'],
};

export function GlobalAssistant() {
  const { profile, isAuthenticated } = useAuth();
  const { t, language } = useLocale();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const role = profile?.role ?? 'patient';
  const page = location.pathname.split('/').filter(Boolean).join('/') || 'home';
  const quickKeys = QUICK_BY_ROLE[role] ?? QUICK_BY_ROLE.patient;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  if (!isAuthenticated) return null;

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    const userTurn: ChatTurn = { role: 'user', content: q };
    const history = [...messages, userTurn];
    setMessages(history);
    setBusy(true);
    try {
      const result = await aiService.general({
        page,
        messages,
        question: q,
        language: language as Language,
      });
      const text = result.disclaimer ? `${result.reply}\n\n— ${result.disclaimer}` : result.reply;
      setMessages((m) => [...m, { role: 'assistant', content: text }]);
    } catch (err) {
      const text =
        err instanceof ApiError && err.status === 401
          ? t('common.sessionExpired')
          : err instanceof ApiError
            ? err.message
            : t('common.error');
      setMessages((m) => [...m, { role: 'assistant', content: text }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:scale-105 ${
          open ? 'bg-slate-700 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
        title={t('ai.globalTitle')}
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 flex h-[420px] w-[340px] flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl sm:w-[380px]">
          <div className="flex items-center gap-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-600 to-brand-600 px-4 py-3 text-white">
            <span className="text-xl">🤖</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t('ai.globalTitle')}</p>
              <p className="truncate text-[10px] text-indigo-100">
                {profile?.fullName} · {t(`role.${role}`)} · {page}
              </p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
            {messages.length === 0 && (
              <div className="rounded-xl bg-white p-3 text-xs text-slate-600 ring-1 ring-indigo-100">
                <p className="font-medium text-indigo-700">{t('ai.globalWelcome')}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quickKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
                      onClick={() => ask(t(key))}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs shadow-sm ${
                    m.role === 'user'
                      ? 'rounded-br-md bg-brand-500 text-white'
                      : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-100'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white px-3 py-2 text-xs text-slate-400 ring-1 ring-slate-100">
                  {t('ai.thinking')}
                </div>
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-slate-100 bg-white p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <input
              className="h-9 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs outline-none focus:border-indigo-400"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ai.globalPlaceholder')}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white text-sm disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
