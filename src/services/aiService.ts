import { api } from '../data/api';
import type { Language } from '../data/types';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface TriageChatDraft {
  biologicalSex?: string;
  severity?: string;
  duration?: string;
  symptomCategory?: string;
  symptomDescription?: string;
}

export interface TriageChatResult {
  reply: string;
  draft: TriageChatDraft;
  readyToSubmit: boolean;
  quickReplies?: string[];
}

export interface AssistantResult {
  reply: string;
  disclaimer?: string;
}

export interface DoctorSuggestionsResult {
  suggestions: string[];
  note?: string;
}

export const aiService = {
  triageChat: (body: {
    messages: ChatTurn[];
    draft: TriageChatDraft;
    language: Language;
  }) => api.post<TriageChatResult>('/ai/triage-chat', body),

  patientAssistant: (body: {
    consultationId: string;
    messages: ChatTurn[];
    question: string;
    language: Language;
  }) => api.post<AssistantResult>('/ai/patient-assistant', body),

  doctorSuggestions: (body: { consultationId: string; language: Language }) =>
    api.post<DoctorSuggestionsResult>('/ai/doctor-suggestions', body),

  general: (body: {
    page: string;
    messages: ChatTurn[];
    question: string;
    language: Language;
  }) => api.post<AssistantResult>('/ai/general', body),
};
