// Fuzzy matching for the tool search: "b64d" finds Base64 Decode, "jts" finds
// JSON → TypeScript. Contiguous and word-start hits outrank scattered ones, so
// the obvious result stays on top.

const isWordStart = (text, index) =>
  index === 0 || !/[a-z\d]/i.test(text[index - 1]) || (/[a-z]/.test(text[index - 1]) && /[A-Z]/.test(text[index]));

/**
 * Match `query` against `text` as a case-insensitive, in-order subsequence.
 * @returns {{ score: number, indices: number[] } | null}  matched character positions, for highlighting
 */
export function fuzzyMatch(query, text) {
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  if (!needle) return { score: 0, indices: [] };

  const at = haystack.indexOf(needle);
  if (at !== -1) {
    const indices = Array.from(needle, (_, offset) => at + offset);
    const score = 100 + needle.length * 4 + (at === 0 ? 40 : isWordStart(text, at) ? 25 : 0) - at * 0.5;
    return { score, indices };
  }

  // Prefer word starts — "jts" should take the T of "TypeScript", not the t of
  // "JSON to" — but jumping ahead can strand the rest of the query, so fall
  // back to the plain leftmost match.
  return subsequence(needle, text, haystack, true) ?? subsequence(needle, text, haystack, false);
}

function subsequence(needle, text, haystack, preferWordStarts) {
  const indices = [];
  let score = 0;
  let from = 0;
  for (const char of needle) {
    let index = haystack.indexOf(char, from);
    if (index === -1) return null;
    if (preferWordStarts) {
      for (let next = index; next !== -1; next = haystack.indexOf(char, next + 1)) {
        if (isWordStart(text, next)) { index = next; break; }
      }
    }
    score += 2 + (isWordStart(text, index) ? 8 : 0) + (indices.at(-1) === index - 1 ? 5 : 0);
    indices.push(index);
    from = index + 1;
  }
  return { score: score - indices[0] * 0.2, indices };
}

// A hit on what the tool is called matters more than one buried in its description.
const FIELD_WEIGHTS = [['name', 1], ['title', 0.9], ['keywords', 0.75], ['category', 0.6]];

/**
 * Rank `tools` for `query`. Every space-separated term must match one of a
 * tool's fields; the description is searched for whole terms only.
 * @returns {{ tool: Object, score: number, nameIndices: number[] }[]}  best first
 */
export function rankTools(query, tools) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return tools.map((tool) => ({ tool, score: 0, nameIndices: [] }));

  const ranked = [];
  for (const tool of tools) {
    let total = 0;
    const nameIndices = [];
    const matchesEveryTerm = terms.every((term) => {
      let best = 0;
      for (const [field, weight] of FIELD_WEIGHTS) {
        const value = tool[field];
        if (!value) continue;
        const match = fuzzyMatch(term, value);
        if (match && match.score * weight > best) {
          best = match.score * weight;
          if (field === 'name') nameIndices.push(...match.indices);
        }
      }
      if (!best && term.length >= 3 && tool.desc?.toLowerCase().includes(term.toLowerCase())) best = 20;
      total += best;
      return best > 0;
    });
    if (matchesEveryTerm) ranked.push({ tool, score: total, nameIndices: [...new Set(nameIndices)].sort((a, b) => a - b) });
  }
  return ranked.sort((a, b) => b.score - a.score);
}
