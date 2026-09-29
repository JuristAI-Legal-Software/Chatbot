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
  for (let i = 1; i < value.length; i++) {
    if (value[i] === '#' && /\s/.test(value[i - 1])) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}
