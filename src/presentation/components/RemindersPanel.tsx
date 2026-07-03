import { useCallback, useEffect, useState } from 'react';
import type { Reminder } from '../../data/types';
import { reminderService } from '../../services/reminderService';
import { useLocale } from '../../state/LocaleProvider';
import { ApiError } from '../../data/api';

export function RemindersPanel() {
  const { t } = useLocale();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('medication');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    reminderService.list().then(setReminders).catch(() => setReminders([]));
  }, []);

  useEffect(load, [load]);

  async function add() {
    if (!title.trim() || !dueAt) return;
    setBusy(true);
    setError(null);
    try {
      await reminderService.create({
        title: title.trim(),
        body: body || undefined,
        kind,
        dueAt: new Date(dueAt).toISOString(),
      });
      setTitle('');
      setBody('');
      setDueAt('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await reminderService.remove(id);
    load();
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-700">{t('reminders.title')}</h3>

      <div className="card space-y-2 p-4">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('reminders.titlePlaceholder')}
        />
        <input
          className="input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('reminders.notePlaceholder')}
        />
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="medication">{t('reminders.kind.medication')}</option>
            <option value="appointment">{t('reminders.kind.appointment')}</option>
            <option value="other">{t('reminders.kind.other')}</option>
          </select>
          <input
            className="input"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !title.trim() || !dueAt} onClick={add}>
          {busy ? t('common.loading') : `+ ${t('reminders.add')}`}
        </button>
      </div>

      {reminders.length === 0 ? (
        <p className="card p-6 text-center text-slate-500">{t('reminders.empty')}</p>
      ) : (
        reminders.map((r) => (
          <div key={r.id} className="card flex items-center justify-between p-4 text-sm">
            <div>
              <p className="font-medium text-slate-700">
                {r.sent ? '✓ ' : '⏰ '}
                {r.title}
              </p>
              {r.body && <p className="text-xs text-slate-500">{r.body}</p>}
              <p className="mt-0.5 text-xs text-slate-400">
                {t(`reminders.kind.${r.kind}`) ?? r.kind} · {new Date(r.dueAt).toLocaleString()}
              </p>
            </div>
            <button className="text-slate-400 hover:text-red-500" onClick={() => remove(r.id)}>
              ✕
            </button>
          </div>
        ))
      )}
    </div>
  );
}
