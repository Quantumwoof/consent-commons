// Plain-language text for the machine codes the core produces (check blocks, warnings, rule violations,
// errors). The code itself stays visible next to the explanation; numbers are read from the recorded
// message so that historic checks show the numbers that were true when they were recorded.
import { tu } from '/src/i18n/index.js';
import { getLang } from './lang.js';

const has = (k) => tu('en', k) !== k;
const nums = (s) => (String(s ?? '').match(/\d+/g) ?? []).map(Number);

export function blockText(b) {
  const n = nums(b.message);
  const vars = b.code === 'BELOW_K_MINIMUM' ? { n: n[0], k: n[1] } : b.code === 'DURATION_TOO_LONG' ? { max: n[0] } : b.code.startsWith('COHORT_') ? { n: n[0] } : {};
  return has('bk_' + b.code) ? tu(getLang(), 'bk_' + b.code, vars) : b.message;
}
export function warnText(w) {
  return has('wn_' + w.code) ? tu(getLang(), 'wn_' + w.code, { pct: nums(w.message)[0] }) : w.message;
}
export function conflictText(k) { return has('cf_' + k) ? tu(getLang(), 'cf_' + k) : k; }
export function ruleText(rule, fallback) { return has('rl_' + rule) ? tu(getLang(), 'rl_' + rule) : fallback; }

/** A thrown error: rule errors by rule name, the few plain errors by their known wording, else as-is. */
export function errText(e) {
  if (e?.rule) return ruleText(e.rule, e.message);
  const m = String(e?.message ?? e);
  const known = [[/^unknown request/i, 'err_unknown_request'], [/only approved requests/i, 'err_not_approved'], [/^Release blocked/i, 'err_release_blocked'],
    [/^No consent matches/i, 'err_no_match'], [/already withdrawn/i, 'rl_not_already_withdrawn']];
  const hit = known.find(([re]) => re.test(m));
  return hit ? tu(getLang(), hit[1]) : m;
}
