// Canonical JSON: one exact byte string for one value, so the same data always hashes the same way.
// Keys are sorted (UTF-16 code-unit order, as in RFC 8785 / JCS), no whitespace, `undefined` keys dropped.
// Without this, {"a":1,"b":2} and {"b":2,"a":1} would hash differently and every check built on hashes breaks.
export function canonicalize(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean': return value ? 'true' : 'false';
    case 'string': return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalize: non-finite number');
      return JSON.stringify(value);
    case 'object':
      if (Array.isArray(value)) return '[' + value.map((v) => canonicalize(v === undefined ? null : v)).join(',') + ']';
      return '{' + Object.keys(value).filter((k) => value[k] !== undefined).sort()
        .map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
    default:
      throw new TypeError(`canonicalize: unsupported type ${typeof value}`);
  }
}

/** Deep copy through JSON, so stored data can never be mutated by the caller afterwards. */
export const clone = (v) => JSON.parse(JSON.stringify(v));
