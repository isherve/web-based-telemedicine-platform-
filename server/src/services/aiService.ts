// Supported languages across the platform. Offline fallbacks only ship English
// + Kinyarwanda copy, so French degrades to the English offline path, but the
// online (Groq) path replies fully in French.
export type Lang = 'en' | 'rw' | 'fr';

/**
 * Language name embedded in AI system prompts. For Kinyarwanda we add an explicit
 * guard: general LLMs tend to drift into Swahili when asked for "Kinyarwanda", so
 * we spell out that it must be pure Ikinyarwanda as spoken in Rwanda.
 */
export function langName(l: Lang): string {
  if (l === 'rw')
    return 'Kinyarwanda (reply ONLY in pure Ikinyarwanda as spoken in Rwanda; do NOT use Swahili, English or French words — keep medical terms simple)';
  if (l === 'fr') return 'French';
  return 'English';
}

/** Coerce arbitrary request input to a supported language. */
export function normLang(v: unknown): Lang {
  return v === 'rw' ? 'rw' : v === 'fr' ? 'fr' : 'en';
}

/**
 * The AI chatbots operate in English and French only (Kinyarwanda is disabled
 * for AI). This maps the UI language to a supported chatbot language so both the
 * online and offline paths never reply in Kinyarwanda.
 */
export function chatLang(l: Lang): Lang {
  return l === 'fr' ? 'fr' : 'en';
}

/**
 * Instruction for conversational assistants: reply in whichever supported
 * language the user actually writes in (English or French), falling back to the
 * selected language when the message language is unclear. Kinyarwanda is not
 * offered by the AI chatbots.
 */
export function multilingualDirective(preferred: Lang): string {
  const fallback = preferred === 'fr' ? 'French' : 'English';
  return `CRITICAL LANGUAGE RULE: You must reply ONLY in English or French. NEVER reply in Kinyarwanda, Swahili, or any other language. If the user writes in French, reply in French. In every other case — including when the user writes in Kinyarwanda, Swahili, mixes languages, or the language is unclear — reply in ${fallback}.`;
}

/** "General guidance, not a diagnosis" disclaimer, localized. */
function generalDisclaimer(l: Lang): string {
  if (l === 'rw') return 'Ibi ni inama rusange — si isuzuma. Muganga wawe niwe ufata icyemezo.';
  if (l === 'fr')
    return 'Conseils généraux uniquement — pas un diagnostic. Votre médecin prend la décision finale.';
  return 'General guidance only — not a diagnosis. Your doctor makes the final decision.';
}

/** "Gara assistant, not a doctor" disclaimer, localized. */
function assistantDisclaimer(l: Lang): string {
  if (l === 'rw') return 'Ni umufasha wa Gara — si muganga.';
  if (l === 'fr') return 'Assistant Gara — pas un médecin.';
  return 'Gara assistant — not a doctor.';
}

interface TriageInput {
  biologicalSex: string;
  severity: string;
  duration: string;
  symptomCategory: string;
  symptomDescription: string;
  language: Lang;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * AI clinical brief. Uses Groq llama-3.3-70b-versatile when GROQ_API_KEY is set,
 * otherwise a local template so the app works fully offline.
 */
export async function generateAiBrief(input: TriageInput): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) return buildOfflineBrief(input);

  const lang = langName(input.language);
  const system = `You are a clinical documentation assistant. Produce a concise, structured summary of what the patient reported. Do NOT make diagnostic assertions here. Output in ${lang}.`;
  return callGroq(groqKey, system, formatTriage(input)).catch(() => buildOfflineBrief(input));
}

/**
 * AI disease suggestions (differential) after triage. Uses Groq when available,
 * otherwise a local heuristic keyed on the symptom category. This is decision
 * SUPPORT for the doctor, not a diagnosis — always carries a disclaimer.
 */
export async function generateDiseaseSuggestions(input: TriageInput): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) return buildOfflineSuggestions(input);

  const lang = langName(input.language);
  const system = `You are a clinical decision-support assistant for a doctor in Rwanda. Based on the patient's triage, list 3-5 possible conditions to consider (a differential), most likely first. For each, give a one-line reason referencing the reported symptoms. End with a short disclaimer that this is not a diagnosis and clinical judgement is required. Be concise. Output in ${lang}.`;
  return callGroq(groqKey, system, formatTriage(input)).catch(() => buildOfflineSuggestions(input));
}

/**
 * Deterministic urgency score (0-100) + level, derived from triage. Runs fully
 * offline so severe patients are auto-prioritized in the doctor's queue even
 * with no internet. Red-flag keywords bump the score sharply.
 */
export interface UrgencyResult {
  level: 'low' | 'medium' | 'high';
  score: number;
  reason: string;
}

const RED_FLAGS = [
  'chest pain', 'difficulty breathing', 'shortness of breath', 'unconscious',
  'seizure', 'bleeding', 'blood', 'suicide', 'severe pain', 'can\'t breathe',
  'not breathing', 'stroke', 'paralysis', 'fainting', 'confusion', 'stiff neck',
  // Kinyarwanda
  'guhumeka nabi', 'kubura umutima', 'kuva amaraso', 'kwiyahura', 'gucika intege',
  'ububabare bukabije', 'kuzimira',
];

export function scoreUrgency(input: TriageInput): UrgencyResult {
  let score = 0;
  const desc = `${input.symptomDescription} ${input.symptomCategory}`.toLowerCase();

  const sev = (input.severity || '').toLowerCase();
  if (sev.includes('severe') || sev.includes('bukabije')) score += 45;
  else if (sev.includes('moderate') || sev.includes('hagati')) score += 20;
  else score += 5;

  const dur = (input.duration || '').toLowerCase();
  if (/(week|month|icyumweru|ukwezi|chronic|igihe kirekire)/.test(dur)) score += 15;

  const flagHit = RED_FLAGS.find((f) => desc.includes(f));
  if (flagHit) score += 45;

  // Pregnancy + any significant symptom warrants closer review.
  if (/(pregnan|gutwita|ubushake)/.test(desc) && score >= 20) score += 10;

  score = Math.min(100, score);
  const level: UrgencyResult['level'] = score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low';
  const reason = flagHit
    ? `Red-flag symptom detected: "${flagHit}"`
    : level === 'high'
      ? 'High reported severity'
      : level === 'medium'
        ? 'Moderate severity / duration'
        : 'Routine presentation';
  return { level, score, reason };
}

function formatTriage(input: TriageInput): string {
  return [
    `Biological sex: ${input.biologicalSex}`,
    `Severity: ${input.severity}`,
    `Duration: ${input.duration}`,
    `Symptom category: ${input.symptomCategory}`,
    `Description: ${input.symptomDescription}`,
  ].join('\n');
}

async function callGroq(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: 700,
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('AI rate limit reached. Please try again in a minute.');
    throw new Error(`Groq API error: ${res.status}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty AI response');
  return content;
}

function buildOfflineBrief(input: TriageInput): string {
  if (input.language === 'rw') {
    return [
      'INCAMAKE Y\'UBURWAYI',
      `Igitsina: ${input.biologicalSex}`,
      `Ubukana: ${input.severity}`,
      `Igihe byamaze: ${input.duration}`,
      `Icyiciro: ${input.symptomCategory}`,
      `Ibisobanuro: ${input.symptomDescription}`,
      '',
      'Iyi ni incamake y\'ibyo umurwayi yatanze — si isuzuma rya muganga.',
    ].join('\n');
  }
  return [
    'PATIENT-REPORTED SUMMARY',
    `Biological sex: ${input.biologicalSex}`,
    `Severity: ${input.severity}`,
    `Duration: ${input.duration}`,
    `Symptom category: ${input.symptomCategory}`,
    `Description: ${input.symptomDescription}`,
    '',
    'This organizes what the patient reported — not a medical diagnosis.',
  ].join('\n');
}

// Heuristic differential map for offline mode, keyed on symptom category text.
const OFFLINE_DIFFERENTIALS: { match: string[]; en: string[]; rw: string[] }[] = [
  {
    match: ['fever', 'umwanda', 'umuriro'],
    en: ['Malaria', 'Viral infection (flu-like)', 'Typhoid fever', 'Urinary tract infection'],
    rw: ['Malariya', 'Indwara y\'ubwandu bwa virusi', 'Tifoyide', 'Indwara y\'ubwandu bw\'umuyoboro w\'inkari'],
  },
  {
    match: ['cough', 'inkorora', 'breathing', 'guhumeka'],
    en: ['Upper respiratory infection', 'Bronchitis', 'Pneumonia', 'Asthma', 'COVID-19 / TB (rule out)'],
    rw: ['Ubwandu bw\'imyanya y\'ubuhumekero yo hejuru', 'Bronchite', 'Umusonga', 'Asima', 'COVID-19 / Igituntu (kureba)'],
  },
  {
    match: ['headache', 'umutwe'],
    en: ['Tension headache', 'Migraine', 'Dehydration', 'Hypertension', 'Malaria (if with fever)'],
    rw: ['Umutwe uterwa n\'umunaniro', 'Migraine', 'Kubura amazi mu mubiri', 'Umuvuduko w\'amaraso', 'Malariya (niba hari umuriro)'],
  },
  {
    match: ['stomach', 'inda', 'diarrhea', 'zo mu nda'],
    en: ['Gastroenteritis', 'Food poisoning', 'Peptic ulcer', 'Intestinal parasites'],
    rw: ['Indwara yo mu nda (gastroenteritis)', 'Uburozi bw\'ibiryo', 'Ibisebe byo mu gifu', 'Inzoka zo mu nda'],
  },
  {
    match: ['skin', 'ubusa', 'rash'],
    en: ['Allergic reaction / dermatitis', 'Fungal infection', 'Scabies', 'Eczema'],
    rw: ['Ingaruka za allergie / dermatite', 'Ubwandu bwa fungus', 'Ubuheri', 'Eczema'],
  },
  {
    match: ['urinary', 'kwituma', 'inkari'],
    en: ['Urinary tract infection', 'Kidney stones', 'Sexually transmitted infection'],
    rw: ['Ubwandu bw\'umuyoboro w\'inkari', 'Amabuye mu mpyiko', 'Indwara zandurira mu mibonano'],
  },
  {
    match: ['injury', 'igikomere'],
    en: ['Soft-tissue injury / sprain', 'Fracture (rule out)', 'Wound infection (if delayed)'],
    rw: ['Igikomere cy\'imikaya / gukotamira', 'Gukuka kw\'igufa (kureba)', 'Ubwandu bw\'igisebe (niba byatinze)'],
  },
  {
    match: ['pregnancy', 'ubwiyongere', 'ubushake'],
    en: ['Normal pregnancy symptoms', 'Anemia in pregnancy', 'Pre-eclampsia (if headache/BP)', 'UTI in pregnancy'],
    rw: ['Ibimenyetso bisanzwe byo gutwita', 'Amaraso make mu gihe cyo gutwita', 'Pre-eclampsia (niba hari umutwe/umuvuduko)', 'Ubwandu bw\'inkari mu gihe cyo gutwita'],
  },
  {
    match: ['mental', 'mu mutwe'],
    en: ['Anxiety', 'Depression', 'Stress-related disorder', 'Sleep disorder'],
    rw: ['Guhangayika', 'Kwiheba', 'Uburwayi buterwa na stress', 'Ibibazo by\'ibitotsi'],
  },
];

function buildOfflineSuggestions(input: TriageInput): string {
  const rw = input.language === 'rw';
  const cat = input.symptomCategory.toLowerCase();
  const desc = input.symptomDescription.toLowerCase();
  const entry =
    OFFLINE_DIFFERENTIALS.find((d) => d.match.some((m) => cat.includes(m) || desc.includes(m))) ??
    null;

  const list = entry
    ? rw
      ? entry.rw
      : entry.en
    : rw
      ? ['Bisaba isuzuma rya muganga kugira ngo hamenyekane impamvu.']
      : ['Requires clinician assessment to determine the cause.'];

  const severe = input.severity === 'severe';
  const header = rw ? 'IBISHOBORA GUTEKEREZWAHO (AI)' : 'POSSIBLE CONDITIONS TO CONSIDER (AI)';
  const lines = list.map((d, i) => `${i + 1}. ${d}`);
  const urgency = severe
    ? rw
      ? '\n⚠ Ubukana buri hejuru — suzuma vuba.'
      : '\n⚠ High severity — prioritize urgent review.'
    : '';
  const disclaimer = rw
    ? '\nIcyitonderwa: Ibi ni inama za AI zishingiye ku byo umurwayi yavuze, si isuzuma. Muganga niwe ufata icyemezo.'
    : '\nDisclaimer: These are AI suggestions based on reported symptoms, not a diagnosis. Clinical judgement decides.';

  return [header, ...lines, urgency, disclaimer].filter(Boolean).join('\n');
}

// ---- AI Chatbot layer (triage guide, patient assistant, doctor suggestions) ----

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

const TRIAGE_FIELDS: (keyof TriageChatDraft)[] = [
  'biologicalSex',
  'severity',
  'duration',
  'symptomCategory',
  'symptomDescription',
];

/**
 * Conversational triage guide. Collects the same fields as the form wizard,
 * step by step. Groq makes replies natural when available; offline mode uses a
 * deterministic state machine with quick-reply chips.
 */
export async function triageChatbot(
  messages: ChatTurn[],
  draft: TriageChatDraft,
  uiLanguage: Lang
): Promise<TriageChatResult> {
  const language = chatLang(uiLanguage);
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey && messages.length > 0) {
    try {
      return await triageChatbotGroq(groqKey, messages, draft, language);
    } catch {
      // fall through to offline
    }
  }
  return triageChatbotOffline(messages, draft, language);
}

/** Patient-side AI helper during an active consultation. */
export async function patientAssistant(
  ctx: {
    symptomCategory: string | null;
    symptomDescription: string | null;
    severity: string | null;
    aiSuggestions: string | null;
    allergies: string | null;
    chronicConditions: string | null;
  },
  messages: ChatTurn[],
  question: string,
  uiLanguage: Lang
): Promise<AssistantResult> {
  const language = chatLang(uiLanguage);
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      return await patientAssistantGroq(groqKey, ctx, messages, question, language);
    } catch {
      // fall through
    }
  }
  return patientAssistantOffline(ctx, question, language);
}

/** Doctor reply suggestions based on chat history + triage context. */
export async function doctorReplySuggestions(
  ctx: {
    symptomCategory: string | null;
    symptomDescription: string | null;
    severity: string | null;
    aiBriefSummary: string | null;
    patientName: string | null;
    patientAllergies: string | null;
    patientChronic: string | null;
  },
  chatMessages: { senderIsDoctor: boolean; content: string }[],
  uiLanguage: Lang
): Promise<DoctorSuggestionsResult> {
  const language = chatLang(uiLanguage);
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      return await doctorSuggestionsGroq(groqKey, ctx, chatMessages, language);
    } catch {
      // fall through
    }
  }
  return doctorSuggestionsOffline(ctx, chatMessages, language);
}

// --- Groq implementations ---

async function triageChatbotGroq(
  apiKey: string,
  messages: ChatTurn[],
  draft: TriageChatDraft,
  language: Lang
): Promise<TriageChatResult> {
  const system = `You are Gara, a friendly telehealth triage assistant in Rwanda. Guide the patient through collecting:
- biologicalSex: male or female
- severity: mild, moderate, or severe
- duration: today, few_days, week_plus, or month_plus
- symptomCategory: one of fever, cough, headache, stomach, skin, injury, breathing, diarrhea, urinary, pregnancy, mental, other
- symptomDescription: free-text details

Current draft JSON: ${JSON.stringify(draft)}

Ask ONE question at a time. Be warm and concise. Output ONLY valid JSON:
{"reply":"your message","draft":{"biologicalSex?":"","severity?":"","duration?":"","symptomCategory?":"","symptomDescription?":""},"readyToSubmit":false,"quickReplies":["option1","option2"]}

Merge new info into draft from the patient's answers. Set readyToSubmit true only when all 5 fields are filled, then summarize and ask them to confirm.
${multilingualDirective(language)} quickReplies should be short labels in the same language you reply in.`;

  const groqMessages = [
    { role: 'system' as const, content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const raw = await callGroqChat(apiKey, groqMessages, 0.4, 800);
  const parsed = parseJsonResponse<TriageChatResult>(raw);
  if (!parsed?.reply) throw new Error('Invalid triage chat response');
  return {
    reply: parsed.reply,
    draft: { ...draft, ...parsed.draft },
    readyToSubmit: !!parsed.readyToSubmit && isDraftComplete({ ...draft, ...parsed.draft }),
    quickReplies: parsed.quickReplies,
  };
}

async function patientAssistantGroq(
  apiKey: string,
  ctx: Parameters<typeof patientAssistant>[0],
  messages: ChatTurn[],
  question: string,
  language: Lang
): Promise<AssistantResult> {
  const system = `You are Gara Health Assistant helping a patient during a telemedicine consultation in Rwanda.
You are NOT a doctor. Give general health information, explain medical terms simply, suggest when to seek emergency care, and remind them their doctor will make final decisions.
Never prescribe specific drugs or dosages. Be concise (2-4 sentences). ${multilingualDirective(language)}

Patient context:
- Symptoms: ${ctx.symptomCategory ?? 'unknown'} — ${ctx.symptomDescription ?? ''}
- Severity: ${ctx.severity ?? 'unknown'}
- Allergies: ${ctx.allergies ?? 'none recorded'}
- Chronic conditions: ${ctx.chronicConditions ?? 'none recorded'}
${ctx.aiSuggestions ? `- AI differential (for reference): ${ctx.aiSuggestions.slice(0, 300)}` : ''}`;

  const groqMessages = [
    { role: 'system' as const, content: system },
    ...messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: question },
  ];
  const reply = await callGroqChat(apiKey, groqMessages, 0.5, 400);
  return { reply, disclaimer: generalDisclaimer(language) };
}

async function doctorSuggestionsGroq(
  apiKey: string,
  ctx: Parameters<typeof doctorReplySuggestions>[0],
  chatMessages: { senderIsDoctor: boolean; content: string }[],
  language: Lang
): Promise<DoctorSuggestionsResult> {
  const lang = langName(language);
  const history = chatMessages
    .slice(-8)
    .map((m) => `${m.senderIsDoctor ? 'Doctor' : 'Patient'}: ${m.content}`)
    .join('\n');
  const system = `You are a clinical communication assistant for a doctor in Rwanda. Suggest 3 short, professional reply messages the doctor could send next in the chat.
Be empathetic, clear, and clinically appropriate. Do not diagnose. Language: ${lang}.
Output ONLY valid JSON: {"suggestions":["reply1","reply2","reply3"],"note":"optional brief tip"}

Patient: ${ctx.patientName ?? 'Patient'}
Triage: ${ctx.symptomCategory} — ${ctx.symptomDescription} (${ctx.severity})
Allergies: ${ctx.patientAllergies ?? 'none'} | Chronic: ${ctx.patientChronic ?? 'none'}
${ctx.aiBriefSummary ? `Brief: ${ctx.aiBriefSummary.slice(0, 200)}` : ''}
Recent chat:
${history || '(no messages yet)'}`;

  const raw = await callGroqChat(apiKey, [{ role: 'system', content: system }, { role: 'user', content: 'Suggest replies.' }], 0.4, 500);
  const parsed = parseJsonResponse<DoctorSuggestionsResult>(raw);
  if (!parsed?.suggestions?.length) throw new Error('No suggestions');
  return parsed;
}

async function callGroqChat(
  apiKey: string,
  messages: { role: string; content: string }[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('AI rate limit');
    throw new Error(`Groq error ${res.status}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty AI response');
  return content;
}

function parseJsonResponse<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function isDraftComplete(d: TriageChatDraft): boolean {
  return TRIAGE_FIELDS.every((f) => !!d[f]?.trim());
}

// --- Offline implementations ---

function triageChatbotOffline(
  messages: ChatTurn[],
  draft: TriageChatDraft,
  language: Lang
): TriageChatResult {
  const rw = language === 'rw';
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

  // Apply user answer to the current missing field.
  const updated = { ...draft };
  if (!updated.biologicalSex) {
    const sex = parseSex(lastUser);
    if (sex) updated.biologicalSex = sex;
  } else if (!updated.severity) {
    const sev = parseSeverity(lastUser);
    if (sev) updated.severity = sev;
  } else if (!updated.duration) {
    const dur = parseDuration(lastUser);
    if (dur) updated.duration = dur;
  } else if (!updated.symptomCategory) {
    const cat = parseCategory(lastUser);
    if (cat) updated.symptomCategory = cat;
  } else if (!updated.symptomDescription && lastUser.trim()) {
    updated.symptomDescription = lastUser.trim();
  }

  if (isDraftComplete(updated)) {
    return {
      reply: rw
        ? `Murakoze! Nasobanuye ibyo mwavuze:\n• Igitsina: ${updated.biologicalSex}\n• Ubukana: ${updated.severity}\n• Igihe: ${updated.duration}\n• Icyiciro: ${updated.symptomCategory}\n• Ibisobanuro: ${updated.symptomDescription}\n\nKanda "Ohereza isuzuma" kugira ngo ukomeze.`
        : `Thank you! Here's what I captured:\n• Sex: ${updated.biologicalSex}\n• Severity: ${updated.severity}\n• Duration: ${updated.duration}\n• Category: ${updated.symptomCategory}\n• Details: ${updated.symptomDescription}\n\nTap "Submit triage" to continue.`,
      draft: updated,
      readyToSubmit: true,
    };
  }

  if (!updated.biologicalSex) {
    return {
      reply: rw
        ? 'Muraho! Ndi Gara, umufasha wawe wo gutangira isuzuma. Mbere ya byose, mwibarwa mu gitsina ki?'
        : "Hello! I'm Gara, your triage assistant. First, what is your biological sex?",
      draft: updated,
      readyToSubmit: false,
      quickReplies: rw ? ['Gabo', 'Gore'] : ['Male', 'Female'],
    };
  }
  if (!updated.severity) {
    return {
      reply: rw ? 'Ubukana bw\'ibimenyetso ni buhe? (buke / hagati / bukabije)' : 'How severe are your symptoms? (mild / moderate / severe)',
      draft: updated,
      readyToSubmit: false,
      quickReplies: rw ? ['Buke', 'Hagati', 'Bukabije'] : ['Mild', 'Moderate', 'Severe'],
    };
  }
  if (!updated.duration) {
    return {
      reply: rw ? 'Ibi bimenyetso byamaze igihe kingana iki?' : 'How long have you had these symptoms?',
      draft: updated,
      readyToSubmit: false,
      quickReplies: rw ? ['Uyu munsi', 'Iminsi mike', 'Icyumweru+', 'Ukwezi+'] : ['Today', 'Few days', 'A week+', 'A month+'],
    };
  }
  if (!updated.symptomCategory) {
    return {
      reply: rw ? 'Icyiciro cy\'ibimenyetso ni ikihe?' : 'Which symptom category best describes your problem?',
      draft: updated,
      readyToSubmit: false,
      quickReplies: rw
        ? ['Umwanda', 'Inkorora', 'Umutwe', 'Inda', 'Ibindi']
        : ['Fever', 'Cough', 'Headache', 'Stomach', 'Other'],
    };
  }
  return {
    reply: rw
      ? 'Sobanura neza ibimenyetso byawe (aho bibera, uko bimeze, n\'ibindi bisobanuro).'
      : 'Please describe your symptoms in your own words (location, how they feel, anything else relevant).',
    draft: updated,
    readyToSubmit: false,
  };
}

function parseSex(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/(male|gabo|man|umugabo)/.test(t)) return 'male';
  if (/(female|gore|woman|umugore)/.test(t)) return 'female';
  return undefined;
}

function parseSeverity(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/(mild|buke|light)/.test(t)) return 'mild';
  if (/(moderate|hagati|medium)/.test(t)) return 'moderate';
  if (/(severe|bukabije|bad|strong)/.test(t)) return 'severe';
  return undefined;
}

function parseDuration(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/(today|uyu munsi|this morning|just)/.test(t)) return 'today';
  if (/(few days|days|iminsi|mike)/.test(t)) return 'few_days';
  if (/(week|icyumweru)/.test(t)) return 'week_plus';
  if (/(month|ukwezi|chronic|kirekire)/.test(t)) return 'month_plus';
  return undefined;
}

function parseCategory(text: string): string | undefined {
  const t = text.toLowerCase();
  const map: [RegExp, string][] = [
    [/fever|umwanda|umuriro/, 'fever'],
    [/cough|inkorora/, 'cough'],
    [/head|umutwe/, 'headache'],
    [/stomach|inda|belly/, 'stomach'],
    [/skin|rash|ubusa/, 'skin'],
    [/injur|igikomere|wound/, 'injury'],
    [/breath|guhumeka/, 'breathing'],
    [/diarrh|zo mu nda/, 'diarrhea'],
    [/urinar|kwituma|inkari/, 'urinary'],
    [/pregnan|ubwiyongere|gutwita/, 'pregnancy'],
    [/mental|mutwe|anxi|depress/, 'mental'],
    [/other|ibindi/, 'other'],
  ];
  for (const [re, id] of map) {
    if (re.test(t)) return id;
  }
  return undefined;
}

function patientAssistantOffline(
  ctx: Parameters<typeof patientAssistant>[0],
  question: string,
  language: Lang
): AssistantResult {
  const rw = language === 'rw';
  const q = question.toLowerCase();
  const disclaimer = rw
    ? 'Ibi ni inama rusange — si isuzuma. Muganga wawe niwe ufata icyemezo.'
    : 'General guidance only — not a diagnosis. Your doctor makes the final decision.';

  if (/(emergency|urgent|911|112|immediately|vuba|akazi)/.test(q)) {
    return {
      reply: rw
        ? 'Niba ufite ibimenyetso bikomeye (gukomerwa guhumeka, ububabare bukabije mu gitima, kuvuza amaraso menshi, cyangwa kuzimira), saba ubufasha buhita — hamagara 912 cyangwa ujye mu ivuriro rikizeyewo.'
        : 'If you have severe symptoms (trouble breathing, crushing chest pain, heavy bleeding, or loss of consciousness), seek emergency care immediately — call 912 or go to the nearest hospital.',
      disclaimer,
    };
  }
  if (/(medicine|drug|miti|prescri)/.test(q)) {
    return {
      reply: rw
        ? `Ntabwo nemera gutanga miti. Muganga wawe azabona ibimenyetso byawe (${ctx.symptomCategory ?? '—'}) maze akugire inama. ${ctx.allergies ? `Menya ko ufite allergie: ${ctx.allergies}.` : ''}`
        : `I cannot prescribe medication. Your doctor will review your symptoms (${ctx.symptomCategory ?? '—'}) and advise you. ${ctx.allergies ? `Note: you have allergies on file (${ctx.allergies}).` : ''}`,
      disclaimer,
    };
  }
  if (/(what|ni iki|explain|sobanura|mean)/.test(q) && ctx.symptomCategory) {
    return {
      reply: rw
        ? `Wavuze ko ufite ibimenyetso bya "${ctx.symptomCategory}". Muganga azasuzuma ibyo ukubona neza. Guma online — azakubaza ibibazo byinshi.`
        : `You reported "${ctx.symptomCategory}" symptoms. Your doctor will assess this during your consultation. Stay online — they may ask follow-up questions.`,
      disclaimer,
    };
  }
  return {
    reply: rw
      ? `Nasomye ikibazo cyawe. Ufite ibimenyetso bya "${ctx.symptomCategory ?? '—'}" (${ctx.severity ?? '—'}). Muganga wawe azakugira inama vuba. Niba ibimenyetso biba bikabije cyane, vuga ako kanya.`
      : `I've noted your question. You're here for "${ctx.symptomCategory ?? '—'}" (${ctx.severity ?? '—'} severity). Your doctor will advise you shortly. If symptoms worsen suddenly, tell them right away.`,
    disclaimer,
  };
}

function doctorSuggestionsOffline(
  ctx: Parameters<typeof doctorReplySuggestions>[0],
  chatMessages: { senderIsDoctor: boolean; content: string }[],
  language: Lang
): DoctorSuggestionsResult {
  const rw = language === 'rw';
  const lastPatient = [...chatMessages].reverse().find((m) => !m.senderIsDoctor)?.content;
  const name = ctx.patientName?.split(' ')[0] ?? (rw ? 'umurwayi' : 'there');

  if (!lastPatient) {
    return {
      suggestions: rw
        ? [
            `Muraho ${name}, ndagusuzuma. Sobanura neza ibimenyetso byawe bya ${ctx.symptomCategory ?? 'uburwayi'}.`,
            `Wakiriwe neza. Mbere ya byose, hari imiti ufata cyangwa allergie ufite?`,
            `Ndabona ko wavuze "${ctx.symptomDescription?.slice(0, 60) ?? 'ibimenyetso'}". Bimeze bite uyu munsi?`,
          ]
        : [
            `Hello ${name}, I'll be reviewing your case. Can you tell me more about your ${ctx.symptomCategory ?? 'symptoms'}?`,
            `Welcome. Before we start — are you on any regular medication or do you have allergies?`,
            `I see you reported "${ctx.symptomDescription?.slice(0, 60) ?? 'symptoms'}". How are you feeling right now?`,
          ],
      note: rw ? 'Inama za AI — hindura ukurikije ubumenyi bwawe.' : 'AI suggestions — edit to match your clinical judgement.',
    };
  }

  return {
    suggestions: rw
      ? [
          `Murakoze kubivuga. ${ctx.patientAllergies ? `Ndabona ufite allergie: ${ctx.patientAllergies}. ` : ''}Reka ndagusuzume.`,
          `Ibimenyetso byawe bya ${ctx.symptomCategory} bisaba kurebwa. Wabaye ufite ibi mbere?`,
          `Ndakumva. Niba ubukana bukomeje, tuzakora gahunda yo gukurikirana.`,
        ]
      : [
          `Thank you for sharing that. ${ctx.patientAllergies ? `I note your allergy: ${ctx.patientAllergies}. ` : ''}Let me ask a few more questions.`,
          `Your ${ctx.symptomCategory} symptoms need careful review. Have you experienced this before?`,
          `I understand. If the ${ctx.severity ?? 'symptoms'} persist, we'll plan appropriate follow-up.`,
        ],
    note: rw ? 'Inama za AI — si isuzuma.' : 'AI suggestions — not a diagnosis.',
  };
}

// ---- Patient → doctor assignment rationale ----

export interface AssignmentRationaleInput {
  urgency: string;
  symptomCategory: string | null;
  candidates: {
    name: string;
    onDuty: boolean;
    load: number;
    rating: number | null;
    reasons: string[];
  }[];
  language: Lang;
}

/**
 * Natural-language explanation of the assignment recommendation. Uses Groq when
 * available for a fluent rationale, otherwise a deterministic offline summary
 * built from the schedule/workload scoring.
 */
export async function assignmentRationale(input: AssignmentRationaleInput): Promise<string> {
  if (input.candidates.length === 0) {
    return input.language === 'rw'
      ? 'Nta muganga uhari ushobora guhabwa umurwayi ubu.'
      : 'No doctors are available to take this patient right now.';
  }
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      return await assignmentRationaleGroq(groqKey, input);
    } catch {
      // fall through to offline
    }
  }
  return assignmentRationaleOffline(input);
}

async function assignmentRationaleGroq(
  apiKey: string,
  input: AssignmentRationaleInput
): Promise<string> {
  const lang = langName(input.language);
  const roster = input.candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} — ${c.onDuty ? 'on duty' : 'off schedule'}, load ${c.load}, rating ${
          c.rating != null ? c.rating.toFixed(1) : 'n/a'
        }`
    )
    .join('\n');
  const system = `You are a triage coordinator for a telemedicine clinic in Rwanda. Recommend which doctor should take a patient, based on who is ON DUTY (per their schedule), who has the lightest workload, and who has the best rating. Prioritize on-duty doctors with low load, and give urgent cases to the most available doctor. Answer in 2-3 short sentences naming the recommended doctor and why. Language: ${lang}.`;
  const user = `Case urgency: ${input.urgency}. Symptom: ${input.symptomCategory ?? 'unspecified'}.
Available doctors (best-first by our scoring):
${roster}

Recommend the best doctor and explain briefly.`;
  return callGroqChat(
    apiKey,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    0.3,
    250
  );
}

function assignmentRationaleOffline(input: AssignmentRationaleInput): string {
  const rw = input.language === 'rw';
  const best = input.candidates[0];
  const urgent = input.urgency === 'high';
  const prefix = urgent ? (rw ? '🚨 Ikibazo cyihutirwa. ' : '🚨 Urgent case. ') : '';
  const why = best.reasons.join(rw ? '; ' : '; ');
  if (rw) {
    return `${prefix}Nasabye ${best.name} — ${why}. Ni we ukwiye kubona uyu murwayi ubu ukurikije gahunda n'umutwaro w'akazi.`;
  }
  return `${prefix}Recommend ${best.name} — ${why}. Best match right now based on schedule and current workload.`;
}

/** Global page assistant — role-aware help on any screen. */
export async function generalAssistant(
  role: string,
  userName: string | null,
  page: string,
  messages: ChatTurn[],
  question: string,
  uiLanguage: Lang
): Promise<AssistantResult> {
  const language = chatLang(uiLanguage);
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    try {
      return await generalAssistantGroq(groqKey, role, userName, page, messages, question, language);
    } catch {
      // fall through
    }
  }
  return generalAssistantOffline(role, page, question, language);
}

async function generalAssistantGroq(
  apiKey: string,
  role: string,
  userName: string | null,
  page: string,
  messages: ChatTurn[],
  question: string,
  language: Lang
): Promise<AssistantResult> {
  const roleGuide: Record<string, string> = {
    patient:
      'Help patients use Gara: triage, booking, payment (MoMo/Airtel), chat with doctor, AI health assistant, appointments, medicines, follow-ups, profile, data export.',
    doctor:
      'Help doctors use Gara: patient queue (awaiting/active/complete), urgency badges, AI clinical brief, chat, reply suggestions, analytics, ratings, follow-ups, appointments, schedule, tariff.',
    finance:
      'Help finance staff: verify payments, view transactions, income trends, outstanding payments, pharmacy revenue, tariff reference, PDF reports.',
    pharmacy:
      'Help pharmacy staff: stock management, dispensing, prescriptions queue, low-stock alerts, analytics, PDF reports.',
    admin:
      'Help the administrator: system overview stats, user management, changing user roles, doctor leaderboard, audit log, and monitoring platform activity.',
  };

  const system = `You are Gara AI, a helpful assistant for the Gara telemedicine platform in Rwanda.
User: ${userName ?? 'User'} | Role: ${role} | Current page: ${page}
${roleGuide[role] ?? 'Help navigate the Gara platform.'}
Answer concisely (2-4 sentences). ${multilingualDirective(language)} Never diagnose or prescribe.`;

  const groqMessages = [
    { role: 'system' as const, content: system },
    ...messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: question },
  ];
  const reply = await callGroqChat(apiKey, groqMessages, 0.5, 350);
  return {
    reply,
    disclaimer: assistantDisclaimer(language),
  };
}

function generalAssistantOffline(
  role: string,
  page: string,
  question: string,
  language: Lang
): AssistantResult {
  const rw = language === 'rw';
  const q = question.toLowerCase();

  const tips: Record<string, { en: string; rw: string }> = {
    patient: {
      en: 'As a patient: use Triage to start, pay via MoMo/Airtel, then chat with your doctor. Check Appointments, Medicines, and Follow-ups tabs.',
      rw: 'Nk\'umurwayi: tangira na Triage, wishyure na MoMo/Airtel, hanyuma uganire na muganga. Reba tabs za Gahunda, Imiti, na Gukurikirana.',
    },
    doctor: {
      en: 'As a doctor: check Awaiting for new patients, Active for ongoing chats. Use AI brief and Suggest reply in chat. Analytics shows your stats.',
      rw: 'Nk\'umuganga: reba Awaiting ku barwayi bashya, Active ku biganirwa. Koresha AI brief na Suggest reply. Analytics igaragaza imibare yawe.',
    },
    finance: {
      en: 'As finance: go to Verify to confirm patient payments, Transactions for history, Reports to download PDFs.',
      rw: 'Nk\'umucungamari: jya kuri Verify kwemeza ubwishyu, Transactions ku mateka, Reports gukuramo PDF.',
    },
    pharmacy: {
      en: 'As pharmacy: manage Stock, dispense medicines from Prescriptions queue, check Low stock alerts.',
      rw: 'Nk\'umutoza miti: cunga Stock, tanga imiti kuva kuri Prescriptions, reba Low stock.',
    },
    admin: {
      en: 'As admin: use Overview for system stats, Users to manage accounts and change roles, Doctors for the leaderboard, and Audit log to track activity.',
      rw: 'Nk\'umuyobozi: koresha Overview ku mibare, Users gucunga konti no guhindura inshingano, Doctors ku rutonde, na Audit log gukurikirana ibikorwa.',
    },
  };

  if (/(how|what|help|ndagufasha|nigute|iki)/.test(q)) {
    const tip = tips[role] ?? tips.patient;
    return { reply: rw ? tip.rw : tip.en };
  }
  if (/(pay|momo|airtel|ubwishyu)/.test(q)) {
    return {
      reply: rw
        ? 'Wishyura 5,000 RWF binyuze na MoMo cyangwa Airtel. Injiza nomero ya transaction, hanyuma umucungamari ayemeze.'
        : 'Pay 5,000 RWF via MoMo or Airtel. Enter your transaction ID, then finance verifies it.',
    };
  }
  if (/(triage|isuzuma|symptom)/.test(q)) {
    return {
      reply: rw
        ? 'Kanda "New triage" cyangwa ukoreshe Chat with AI kugira ngo usobanure ibimenyetso byawe.'
        : 'Click "New triage" or use "Chat with AI" to describe your symptoms step by step.',
    };
  }

  const fallback = tips[role] ?? tips.patient;
  return {
    reply: rw
      ? `${fallback.rw} Uri kuri page: ${page}.`
      : `${fallback.en} You are on: ${page}.`,
  };
}
