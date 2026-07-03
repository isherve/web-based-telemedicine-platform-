import { api } from '../data/api';
import type { AdminStats, AdminUser, DoctorLeaderboardEntry, AuditEntry, Role } from '../data/types';

export const adminService = {
  stats: () => api.get<{ stats: AdminStats }>('/admin/stats').then((r) => r.stats),

  users: (role?: string) =>
    api.get<{ users: AdminUser[] }>(`/admin/users${role ? `?role=${role}` : ''}`).then((r) => r.users),

  setRole: (id: string, role: Role) =>
    api.patch<{ user: AdminUser }>(`/admin/users/${id}/role`, { role }).then((r) => r.user),

  doctors: () =>
    api.get<{ doctors: DoctorLeaderboardEntry[] }>('/admin/doctors').then((r) => r.doctors),

  audit: () => api.get<{ audit: AuditEntry[] }>('/admin/audit').then((r) => r.audit),
};
