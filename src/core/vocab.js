// The shared vocabulary of the commons. Every code here has a fixed meaning, documented in docs/SCHEMA.md.
// Using codes (not free text) is what makes consent machine-checkable: a request for `ai_training_commercial`
// can be compared against a person's terms automatically, in any language.

export const SCHEMA_VERSION = '1.0.0';
export const SCHEMA_BASE = 'https://raw.githubusercontent.com/Quantumwoof/consent-commons/main/schema';

/** What the data may be used for. */
export const PURPOSES = {
  service_improvement: 'Improving the community mental-health service the person uses',
  public_health_research: 'Non-commercial public-health research on youth mental health',
  policy_statistics: 'Anonymous totals for policy, planning and advocacy',
  ai_training_noncommercial: 'Training or testing open, non-commercial AI tools for mental-health support',
  ai_training_commercial: 'Training or testing AI products sold for profit',
};

/** Which kinds of data. Ordered from least to most sensitive. */
export const DATA_CATEGORIES = {
  usage_metadata: 'When and how often the service was used (no message content)',
  demographics: 'Age range, gender and state (no name, phone number or address)',
  screening_scores: 'Answers to wellbeing check questions, such as mood scores',
  chat_transcripts: 'What the person typed in chats, with names and numbers removed',
  voice_audio: 'Voice notes',
};

/** Who may use it. */
export const PERMITTED_USERS = {
  commons_stewards: 'The commons team itself',
  nigerian_public_researchers: 'Universities and public-health researchers in Nigeria',
  international_academic: 'Universities outside Nigeria',
  nonprofits: 'Non-profit organisations',
  government_health: 'Government health agencies',
  commercial: 'Companies that make money from products',
};

/** What the community must get back. */
export const BENEFITS = {
  results_back: 'Results returned to the community in plain language',
  open_access: 'Findings published free for anyone to read',
  community_credit: 'The community is credited (acknowledgement or co-authorship)',
  community_fund: 'A share of funding or revenue goes to a community fund',
  local_capacity: 'Paid training or jobs for local researchers or health workers',
};

/** How identifiable the released data may be. Higher rank = stricter. */
export const DEIDENTIFICATION = {
  deidentified: { rank: 1, label: 'Record-level, with names, numbers and addresses removed' },
  aggregated_only: { rank: 2, label: 'Only totals and averages, never individual records' },
};

export const LANGUAGES = { en: 'English', pcm: 'Nigerian Pidgin', yo: 'Yorùbá' };
export const TRANSLATION_STATUS = ['draft_unreviewed', 'community_reviewed', 'professionally_verified'];
export const DURATIONS_DAYS = { 365: '1 year', 730: '2 years', 1825: '5 years' };

/** How a consent was collected (`collected_via`). Informational: it changes no rule. Kept as an open string in the
 *  schema so new channels can be added without a breaking change. */
export const COLLECTION_CHANNELS = {
  web_chat_demo: 'The person used the consent chat themselves (web demo)',
  assisted_offline_demo: 'A community health worker took the person through the chat on a shared device (demo label: offline storage and later sync are not built)',
  synthetic_seed: 'Generated synthetic example person',
};

export const WITHDRAWAL_EFFECT = 'stop_future_use_and_delete_record_level_copies';
