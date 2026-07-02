import type { TriageDraft } from './types';

const KEY = 'gara.triage.draft';

export function loadTriageDraft(): TriageDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TriageDraft) : null;
  } catch {
    return null;
  }
}

export function saveTriageDraft(draft: TriageDraft): void {
  localStorage.setItem(KEY, JSON.stringify(draft));
}

export function clearTriageDraft(): void {
  localStorage.removeItem(KEY);
}
