import { useCallback, useEffect, useState } from 'react';
import type { AdminStats, AdminUser, DoctorLeaderboardEntry, AuditEntry, Role } from '../../data/types';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { AppShell } from '../components/AppShell';
import { ProfilePanel } from '../components/ProfilePanel';
import { AssignmentsPanel } from '../components/AssignmentsPanel';
import { tabClass, ROLE_ACCENT_BORDER } from '../theme';

type Tab = 'overview' | 'assignments' | 'users' | 'doctors' | 'audit' | 'profile';
const TABS: Tab[] = ['overview', 'assignments', 'users', 'doctors', 'audit', 'profile'];

const ROLE_OPTIONS: Role[] = ['patient', 'doctor', 'finance', 'pharmacy', 'admin'];

export function AdminDashboard() {
  const { profile, logout } = useAuth();
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [doctors, setDoctors] = useState<DoctorLeaderboardEntry[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [roleFilter, setRoleFilter] = useState('');

  const refresh = useCallback(async () => {
    const [s, u, d, a] = await Promise.all([
      adminService.stats().catch(() => null),
      adminService.users().catch(() => []),
      adminService.doctors().catch(() => []),
      adminService.audit().catch(() => []),
    ]);
    setStats(s);
    setUsers(u);
    setDoctors(d);
    setAudit(a);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredUsers = roleFilter ? users.filter((u) => u.role === roleFilter) : users;

  async function changeRole(id: string, role: Role) {
    await adminService.setRole(id, role);
    refresh();
  }

  const stat = (label: string, value: number | string, accent?: string) => (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</p>
    </div>
  );

  return (
    <AppShell onLogout={() => logout()}>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className={`border-l-4 pl-3 ${ROLE_ACCENT_BORDER.admin}`}>
          <h1 className="text-2xl font-bold text-slate-800">{t('dashboard.admin')}</h1>
          <p className="text-sm text-slate-500">{profile?.fullName}</p>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {TABS.map((tb) => (
            <button
              key={tb}
              className={tabClass('admin', tab === tb)}
              onClick={() => setTab(tb)}
            >
              {t(`admin.tab.${tb}`)}
            </button>
          ))}
        </div>

        {tab === 'overview' && stats && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stat(t('admin.totalUsers'), stats.users.total)}
              {stat(t('admin.patients'), stats.users.patients)}
              {stat(t('admin.doctors'), stats.users.doctors)}
              {stat(t('admin.revenue'), `${stats.revenue.toLocaleString()}`, 'text-emerald-600')}
              {stat(t('admin.consultations'), stats.consultations.total)}
              {stat(t('admin.pending'), stats.consultations.pending, 'text-amber-600')}
              {stat(t('admin.completed'), stats.consultations.completed, 'text-emerald-600')}
              {stat(t('admin.urgent'), stats.consultations.urgent, 'text-red-600')}
              {stat(t('admin.prescriptions'), stats.prescriptions)}
              {stat(t('admin.labOrders'), stats.labOrders)}
              {stat(t('admin.medicines'), stats.medicines)}
              {stat(t('admin.lowStock'), stats.lowStock, 'text-amber-600')}
            </div>
            <div className="card p-4">
              <h3 className="mb-3 font-semibold text-slate-700">{t('admin.staffBreakdown')}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-lg font-bold">{stats.users.finance}</p>
                  <p className="text-xs text-slate-500">{t('role.finance')}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-lg font-bold">{stats.users.pharmacy}</p>
                  <p className="text-xs text-slate-500">{t('role.pharmacy')}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-lg font-bold">{stats.consultations.inProgress}</p>
                  <p className="text-xs text-slate-500">{t('admin.inProgress')}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-lg font-bold">{stats.users.doctors}</p>
                  <p className="text-xs text-slate-500">{t('role.doctor')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'assignments' && <AssignmentsPanel />}

        {tab === 'users' && (
          <div className="mt-6 space-y-3">
            <select
              className="input max-w-xs"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">{t('admin.allRoles')}</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
            {filteredUsers.map((u) => (
              <div key={u.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-700">{u.fullName ?? '—'}</p>
                  <p className="truncate text-xs text-slate-500">{u.email ?? u.phoneNumber ?? '—'}</p>
                </div>
                <select
                  className="input w-32 py-1.5 text-xs"
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value as Role)}
                  disabled={u.id === profile?.id}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`role.${r}`)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {tab === 'doctors' && (
          <div className="mt-6 space-y-3">
            {doctors.length === 0 ? (
              <p className="card p-6 text-center text-slate-500">{t('admin.noDoctors')}</p>
            ) : (
              doctors.map((d) => (
                <div key={d.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-700">{d.name}</p>
                    <span className="text-sm text-amber-500">
                      {d.avgRating ? `★ ${d.avgRating}` : t('admin.noRating')}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="font-bold">{d.consultations}</p>
                      <p className="text-xs text-slate-500">{t('admin.consultations')}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="font-bold">{d.completed}</p>
                      <p className="text-xs text-slate-500">{t('admin.completed')}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="font-bold text-emerald-600">{d.revenue.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">RWF</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'audit' && (
          <div className="card mt-6 divide-y divide-slate-100">
            {audit.length === 0 ? (
              <p className="p-6 text-center text-slate-500">{t('admin.noAudit')}</p>
            ) : (
              audit.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-700">{a.action}</p>
                    <p className="text-xs text-slate-500">
                      {a.actorName ?? '—'} · {a.entity}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'profile' && <ProfilePanel />}
      </main>
    </AppShell>
  );
}
