import { useCallback, useEffect, useRef, useState } from 'react';
import { SYMPTOM_CATEGORIES } from '../../data/symptomCategories';
import { clearTriageDraft } from '../../data/triageDraft';
import type { Language } from '../../data/types';
import { aiService, type ChatTurn, type TriageChatDraft } from '../../services/aiService';
import { consultationService } from '../../services/consultationService';
import { useLocale } from '../../state/LocaleProvider';
import { ApiError } from '../../data/api';

interface Props {
  onSubmitted: (consultationId: string) => void;
}

export function TriageChatbot({ onSubmitted }: Props) {
  const { t, language } = useLocale();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState<TriageChatDraft>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  const ask = useCallback(
    async (history: ChatTurn[], currentDraft: TriageChatDraft) => {
      setBusy(true);
      setError(null);
      try {
        const result = await aiService.triageChat({
          messages: history,
          draft: currentDraft,
          language: language as Language,
        });
        setDraft(result.draft);
        setReady(result.readyToSubmit);
        setQuickReplies(result.quickReplies ?? []);
        setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('common.error'));
      } finally {
        setBusy(false);
      }
    },
    [language, t]
  );

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void ask([], {});
  }, [ask]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function sendUser(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');
    setQuickReplies([]);
    const nextHistory: ChatTurn[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextHistory);
    await ask(nextHistory, draft);
  }

  async function submitTriage() {
    if (!draft.biologicalSex || !draft.severity || !draft.duration || !draft.symptomCategory || !draft.symptomDescription) {
      setError(t('triage.incomplete'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cat = SYMPTOM_CATEGORIES.find((c) => c.id === draft.symptomCategory);
      const label = cat ? (language === 'rw' ? cat.rw : cat.en) : draft.symptomCategory;
      const c = await consultationService.submitTriage({
        biologicalSex: draft.biologicalSex,
        severity: draft.severity,
        duration: draft.duration,
        symptomCategory: label,
        symptomDescription: draft.symptomDescription,
        language: language as Language,
      });
      clearTriageDraft();
      onSubmitted(c.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-brand-50 px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-lg text-white">
          🤖
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{t('ai.triageBot')}</p>
          <p className="text-xs text-indigo-600">{t('ai.triageBotDesc')}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
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
            <div className="rounded-2xl bg-white px-4 py-2 text-sm text-slate-400 ring-1 ring-slate-100">
              {t('ai.thinking')}
            </div>
          </div>
        )}
      </div>

      {quickReplies.length > 0 && !busy && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-white px-3 py-2">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              onClick={() => sendUser(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {ready && (
        <div className="border-t border-emerald-100 bg-emerald-50 px-3 py-2">
          <button className="btn-primary w-full" disabled={busy} onClick={submitTriage}>
            {busy ? t('common.loading') : t('ai.submitTriage')}
          </button>
        </div>
      )}

      {error && <p className="px-3 py-1 text-xs text-red-600">{error}</p>}

      <form
        className="flex items-center gap-2 border-t border-slate-100 bg-white p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void sendUser(input);
        }}
      >
        <input
          className="h-10 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-indigo-400 focus:bg-white"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('ai.triagePlaceholder')}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white disabled:opacity-40"
        >
          ➤
        </button>
      </form>
    </div>
  );
}
