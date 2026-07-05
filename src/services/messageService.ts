import { api, getApiOrigin } from '../data/api';
import type { Message } from '../data/types';

export const messageService = {
  list: (consultationId: string) =>
    api.get<{ messages: Message[] }>(`/messages/${consultationId}`).then((r) => r.messages),

  send: (consultationId: string, body: { messageType: 'text' | 'photo' | 'voice'; content: string }) =>
    api.post<{ message: Message }>(`/messages/${consultationId}`, body).then((r) => r.message),
};

export async function uploadFile(file: File | Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append('file', file, filename);
  const token = sessionStorage.getItem('gara.session');
  const res = await fetch(`${getApiOrigin()}/api/uploads`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = (await res.json()) as { url: string };
  return data.url;
}
