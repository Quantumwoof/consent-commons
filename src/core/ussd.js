// A USSD-style session for people with a basic phone and no data. The web demo SIMULATES the phone and
// the network; the logic here is the real thing: it looks a consent up by its private withdrawal code with
// the same `findByCode`, and withdraws with the same `Commons.withdraw` the chat uses, so the ledger entry,
// the downstream deletion notices and every audit rule are identical whichever channel the person used.
// Every screen is kept to 160 characters or fewer (tested), the usual budget for one USSD page.
import { tu } from '../i18n/index.js';

export const USSD_CODE = '*347*22#'; // EXAMPLE code for the demo; not a registered short code
export const USSD_MAX_CHARS = 160;
export const USSD_LANGS = ['en', 'pcm', 'yo'];
/** Short, ASCII-only date: fits a small screen and never depends on the phone's locale data. */
export const ussdDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });

export class UssdSession {
  /**
   * @param {object} o
   * @param {() => Promise<import('./commons.js').Commons>} o.load  fresh copy of the commons
   * @param {(c) => (void|Promise<void>)} o.persist  save after a withdrawal
   */
  constructor({ load, persist = () => {}, lang = 'en' }) {
    this.load = load; this.persist = persist; this.lang = USSD_LANGS.includes(lang) ? lang : 'en';
    this.state = 'idle'; this.mode = null; this.code = null; this.last = '';
  }
  #t(k, v) { return tu(this.lang, k, v); }
  #show(text, state, extra = {}) { this.state = state; this.last = text; return { text, state, end: state === 'ended', input: state === 'code' ? 'code' : 'digits', lang: this.lang, ...extra }; }
  #menu() { this.mode = null; this.code = null; return this.#show(this.#t('ux_menu'), 'menu'); }
  #invalid() {
    const both = `${this.#t('ux_invalid')}\n${this.last}`;
    return { ...this.#show(both.length <= USSD_MAX_CHARS ? both : this.last, this.state), invalid: true };
  }

  /** The person dials a service code and presses Call. */
  dial(input) {
    const code = String(input ?? '').replace(/\s+/g, '');
    if (code !== USSD_CODE) return this.#show(this.#t('ux_unknown'), 'ended');
    return this.#menu();
  }

  /** The person types a reply and presses Send. */
  async reply(input) {
    const v = String(input ?? '').trim();
    switch (this.state) {
      case 'menu':
        if (v === '1' || v === '2') { this.mode = v === '1' ? 'check' : 'withdraw'; return this.#show(this.#t('ux_ask_code'), 'code'); }
        if (v === '3') return this.#show(this.#t('ux_lang'), 'lang');
        if (v === '0') return this.#show(this.#t('ux_bye'), 'ended');
        return this.#invalid();
      case 'lang':
        if (['1', '2', '3'].includes(v)) { this.lang = USSD_LANGS[Number(v) - 1]; return this.#menu(); }
        if (v === '0') return this.#menu();
        return this.#invalid();
      case 'code': return this.#lookup(v);
      case 'confirm':
        if (v === '1') return this.#withdraw();
        if (v === '2') { this.code = null; return this.#show(this.#t('ux_kept'), 'back'); }
        return this.#invalid();
      case 'back':
        if (v === '0') return this.#menu();
        return this.#invalid();
      default: return this.#show(this.#t('ux_bye'), 'ended');
    }
  }

  async #lookup(v) {
    if (v === '0') return this.#menu();
    if (!v) return this.#invalid();
    const commons = await this.load();
    const c = await commons.findByCode(v);
    if (!c) return this.#show(this.#t('ux_not_found'), 'code');
    const s = await commons.state();
    const holders = [...s.releases.values()].filter((r) => [...r.subjects.values()].includes(c.terms.subject_ref)).length;
    if (c.status === 'withdrawn') return this.#show(this.#t('ux_status_withdrawn', { date: ussdDate(c.withdrawn_at) }), 'back');
    if (this.mode === 'check') {
      if (c.status === 'expired') return this.#show(this.#t('ux_status_expired', { date: ussdDate(c.terms.expires_at) }), 'back');
      return this.#show(this.#t('ux_status_active', { date: ussdDate(c.terms.expires_at), n: holders }), 'back');
    }
    this.code = v;
    return this.#show(this.#t('ux_confirm', { n: holders, d: s.policy.recipient_deletion_days }), 'confirm');
  }

  async #withdraw() {
    const code = this.code; this.code = null; // never keep the code longer than needed
    try {
      const commons = await this.load();
      const res = await commons.withdraw(code);
      await this.persist(commons);
      return this.#show(this.#t('ux_done', { n: res.notices.length, seq: res.entry.seq }), 'back', { withdrawn: { entry: res.entry, notices: res.notices, receipt: res.receipt } });
    } catch {
      return this.#show(this.#t('ux_error'), 'back');
    }
  }
}
