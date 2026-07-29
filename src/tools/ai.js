import { h, copyBtn } from '../dom.js';
import { keyValueRow } from '../panel.js';
import { estimateTokens, MODELS, TOKEN_CLASSES, PRICES_AS_OF } from '../tokens.js';

// Sub-cent figures need real precision to be useful; dollar figures don't.
function money(amount) {
  if (amount === 0) return '$0';
  if (amount < 0.01) return '$' + amount.toFixed(6);
  if (amount < 1) return '$' + amount.toFixed(4);
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const percent = (share) => (share > 0 && share < 0.01 ? '<0.01' : share.toFixed(2));

function tokenMount(body) {
  const input = h('textarea', { class: 'io-textarea tall', placeholder: 'Paste a prompt, a document, or a source file…', spellcheck: 'false' });
  const model = h('select', { class: 'select' }, ...MODELS.map((m) => h('option', { value: m.id }, m.name)));
  const expected = h('input', { class: 'part-input', type: 'number', min: '0', max: '128000', value: '1000', style: 'max-width:7rem' });

  const stats = h('div', { class: 'stat-grid' });
  const stat = (label) => {
    const value = h('div', { class: 'stat-value' }, '0');
    stats.append(h('div', { class: 'stat' }, value, h('div', { class: 'stat-label' }, label)));
    return value;
  };
  const statTokens = stat('Est. tokens');
  const statChars = stat('Characters');
  const statWords = stat('Words');
  const statRatio = stat('Chars / token');

  const meterFill = h('div', { class: 'meter-fill' });
  const meterNote = h('div', { class: 'rx-info' });
  const priceNote = h('div', { class: 'rx-info' });

  const costs = {
    prompt: keyValueRow('Prompt (input)'),
    completion: keyValueRow('Completion (output)'),
    total: keyValueRow('Total per request'),
    thousand: keyValueRow('× 1,000 requests'),
    cacheWrite: keyValueRow('Prompt cached — write'),
    cacheRead: keyValueRow('Prompt cached — read'),
  };
  const costBlock = h('div', { class: 'kv-list' }, ...Object.values(costs).map(({ row }) => row));

  const breakdown = Object.fromEntries(
    Object.entries(TOKEN_CLASSES).map(([key, label]) => [key, keyValueRow(label, '0')]),
  );
  const breakdownBlock = h('div', { class: 'kv-list' }, ...Object.values(breakdown).map(({ row }) => row));

  let summary = '';

  const run = () => {
    const text = input.value;
    const { tokens, breakdown: counts } = estimateTokens(text);
    const chosen = MODELS.find((m) => m.id === model.value) ?? MODELS[0];
    const outputTokens = Math.max(0, Math.floor(Number(expected.value)) || 0);

    statTokens.textContent = tokens.toLocaleString();
    statChars.textContent = text.length.toLocaleString();
    statWords.textContent = (text.trim() ? text.trim().split(/\s+/).length : 0).toLocaleString();
    statRatio.textContent = tokens ? (text.length / tokens).toFixed(2) : '—';

    const share = (tokens / chosen.context) * 100;
    meterFill.style.width = Math.min(100, share) + '%';
    meterFill.classList.toggle('over', tokens > chosen.context);
    meterNote.textContent = tokens > chosen.context
      ? `Over budget by ${(tokens - chosen.context).toLocaleString()} tokens — ${chosen.name} holds ${chosen.context.toLocaleString()}.`
      : `${tokens.toLocaleString()} of ${chosen.context.toLocaleString()} context tokens (${percent(share)}%).`;

    const promptCost = (tokens / 1e6) * chosen.input;
    const completionCost = (outputTokens / 1e6) * chosen.output;
    costs.prompt.value.textContent = money(promptCost);
    costs.completion.value.textContent = money(completionCost);
    costs.total.value.textContent = money(promptCost + completionCost);
    costs.thousand.value.textContent = money((promptCost + completionCost) * 1000);
    costs.cacheWrite.value.textContent = money((tokens / 1e6) * chosen.cacheWrite);
    costs.cacheRead.value.textContent = money((tokens / 1e6) * chosen.cacheRead);

    const rates = `$${chosen.input} in / $${chosen.output} out, cache $${chosen.cacheWrite} write / $${chosen.cacheRead} read, per Mtok`;
    priceNote.textContent = chosen.note
      ? `${rates} — ${chosen.note}.`
      : `${rates}, as of ${PRICES_AS_OF}.`;

    for (const [key, row] of Object.entries(breakdown)) row.value.textContent = counts[key].toLocaleString();

    summary = [
      `${tokens.toLocaleString()} estimated tokens (${text.length.toLocaleString()} characters)`,
      `Model: ${chosen.name} — ${percent(share)}% of a ${chosen.context.toLocaleString()}-token context`,
      `Prompt ${money(promptCost)} + ${outputTokens.toLocaleString()} output tokens ${money(completionCost)} = ${money(promptCost + completionCost)} per request`,
    ].join('\n');
  };

  input.addEventListener('input', run);
  model.addEventListener('change', run);
  expected.addEventListener('input', run);

  body.append(
    h('p', { class: 'tool-hint' },
      'Counts are estimated from how tokenizers split text, not from a real vocabulary — expect to be within about 10% on prose and code. Nothing is uploaded.'),
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Text'), input),
    stats,
    h('div', { class: 'tool-actions' },
      h('span', { class: 'io-label' }, 'Model'), model,
      h('span', { class: 'io-label' }, 'Expected output tokens'), expected,
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label' }, 'Context window'),
      h('div', { class: 'meter' }, meterFill),
      meterNote,
    ),
    h('div', { class: 'io-grid' },
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' },
          h('span', { class: 'io-label' }, 'Estimated cost (USD)'),
          copyBtn(() => summary),
        ),
        costBlock,
        priceNote,
      ),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label' }, 'Where the tokens go'),
        breakdownBlock,
      ),
    ),
    h('p', { class: 'tool-hint' },
      `Prices are the rates in effect on ${PRICES_AS_OF}, bundled at build time from two public feeds that had to agree — the page itself makes no network calls. Check the pricing page before billing anyone off them.`),
  );
  run();
  input.focus();
}

export default [
  {
    id: 'ai-tokens', category: 'AI', name: 'Token Predictor', title: 'LLM Token Predictor',
    desc: 'Estimate how many tokens a prompt will use, what it costs on each Claude model, and how much of the context window it eats.',
    mount: tokenMount,
  },
];
