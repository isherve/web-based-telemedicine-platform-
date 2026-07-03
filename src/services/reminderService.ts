import { api } from '../data/api';
import type { Reminder } from '../data/types';

export const reminderService = {
  list: () => api.get<{ reminders: Reminder[] }>('/reminders').then((r) => r.reminders),

  create: (body: { title: string; body?: string; kind?: string; dueAt: string }) =>
    api.post<{ reminder: Reminder }>('/reminders', body).then((r) => r.reminder),

  remove: (id: string) => api.del<{ ok: boolean }>(`/reminders/${id}`),
};
