import { useState } from 'react';
import { useAuth } from '../../state/AuthProvider';
import { useLocale } from '../../state/LocaleProvider';
import { consultationService } from '../../services/consultationService';
import { downloadBlob, generateMyDataPdf } from '../../services/pdfService';
import { ApiError } from '../../data/api';

const ROLE_STYLES: Record<string, string> = {
  patient: 'bg-emerald-100 text-emerald-700',
  doctor: 'bg-brand-100 text-brand-700',
  finance: 'bg-amber-100 text-amber-700',
  pharmacy: 'bg-violet-100 text-violet-700',
};

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Unified, editable profile used by every role's dashboard. */
export function ProfilePanel() {
  const { profile, updateProfile, changePassword } = useAuth();
  const { t } = useLocale();

  if (!profile) return null;
  const role = profile.role;

  return (
    <div className="mt-6 space-y-4">
      {/* Identity header */}
      <div className="card flex items-center gap-4 p-6">
        <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold ${ROLE_STYLES[role] ?? 'bg-slate-100 text-slate-600'}`}>
          {initials(profile.fullName)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-slate-800">{profile.fullName ?? '—'}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_STYLES[role] ?? 'bg-slate-100 text-slate-600'}`}>
              {t(`role.${role}`)}
            </span>
            <span className="truncate">{profile.phoneNumber ?? profile.email}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {t('profile.memberSince')}: {new Date(profile.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      <PersonalInfoCard />
      {role === 'doctor' && <PracticeCard />}
      {role === 'patient' && <ClinicalCard />}
      {role === 'patient' && <ExportCard />}
      <SecurityCard />
    </div>
  );

  function PersonalInfoCard() {
    const isPatient = role === 'patient';
    const [fullName, setFullName] = useState(profile!.fullName ?? '');
    const [contact, setContact] = useState((isPatient ? profile!.phoneNumber : profile!.email) ?? '');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    async function save() {
      setBusy(true);
      setMsg(null);
      try {
        await updateProfile({
          fullName,
          ...(isPatient ? { phoneNumber: contact } : { email: contact }),
        });
        setMsg({ ok: true, text: t('common.saved') });
      } catch (e) {
        setMsg({ ok: false, text: e instanceof ApiError ? e.message : t('common.error') });
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="card p-6">
        <h3 className="font-semibold text-slate-700">{t('profile.personalTitle')}</h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">{t('profile.personalDesc')}</p>
        <label className="label">{t('auth.fullName')}</label>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <label className="label mt-3">{isPatient ? t('auth.phone') : t('auth.email')}</label>
        <input
          className="input"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          type={isPatient ? 'tel' : 'email'}
        />
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? t('common.loading') : t('common.save')}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? 'text-brand-600' : 'text-red-600'}`}>{msg.text}</span>
          )}
        </div>
      </div>
    );
  }

  function PracticeCard() {
    const [clinicName, setClinicName] = useState(profile!.clinicName ?? '');
    const [fee, setFee] = useState(profile!.consultationFee?.toString() ?? '');
    const [momo, setMomo] = useState(profile!.momoNumber ?? '');
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);

    async function save() {
      setBusy(true);
      setSaved(false);
      try {
        await updateProfile({
          clinicName,
          momoNumber: momo,
          consultationFee: fee ? Number(fee) : undefined,
        });
        setSaved(true);
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="card p-6">
        <h3 className="font-semibold text-slate-700">{t('profile.practiceTitle')}</h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">{t('profile.practiceDesc')}</p>
        <label className="label">{t('profile.clinicName')}</label>
        <input className="input" value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t('profile.consultationFee')}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t('profile.momoNumber')}</label>
            <input className="input" value={momo} onChange={(e) => setMomo(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? t('common.loading') : t('common.save')}
          </button>
          {saved && <span className="text-sm text-brand-600">{t('common.saved')}</span>}
        </div>
      </div>
    );
  }

  function ClinicalCard() {
    const [allergies, setAllergies] = useState(profile!.allergies ?? '');
    const [chronic, setChronic] = useState(profile!.chronicConditions ?? '');
    const [consent, setConsent] = useState(profile!.aiConsent);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);

    async function save() {
      setBusy(true);
      setSaved(false);
      try {
        await updateProfile({ allergies, chronicConditions: chronic, aiConsent: consent });
        setSaved(true);
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="card p-6">
        <h3 className="font-semibold text-slate-700">{t('profile.clinicalTitle')}</h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">{t('profile.clinicalDesc')}</p>
        <label className="label">{t('profile.allergies')}</label>
        <input
          className="input"
          value={allergies}
          onChange={(e) => setAllergies(e.target.value)}
          placeholder={t('profile.allergiesPlaceholder')}
        />
        <label className="label mt-3">{t('profile.chronic')}</label>
        <input
          className="input"
          value={chronic}
          onChange={(e) => setChronic(e.target.value)}
          placeholder={t('profile.chronicPlaceholder')}
        />
        <label className="mt-4 flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>{t('auth.consentText')}</span>
        </label>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? t('common.loading') : t('common.save')}
          </button>
          {saved && <span className="text-sm text-brand-600">{t('common.saved')}</span>}
        </div>
      </div>
    );
  }

  function ExportCard() {
    const [busy, setBusy] = useState(false);
    async function exportData() {
      setBusy(true);
      try {
        const data = await consultationService.getMyData();
        const blob = await generateMyDataPdf(data);
        downloadBlob(blob, 'gara-my-health-record.pdf');
      } finally {
        setBusy(false);
      }
    }
    return (
      <div className="card p-6">
        <h3 className="font-semibold text-slate-700">{t('profile.exportTitle')}</h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">{t('profile.exportDesc')}</p>
        <button className="btn-ghost" onClick={exportData} disabled={busy}>
          ⬇ {busy ? t('common.loading') : t('profile.exportBtn')}
        </button>
      </div>
    );
  }

  function SecurityCard() {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    async function save() {
      if (next !== confirm) {
        setMsg({ ok: false, text: t('profile.passwordMismatch') });
        return;
      }
      setBusy(true);
      setMsg(null);
      try {
        await changePassword(current, next);
        setCurrent('');
        setNext('');
        setConfirm('');
        setMsg({ ok: true, text: t('profile.passwordChanged') });
      } catch (e) {
        setMsg({ ok: false, text: e instanceof ApiError ? e.message : t('common.error') });
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="card p-6">
        <h3 className="font-semibold text-slate-700">{t('profile.securityTitle')}</h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">{t('profile.securityDesc')}</p>
        <label className="label">{t('profile.currentPassword')}</label>
        <input
          className="input"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{t('profile.newPassword')}</label>
            <input
              className="input"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t('profile.confirmPassword')}</label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={save}
            disabled={busy || !current || !next}
          >
            {busy ? t('common.loading') : t('profile.changePassword')}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? 'text-brand-600' : 'text-red-600'}`}>{msg.text}</span>
          )}
        </div>
      </div>
    );
  }
}
