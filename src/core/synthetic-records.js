// SYNTHETIC records only. There is no real health data anywhere in this project. Each fake record is
// generated from the pseudonym, so the same release always produces the same fake dataset.
import { mulberry32, pick } from './random.js';
import { recordIdFor } from './ids.js';

const BANDS = ['minimal', 'mild', 'moderate', 'moderately_severe', 'severe'];
const STATES = ['Oyo', 'FCT', 'Lagos', 'Kogi', 'Kano', 'Rivers', 'Enugu', 'Plateau'];
export const SMALL_CELL = 5; // totals below this are shown as "<5" so nobody can be singled out

export function syntheticFields(subjectRef, categories) {
  const rng = mulberry32(parseInt(subjectRef.slice(2, 10), 16));
  const f = {};
  if (categories.includes('usage_metadata')) f.usage = { sessions_last_90_days: 1 + Math.floor(rng() * 30), channel: pick(rng, ['chat', 'community_session', 'clinic_app']) };
  if (categories.includes('demographics')) f.demographics = { age_band: pick(rng, ['15-17', '18-24', '25-35']), gender: pick(rng, ['female', 'male', 'prefer_not_to_say']), state: pick(rng, STATES) };
  if (categories.includes('screening_scores')) f.screening = { mood_score_band: pick(rng, BANDS), anxiety_score_band: pick(rng, BANDS.slice(0, 4)) };
  if (categories.includes('chat_transcripts')) f.chat = '[SYNTHETIC PLACEHOLDER: this prototype contains no conversation text]';
  if (categories.includes('voice_audio')) f.voice = '[SYNTHETIC PLACEHOLDER: this prototype contains no audio]';
  return f;
}

function aggregate(rows) {
  const counts = {};
  const walk = (prefix, v) => {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(prefix ? `${prefix}.${k}` : k, x);
    else if (typeof v === 'string' && !v.startsWith('[SYNTHETIC')) { counts[prefix] ??= {}; counts[prefix][v] = (counts[prefix][v] ?? 0) + 1; }
  };
  rows.forEach((r) => walk('', r));
  for (const field of Object.values(counts)) for (const k of Object.keys(field)) if (field[k] < SMALL_CELL) field[k] = `<${SMALL_CELL}`;
  return counts;
}

export async function syntheticDataset(releaseId, subjectRefs, request, consents) {
  const rows = [];
  for (const ref of subjectRefs.slice().sort()) {
    rows.push({ record_id: await recordIdFor(releaseId, ref), terms_digest: consents.get(ref).terms_digest, ...syntheticFields(ref, request.data_categories) });
  }
  rows.sort((a, b) => (a.record_id < b.record_id ? -1 : 1));
  const base = { release_id: releaseId, synthetic: true, notice: 'SYNTHETIC DATA: generated for a demo. Not real people, not real health data.' };
  if (request.deidentification === 'aggregated_only') {
    const stripped = rows.map(({ record_id, terms_digest, ...rest }) => rest); // eslint-disable-line no-unused-vars
    return { ...base, form: 'aggregated', people: rows.length, totals: aggregate(stripped) };
  }
  return { ...base, form: 'records', records: rows };
}
