// Cron expression parsing, explanation and next-run projection.
// Standard five-field syntax: minute hour day-of-month month day-of-week.

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FIELDS = [
  { label: 'minute', min: 0, max: 59 },
  { label: 'hour', min: 0, max: 23 },
  { label: 'day-of-month', min: 1, max: 31 },
  { label: 'month', min: 1, max: 12, names: MONTH_NAMES, offset: 1 },
  { label: 'day-of-week', min: 0, max: 6, names: DAY_NAMES, offset: 0 },
];

const ALIASES = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

function fieldValue(text, spec) {
  const named = spec.names ? spec.names.indexOf(text.toLowerCase()) : -1;
  if (named >= 0) return named + spec.offset;
  if (!/^\d+$/.test(text)) throw new Error(`\`${text}\` isn't a valid ${spec.label}.`);
  // Cron accepts both 0 and 7 for Sunday.
  const value = spec.label === 'day-of-week' && text === '7' ? 0 : Number(text);
  if (value < spec.min || value > spec.max) {
    throw new Error(`${spec.label} must be ${spec.min}–${spec.max} — got ${text}.`);
  }
  return value;
}

function parseField(text, spec) {
  const allowed = new Set();
  for (const part of text.split(',')) {
    const pieces = part.split('/');
    if (pieces.length > 2) throw new Error(`\`${part}\` has more than one step in the ${spec.label} field.`);
    const [rangeText, stepText] = pieces;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw new Error(`\`${part}\` has an invalid step for ${spec.label}.`);

    let from, to;
    if (rangeText === '*' || rangeText === '?') {
      from = spec.min;
      to = spec.max;
    } else {
      const bounds = rangeText.split('-');
      if (bounds.length > 2) throw new Error(`\`${part}\` isn't a valid ${spec.label} range.`);
      from = fieldValue(bounds[0], spec);
      // A bare value with a step (`5/10`) counts up from there to the field's end.
      to = bounds.length === 2 ? fieldValue(bounds[1], spec) : (stepText === undefined ? from : spec.max);
      if (from > to) throw new Error(`\`${part}\` runs backwards in the ${spec.label} field.`);
    }
    for (let value = from; value <= to; value += step) allowed.add(value);
  }
  if (!allowed.size) throw new Error(`The ${spec.label} field matches nothing.`);
  return allowed;
}

/**
 * Parse a cron expression into one Set of allowed values per field.
 * Throws Error(message) describing the first problem found.
 */
export function parseCron(expression) {
  const trimmed = expression.trim();
  const normalized = ALIASES[trimmed.toLowerCase()] ?? trimmed;
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length !== 5) {
    throw new Error(`Expected 5 fields — minute hour day-of-month month day-of-week — but found ${parts.length}.`);
  }
  return FIELDS.map((spec, index) => parseField(parts[index], spec));
}

const sorted = (set) => [...set].sort((a, b) => a - b);
const pad = (value) => String(value).padStart(2, '0');

function joinList(items) {
  if (items.length === 1) return items[0];
  if (items.length <= 4) return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
  return `${items.slice(0, 3).join(', ')} and ${items.length - 3} more`;
}

// Contiguous values collapse into a range, so `9-17` reads as "9–17" rather than
// as a truncated list of nine separate hours.
function contiguousRuns(values) {
  const runs = [];
  for (const value of values) {
    const last = runs.at(-1);
    if (last && value === last.to + 1) last.to = value;
    else runs.push({ from: value, to: value });
  }
  return runs;
}

const describeSet = (set, label) => joinList(
  contiguousRuns(sorted(set)).map(({ from, to }) => (from === to ? label(from) : `${label(from)}–${label(to)}`)),
);

// Report an interval only when the values really are an even sweep of the whole
// field: `*/15` reads as "every 15 minutes", but `0,7,30` must not.
function stepOf(set, spec) {
  const values = sorted(set);
  if (values.length < 2 || values[0] !== spec.min) return null;
  const step = values[1] - values[0];
  if (step < 2) return null;
  for (let i = 1; i < values.length; i++) if (values[i] - values[i - 1] !== step) return null;
  return values.at(-1) + step > spec.max ? step : null;
}

function timePhrase(minutes, hours) {
  const everyMinute = minutes.size === 60;
  const during = hours.size === 24
    ? ''
    : ` during hour${hours.size > 1 ? 's' : ''} ${describeSet(hours, String)}`;

  if (everyMinute) return `Every minute${during}`;

  const minuteStep = stepOf(minutes, FIELDS[0]);
  if (minuteStep) return `Every ${minuteStep} minutes${during}`;

  if (hours.size * minutes.size <= 6) {
    const times = sorted(hours).flatMap((hour) => sorted(minutes).map((minute) => `${pad(hour)}:${pad(minute)}`));
    return `At ${joinList(times)}`;
  }
  return `At minute ${describeSet(minutes, String)}${during}`;
}

function dayPhrase(daysOfMonth, months, daysOfWeek) {
  const anyDayOfMonth = daysOfMonth.size === 31;
  const anyDayOfWeek = daysOfWeek.size === 7;
  const clauses = [];

  if (anyDayOfMonth && anyDayOfWeek) {
    clauses.push('every day');
  } else {
    const restrictions = [];
    if (!anyDayOfMonth) restrictions.push(`on day ${describeSet(daysOfMonth, String)} of the month`);
    if (!anyDayOfWeek) restrictions.push(`on ${describeSet(daysOfWeek, (day) => DAY_LABELS[day])}`);
    clauses.push(restrictions.join(' or '));
  }
  if (months.size !== 12) clauses.push(`in ${describeSet(months, (month) => MONTH_LABELS[month - 1])}`);
  return clauses.join(', ');
}

/** A plain-English sentence for a parsed expression. */
export function describeCron([minutes, hours, daysOfMonth, months, daysOfWeek]) {
  return `${timePhrase(minutes, hours)}, ${dayPhrase(daysOfMonth, months, daysOfWeek)}.`;
}

/**
 * True when both day fields are restricted. Cron then treats them as OR, not
 * AND — the classic trap, worth saying out loud.
 */
export const daysAreEitherOr = ([, , daysOfMonth, , daysOfWeek]) =>
  daysOfMonth.size !== 31 && daysOfWeek.size !== 7;

function dayMatches(date, daysOfMonth, daysOfWeek) {
  const byMonth = daysOfMonth.size !== 31;
  const byWeek = daysOfWeek.size !== 7;
  if (byMonth && byWeek) return daysOfMonth.has(date.getDate()) || daysOfWeek.has(date.getDay());
  if (byMonth) return daysOfMonth.has(date.getDate());
  if (byWeek) return daysOfWeek.has(date.getDay());
  return true;
}

// Far enough ahead to show several Feb-29 runs, and cheap because whole months
// and days are skipped rather than scanned minute by minute.
export const HORIZON_YEARS = 12;

/** The next `count` local times matching the expression, starting after `from`. */
export function nextRuns([minutes, hours, daysOfMonth, months, daysOfWeek], from, count) {
  const runs = [];
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const horizon = new Date(from.getTime());
  horizon.setFullYear(horizon.getFullYear() + HORIZON_YEARS);

  while (runs.length < count && cursor <= horizon) {
    if (!months.has(cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
    } else if (!dayMatches(cursor, daysOfMonth, daysOfWeek)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
    } else if (!hours.has(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
    } else if (!minutes.has(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1);
    } else {
      runs.push(new Date(cursor.getTime()));
      cursor.setMinutes(cursor.getMinutes() + 1);
    }
  }
  return runs;
}
