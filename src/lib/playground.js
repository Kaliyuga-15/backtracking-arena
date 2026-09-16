// Integer fields a card reads, shared by the terminal (browser + server) and
// the constraint display. Pure and dependency-free.

const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

// 10000000000000 reads better as 10¹³; everything else stays a plain number.
export const formatBound = (value) => {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6) {
    const exponent = Math.log10(magnitude);
    if (Number.isInteger(exponent)) {
      const power = String(exponent).split('').map((digit) => SUPERSCRIPT[digit]).join('');
      return `${value < 0 ? '-' : ''}10${power}`;
    }
  }
  return String(value);
};

export const describeField = (field) =>
  `${formatBound(field.min)} ≤ ${field.name} ≤ ${formatBound(field.max)}`;

export const parseTerminalInput = (raw, fields = [], maxChars = 200) => {
  const text = String(raw ?? '').trim();
  const names = fields.map((field) => field.name).join(' ');

  if (!text) return { ok: false, message: `Type ${names}` };
  if (text.length > maxChars) return { ok: false, message: 'Input is too long.' };

  const tokens = text.split(/\s+/);
  if (tokens.length !== fields.length) {
    const noun = fields.length === 1 ? 'integer' : 'integers';
    return { ok: false, message: `Expected ${fields.length} ${noun}: ${names}` };
  }

  const values = [];
  for (const [index, token] of tokens.entries()) {
    const field = fields[index];
    if (!/^-?\d+$/.test(token)) {
      return { ok: false, message: `${field.name} must be an integer` };
    }
    const value = Number(token);
    if (!Number.isSafeInteger(value) || value < field.min || value > field.max) {
      return { ok: false, message: `Terminal accepts ${describeField(field)}` };
    }
    values.push(value);
  }

  return { ok: true, values, normalized: values.join(' ') };
};
