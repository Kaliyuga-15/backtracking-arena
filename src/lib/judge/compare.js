export const COMPARISON = {
  TRIMMED: 'trimmed',
  EXACT: 'exact',
  TOKEN: 'token',
  UNORDERED_LINES: 'unordered_lines',
};

const stripTrailing = (text) =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');

const normalize = (text, mode) => {
  switch (mode) {
    case COMPARISON.EXACT:
      return text;
    case COMPARISON.TOKEN:
      return text.trim().split(/\s+/).filter(Boolean).join(' ');
    case COMPARISON.UNORDERED_LINES: {
      // For problems where any ordering of the solution set is acceptable.
      const lines = stripTrailing(text).split('\n').filter((line) => line.length > 0);
      return lines.sort().join('\n');
    }
    case COMPARISON.TRIMMED:
    default:
      return stripTrailing(text);
  }
};

export const outputMatches = (actual, expected, mode = COMPARISON.TRIMMED) =>
  normalize(actual ?? '', mode) === normalize(expected ?? '', mode);
