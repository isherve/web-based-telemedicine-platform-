import { api } from '../data/api';
import type {
  AssignmentConsultation,
  AssignmentSuggestion,
  Consultation,
  DoctorCandidate,
  Language,
} from '../data/types';

export const assignmentService = {
  candidates: () =>
    api.get<{ candidates: DoctorCandidate[] }>('/assignments/candidates').then((r) => r.candidates),

  consultations: () =>
    api
      .get<{ consultations: AssignmentConsultation[] }>('/assignments/consultations')
      .then((r) => r.consultations),

  suggest: (id: string, language: Language = 'en') =>
    api
      .get<{ suggestion: AssignmentSuggestion }>(`/assignments/${id}/suggest?language=${language}`)
      .then((r) => r.suggestion),

  assign: (id: string, doctorId: string) =>
    api
      .post<{ consultation: Consultation }>(`/assignments/${id}/assign`, { doctorId })
      .then((r) => r.consultation),

  auto: (id: string, language: Language = 'en') =>
    api.post<{ consultation: Consultation; suggestion: AssignmentSuggestion }>(
      `/assignments/${id}/auto`,
      { language }
    ),
};
