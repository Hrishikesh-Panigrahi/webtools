// Regenerates src/prices.json from upstream price feeds. Runs in CI, never in
// the browser — the committed JSON is what ships, so the site stays static,
// offline and keyless.
//
// Anthropic publishes prices as documentation, not as an API: /v1/models carries
// no price field and needs a key. So this reads two independent community feeds
// and only accepts a value when both agree. A disagreement means one of them is
// mid-update or wrong, and that is a decision for a person, not a cron job.
//
// Usage: node scripts/update-prices.mjs   (npm run prices)

import { writeFile } from 'node:fs/promises';

const SOURCES = {
  litellm: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json',
  modelsDev: 'https://models.dev/api.json',
};

// The curated set, in the order the tool lists them. Prices and context windows
// come from the feeds; names and notes are ours, so a new upstream model never
// appears here without a human adding it.
const MANIFEST = [
  { id: 'claude-opus-5', name: 'Claude Opus 5' },
  { id: 'claude-fable-5', name: 'Claude Fable 5' },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    note: { text: 'an introductory rate that rises to $3 / $15 after 2026-08-31', until: '2026-08-31' },
  },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
];

const PER_MILLION = 1e6;
const round = (value) => Math.round(value * PER_MILLION) / PER_MILLION;
// Feed values are floats scaled by a million, so compare with a tolerance well
// below a hundredth of a cent per million tokens.
const differs = (a, b) => Math.abs(a - b) > 1e-6;

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function readLitellm(feed, id) {
  const model = feed[id];
  if (!model) throw new Error(`litellm has no entry for ${id}`);
  if (model.litellm_provider !== 'anthropic') {
    throw new Error(`litellm entry for ${id} is provider "${model.litellm_provider}", not first-party anthropic`);
  }
  return {
    input: round(model.input_cost_per_token * PER_MILLION),
    output: round(model.output_cost_per_token * PER_MILLION),
    cacheRead: round(model.cache_read_input_token_cost * PER_MILLION),
    cacheWrite: round(model.cache_creation_input_token_cost * PER_MILLION),
    context: model.max_input_tokens,
  };
}

function readModelsDev(feed, id) {
  const model = feed.anthropic?.models?.[id];
  if (!model) throw new Error(`models.dev has no entry for ${id}`);
  return {
    input: round(model.cost.input),
    output: round(model.cost.output),
    cacheRead: round(model.cost.cache_read),
    cacheWrite: round(model.cost.cache_write),
    context: model.limit.context,
  };
}

const PRICE_FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite', 'context'];

function reconcile(id, left, right) {
  const conflicts = PRICE_FIELDS
    .filter((field) => differs(left[field], right[field]))
    .map((field) => `${field}: litellm=${left[field]} models.dev=${right[field]}`);
  if (conflicts.length) throw new Error(`${id} disagrees between sources — ${conflicts.join('; ')}`);
  return Object.fromEntries(PRICE_FIELDS.map((field) => [field, left[field]]));
}

const today = new Date().toISOString().slice(0, 10);

async function main() {
  const [litellm, modelsDev] = await Promise.all([fetchJson(SOURCES.litellm), fetchJson(SOURCES.modelsDev)]);

  const models = MANIFEST.map(({ id, name, note }) => {
    const agreed = reconcile(id, readLitellm(litellm, id), readModelsDev(modelsDev, id));
    // Drop a note once the thing it warns about has passed.
    const stillRelevant = note && note.until >= today;
    return { id, name, ...agreed, ...(stillRelevant ? { note: note.text } : {}) };
  });

  const table = { fetchedAt: today, sources: Object.values(SOURCES), models };
  await writeFile(new URL('../src/prices.json', import.meta.url), `${JSON.stringify(table, null, 2)}\n`);

  console.log(`Wrote src/prices.json — ${models.length} models, both sources agreed.`);
  for (const model of models) {
    console.log(`  ${model.id.padEnd(18)} $${model.input} in / $${model.output} out per Mtok`);
  }
}

main().catch((error) => {
  console.error(`Price refresh failed: ${error.message}`);
  console.error('src/prices.json was left unchanged.');
  process.exit(1);
});
