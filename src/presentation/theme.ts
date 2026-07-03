// Central colour system for the app. Two ideas:
//   1. Each ROLE gets an identity accent (wayfinding: "which workspace am I in?")
//      while the shared teal brand stays in the app header/logo.
//   2. Semantic maps (urgency / status) live here as the single source of truth
//      so they can't drift between components.
//
// NOTE: Tailwind's JIT only sees FULL literal class strings, so every colour
// class is written out in full below (no runtime string concatenation of shades).

// --- Role identity ---------------------------------------------------------

/** Active navigation tab background per role. */
export const ROLE_TAB_ACTIVE: Record<string, string> = {
  patient: 'bg-emerald-600 text-white',
  doctor: 'bg-brand-600 text-white',
  finance: 'bg-amber-600 text-white',
  pharmacy: 'bg-violet-600 text-white',
  admin: 'bg-slate-800 text-white',
};

/** Soft role badge/avatar tint. */
export const ROLE_BADGE: Record<string, string> = {
  patient: 'bg-emerald-100 text-emerald-700',
  doctor: 'bg-brand-100 text-brand-700',
  finance: 'bg-amber-100 text-amber-700',
  pharmacy: 'bg-violet-100 text-violet-700',
  admin: 'bg-slate-800 text-white',
};

/** Left accent bar color per role (used on dashboard page titles). */
export const ROLE_ACCENT_BORDER: Record<string, string> = {
  patient: 'border-emerald-500',
  doctor: 'border-brand-500',
  finance: 'border-amber-500',
  pharmacy: 'border-violet-500',
  admin: 'border-slate-800',
};

/** Accent text color per role. */
export const ROLE_ACCENT_TEXT: Record<string, string> = {
  patient: 'text-emerald-600',
  doctor: 'text-brand-600',
  finance: 'text-amber-600',
  pharmacy: 'text-violet-600',
  admin: 'text-slate-800',
};

const INACTIVE_TAB = 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50';

/** Active-state classes for a role's tab (falls back to the teal brand). */
export function roleTabActive(role: string | undefined): string {
  return ROLE_TAB_ACTIVE[role ?? ''] ?? 'bg-brand-600 text-white';
}

/**
 * Full className for a pill tab. `size` controls padding/text so dense
 * dashboards (many tabs, e.g. doctor) can use the compact variant.
 */
export function tabClass(role: string | undefined, active: boolean, size: 'md' | 'sm' = 'md'): string {
  const sizing =
    size === 'sm'
      ? 'px-3 py-1.5 text-xs sm:text-sm'
      : 'px-4 py-2 text-sm';
  const base = `whitespace-nowrap rounded-full font-semibold transition ${sizing}`;
  return `${base} ${active ? `${roleTabActive(role)} shadow-sm` : INACTIVE_TAB}`;
}

// --- Semantic maps ---------------------------------------------------------

/** Triage urgency. */
export const URGENCY_STYLE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

/** Consultation care status. */
export const CARE_STATUS_STYLE: Record<string, string> = {
  pending_payment: 'bg-amber-100 text-amber-700',
  in_process: 'bg-blue-100 text-blue-700',
  complete: 'bg-emerald-100 text-emerald-700',
};

/** Appointment / booking status. */
export const APPT_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  completed: 'bg-slate-200 text-slate-600',
};
