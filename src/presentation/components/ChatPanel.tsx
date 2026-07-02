import { useEffect, useMemo, useRef, useState } from 'react';
import type { Consultation, Message } from '../../data/types';
import { messageService, uploadFile } from '../../services/messageService';
import { consultationService } from '../../services/consultationService';
import { aiService, type ChatTurn } from '../../services/aiService';
import { joinConsultation, useSocketEvent } from '../../hooks/useSocket';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { ApiError } from '../../data/api';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

type ChatView = 'doctor' | 'assistant';

export function ChatPanel({ consultation }: { consultation: Consultation }) {
  const { profile } = useAuth();
  const { t, language } = useLocale();
  const [view, setView] = useState<ChatView>('doctor');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [peerName, setPeerName] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatTurn[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aiScrollRef = useRef<HTMLDivElement>(null);
  const locked = consultation.status !== 'in_process';
  const isDoctor = !!profile?.isDoctor;

  useEffect(() => {
    if (isDoctor) {
      setPeerName(consultation.patientName ?? 'Patient');
    } else {
      consultationService
        .getDoctorInfo()
        .then((d) => setPeerName(d.fullName ?? 'Doctor'))
        .catch(() => setPeerName('Doctor'));
    }
  }, [isDoctor, consultation.patientName]);

  useEffect(() => {
    if (locked) {
      setLoading(false);
      return;
    }
    joinConsultation(consultation.id);
    setLoading(true);
    messageService
      .list(consultation.id)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [consultation.id, locked]);

  useSocketEvent<Message>('message:new', (msg) => {
    if (msg.consultationId === consultation.id) {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    }
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, view]);

  useEffect(() => {
    aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [aiMessages, aiBusy, view]);

  const grouped = useMemo(() => {
    const groups: { day: string; items: Message[] }[] = [];
    for (const m of messages) {
      const day = fmtDay(m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(m);
      else groups.push({ day, items: [m] });
    }
    return groups;
  }, [messages]);

  async function persist(temp: Message) {
    try {
      const saved = await messageService.send(consultation.id, {
        messageType: temp.messageType,
        content: temp.content ?? '',
      });
      setMessages((m) => m.map((x) => (x.id === temp.id ? saved : x)));
    } catch {
      setMessages((m) => m.map((x) => (x.id === temp.id ? { ...x, pending: false, failed: true } : x)));
    }
  }

  function optimistic(type: Message['messageType'], content: string): Message {
    const temp: Message = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      consultationId: consultation.id,
      senderId: profile!.id,
      messageType: type,
      content,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((m) => [...m, temp]);
    return temp;
  }

  async function onSendText(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText('');
    setSuggestions([]);
    await persist(optimistic('text', v));
  }

  function retry(msg: Message) {
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, failed: false, pending: true } : x)));
    persist({ ...msg, pending: true, failed: false });
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, file.name);
      await persist(optimistic('photo', url));
    } finally {
      setUploading(false);
    }
  }

  async function toggleVoice() {
    if (recording && mediaRef.current) {
      mediaRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (ev) => chunks.push(ev.data);
      rec.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setUploading(true);
        try {
          const url = await uploadFile(blob, 'voice.webm');
          await persist(optimistic('voice', url));
        } finally {
          setUploading(false);
        }
        stream.getTracks().forEach((tr) => tr.stop());
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      // mic permission denied
    }
  }

  async function loadSuggestions() {
    setSuggestBusy(true);
    setSuggestions([]);
    setSuggestNote(null);
    try {
      const result = await aiService.doctorSuggestions({
        consultationId: consultation.id,
        language,
      });
      setSuggestions(result.suggestions);
      setSuggestNote(result.note ?? null);
    } catch (err) {
      setSuggestNote(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSuggestBusy(false);
    }
  }

  async function askAssistant(question: string) {
    const q = question.trim();
    if (!q || aiBusy) return;
    setAiInput('');
    const userTurn: ChatTurn = { role: 'user', content: q };
    const nextHistory = [...aiMessages, userTurn];
    setAiMessages(nextHistory);
    setAiBusy(true);
    try {
      const result = await aiService.patientAssistant({
        consultationId: consultation.id,
        messages: aiMessages,
        question: q,
        language,
      });
      const reply = result.disclaimer
        ? `${result.reply}\n\n— ${result.disclaimer}`
        : result.reply;
      setAiMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setAiMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: err instanceof ApiError ? err.message : t('common.error'),
        },
      ]);
    } finally {
      setAiBusy(false);
    }
  }

  if (locked) {
    return (
      <div className="flex h-[440px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <p className="text-sm font-medium text-slate-600">{t('chat.locked')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[500px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
            view === 'assistant' ? 'bg-indigo-100 text-indigo-700' : 'bg-brand-100 text-brand-700'
          }`}
        >
          {view === 'assistant' ? '🤖' : initials(peerName || '?')}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {view === 'assistant' ? t('ai.patientAssistant') : peerName || '…'}
          </p>
          <p className="flex items-center gap-1 text-xs text-emerald-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {view === 'assistant' ? t('ai.assistantOnline') : t('chat.active')}
          </p>
        </div>
        {!isDoctor && (
          <div className="flex gap-1 rounded-full bg-slate-100 p-0.5">
            <button
              type="button"
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${view === 'doctor' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500'}`}
              onClick={() => setView('doctor')}
            >
              {t('chat.doctorChat')}
            </button>
            <button
              type="button"
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${view === 'assistant' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
              onClick={() => setView('assistant')}
            >
              🤖 {t('ai.assistant')}
            </button>
          </div>
        )}
      </div>

      {/* Doctor chat view */}
      {view === 'doctor' && (
        <>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4">
            {loading ? (
              <p className="text-center text-sm text-slate-400">{t('common.loading')}</p>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                <div className="mb-2 text-3xl">💬</div>
                <p className="text-sm">{t('chat.empty')}</p>
              </div>
            ) : (
              grouped.map((g) => (
                <div key={g.day} className="space-y-2">
                  <div className="flex justify-center">
                    <span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-[10px] font-medium text-slate-500">
                      {g.day}
                    </span>
                  </div>
                  {g.items.map((m) => {
                    const mine = m.senderId === profile?.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div
                            className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                              mine
                                ? 'rounded-br-md bg-brand-500 text-white'
                                : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-100'
                            } ${m.failed ? 'opacity-60' : ''}`}
                          >
                            {m.messageType === 'text' && (
                              <span className="whitespace-pre-wrap break-words">{m.content}</span>
                            )}
                            {m.messageType === 'photo' && (
                              <div className="space-y-1">
                                <a href={m.content ?? '#'} target="_blank" rel="noreferrer">
                                  <img
                                    src={m.content ?? ''}
                                    alt="photo"
                                    className="max-h-48 max-w-full rounded-lg object-cover"
                                  />
                                </a>
                                <a
                                  href={m.content ?? '#'}
                                  download
                                  className={`block text-[11px] underline ${mine ? 'text-white/80' : 'text-brand-600'}`}
                                >
                                  {t('chat.download')}
                                </a>
                              </div>
                            )}
                            {m.messageType === 'voice' && (
                              <audio controls src={m.content ?? ''} className="h-9 max-w-[200px]" />
                            )}
                          </div>
                          <span className="mt-0.5 px-1 text-[10px] text-slate-400">
                            {m.pending ? t('chat.sending') : m.failed ? '' : fmtTime(m.createdAt)}
                            {m.failed && (
                              <button className="text-red-500 underline" onClick={() => retry(m)}>
                                {t('chat.failedRetry')}
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Doctor AI suggestions */}
          {isDoctor && (
            <div className="border-t border-indigo-50 bg-indigo-50/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
                  onClick={loadSuggestions}
                  disabled={suggestBusy}
                >
                  ✨ {suggestBusy ? t('ai.thinking') : t('ai.suggestReply')}
                </button>
                {suggestNote && !suggestions.length && (
                  <span className="text-[10px] text-slate-500">{suggestNote}</span>
                )}
              </div>
              {suggestions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {suggestNote && <p className="text-[10px] italic text-indigo-500">{suggestNote}</p>}
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className="block w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50"
                      onClick={() => setText(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <form onSubmit={onSendText} className="flex items-center gap-1 border-t border-slate-100 bg-white p-2">
            <label
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-lg hover:bg-slate-100"
              title={t('chat.photo')}
            >
              🖼️
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
            <button
              type="button"
              className={`flex h-10 w-10 items-center justify-center rounded-full text-lg hover:bg-slate-100 ${recording ? 'animate-pulse bg-red-100 text-red-600' : ''}`}
              onClick={toggleVoice}
              title={t('chat.voice')}
            >
              {recording ? '⏹️' : '🎤'}
            </button>
            <input
              className="h-10 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-400 focus:bg-white"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={recording ? t('chat.recording') : t('chat.placeholder')}
            />
            <button
              type="submit"
              disabled={!text.trim() || uploading}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-40"
              title={t('chat.send')}
            >
              ➤
            </button>
          </form>
        </>
      )}

      {/* Patient AI assistant view */}
      {view === 'assistant' && !isDoctor && (
        <>
          <div ref={aiScrollRef} className="flex-1 space-y-3 overflow-y-auto bg-indigo-50/30 px-3 py-4">
            {aiMessages.length === 0 && (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-indigo-100">
                <p className="font-medium text-indigo-700">🤖 {t('ai.patientAssistant')}</p>
                <p className="mt-1 text-xs text-slate-500">{t('ai.patientAssistantIntro')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[t('ai.quickQ1'), t('ai.quickQ2'), t('ai.quickQ3')].map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                      onClick={() => askAssistant(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {aiMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    m.role === 'user'
                      ? 'rounded-br-md bg-brand-500 text-white'
                      : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-indigo-100'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {aiBusy && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white px-4 py-2 text-sm text-slate-400 ring-1 ring-indigo-100">
                  {t('ai.thinking')}
                </div>
              </div>
            )}
          </div>
          <form
            className="flex items-center gap-2 border-t border-indigo-100 bg-white p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void askAssistant(aiInput);
            }}
          >
            <input
              className="h-10 flex-1 rounded-full border border-indigo-200 bg-indigo-50/50 px-4 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder={t('ai.assistantPlaceholder')}
              disabled={aiBusy}
            />
            <button
              type="submit"
              disabled={!aiInput.trim() || aiBusy}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        </>
      )}
    </div>
  );
}
