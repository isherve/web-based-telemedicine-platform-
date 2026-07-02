import { api } from '../data/api';
import type { FinancialReport, PharmacyReport } from '../data/types';

export const reportService = {
  financial: () => api.get<FinancialReport>('/reports/financial'),
  pharmacy: () => api.get<PharmacyReport>('/reports/pharmacy'),
};
