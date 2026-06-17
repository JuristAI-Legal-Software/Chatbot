/**
 * Strip a trailing YAML inline comment from an unquoted scalar.
 * YAML treats ` # ...` (space before hash) as a comment; `#` without a
 * preceding space is part of the value (e.g. `hashtag#foo`). A scalar
 * that's entirely a comment (`# nothing yet`) collapses to empty so
 * callers can treat it as "no value". Applied narrowly — only to
 * boolean fields where the token is a single word — to avoid
 * accidentally truncating free-form strings like descriptions that
 * might legitimately contain `#`.
 */
/**
 * Linear-time scan for the first whitespace-prefixed `#` that introduces
 * a YAML inline comment. Replaces the regex `/^(.*?)\s+#.*$/` which CodeQL
 * flagged as polynomial due to `.*?` + `\s+` backtracking on tab/space runs.
 */
export function stripYamlTrailingComment(value: string): string {
  if (value.trimStart().startsWith('#')) return '';
  let i = 0;
  while (i < value.length) {
    const idx = value.indexOf('#', i);
    if (idx <= 0) {
      return value;
    }
    const prev = value.charCodeAt(idx - 1);
    if (prev === 32 || prev === 9) {
      let end = idx - 1;
      while (end > 0) {
        const c = value.charCodeAt(end - 1);
        if (c !== 32 && c !== 9) {
          break;
        }
        end--;
      }
      return value.slice(0, end);
    }
    i = idx + 1;
  }
  return value;
}
