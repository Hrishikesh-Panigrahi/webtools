// The landing page: paste anything and get sent to the tool that fits, then
// pinned tools, recent ones, and every tool by category.

import { h, setField, onRunKey, shortcutLabel } from '../ui/dom.js';
import { icons, categoryIcons } from '../ui/icons.js';
import { detectContent } from '../lib/detect.js';
import { pinnedIds, recentIds, isPinned, togglePinned, onPrefsChange } from './prefs.js';

// One-click samples, so the paste box demonstrates itself.
const SAMPLES = [
  ['JSON', '{"user":{"id":7,"name":"Ada","roles":["admin","dev"]},"active":true}'],
  ['JWT', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0IiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwfQ.c2lnbmF0dXJl'],
  ['cURL', "curl -X POST https://api.example.com/users -H 'content-type: application/json' -d '{\"name\":\"Ada\"}'"],
  ['Timestamp', '1700000000'],
  ['Cron', '*/15 9-17 * * mon-fri'],
  ['Color', '#4f7cff'],
  ['CIDR', '10.0.0.0/22'],
];

// When nothing specific is recognised, these still take any text.
const TEXT_FALLBACKS = ['text-count', 'text-case', 'b64-encode', 'hash-sha'];

/**
 * Render the home view into `container`.
 * @returns {{ kind: 'home', paste(text: string): void, dispose(): void }}
 */
export function renderHome(container, { tools, categories, findTool, openTool }) {
  const knownTools = (ids) => ids.map(findTool).filter(Boolean);

  const box = h('textarea', {
    class: 'home-paste', spellcheck: 'false', rows: '3', 'data-no-persist': true,
    placeholder: 'Paste anything — JSON, a JWT, a cURL command, a URL, a timestamp, a cron line, CSV…',
    'aria-label': 'Paste a snippet to find the right tool',
  });
  const suggestions = h('div', { class: 'home-suggestions', 'aria-live': 'polite' });

  const chip = (tool, { isPrimary = false } = {}) => h('button', {
    class: 'suggest-chip' + (isPrimary ? ' is-primary' : ''), type: 'button',
    onClick: () => openTool(tool.id, box.value),
  },
    h('span', { class: 'suggest-icon', html: categoryIcons[tool.category] ?? '' }),
    tool.name,
    isPrimary ? h('kbd', {}, shortcutLabel('↵')) : null,
  );

  const showSamples = () => suggestions.replaceChildren(
    h('span', { class: 'home-suggest-label' }, 'Try one:'),
    ...SAMPLES.map(([label, text]) => h('button', {
      class: 'sample-chip', type: 'button', onClick: () => { setField(box, text); box.focus(); },
    }, label)),
  );

  let topSuggestion = null;
  const detect = () => {
    const text = box.value;
    topSuggestion = null;
    if (!text.trim()) { showSamples(); return; }
    const found = detectContent(text).filter(({ id }) => findTool(id));
    if (!found.length) {
      const fallbacks = knownTools(TEXT_FALLBACKS);
      topSuggestion = fallbacks[0];
      suggestions.replaceChildren(
        h('span', { class: 'home-suggest-label' }, 'Plain text? Open it in'),
        ...fallbacks.map((tool, index) => chip(tool, { isPrimary: index === 0 })),
      );
      return;
    }
    topSuggestion = findTool(found[0].id);
    suggestions.replaceChildren(
      h('span', { class: 'home-suggest-label' }, `Looks like ${found[0].kind} — open in`),
      ...found.map(({ id }, index) => chip(findTool(id), { isPrimary: index === 0 })),
    );
  };

  box.addEventListener('input', detect);
  onRunKey(box, () => { if (topSuggestion) openTool(topSuggestion.id, box.value); });

  const card = (tool) => {
    const pinned = isPinned(tool.id);
    return h('div', { class: 'tool-card' },
      h('a', { class: 'tool-card-link', href: '#' + tool.id },
        h('span', { class: 'tool-card-icon', html: categoryIcons[tool.category] ?? '' }),
        h('span', { class: 'tool-card-name' }, tool.name),
        h('span', { class: 'tool-card-desc' }, tool.desc),
      ),
      h('button', {
        class: 'tool-card-pin' + (pinned ? ' is-pinned' : ''), type: 'button', html: icons.star,
        'aria-label': `${pinned ? 'Unpin' : 'Pin'} ${tool.title}`, 'aria-pressed': String(pinned),
        title: pinned ? 'Unpin' : 'Pin to the top',
        onClick: () => togglePinned(tool.id),
      }),
    );
  };

  const collections = h('div', { class: 'home-collections' });
  const renderCollections = () => {
    const pinned = knownTools(pinnedIds());
    const recent = knownTools(recentIds());
    // replaceChildren() would render a skipped section's null as the text "null".
    collections.replaceChildren(...[
      pinned.length ? h('section', { class: 'home-section' },
        h('h2', { class: 'home-heading' }, h('span', { html: icons.star }), 'Pinned'),
        h('div', { class: 'card-grid' }, ...pinned.map(card)),
      ) : null,
      recent.length ? h('section', { class: 'home-section' },
        h('h2', { class: 'home-heading' }, h('span', { html: icons.clock }), 'Recent'),
        h('div', { class: 'recent-row' }, ...recent.map((tool) => h('a', { class: 'recent-chip', href: '#' + tool.id },
          h('span', { class: 'suggest-icon', html: categoryIcons[tool.category] ?? '' }), tool.name))),
      ) : null,
      ...Object.entries(categories).map(([category, list]) => h('section', { class: 'home-section' },
        h('h2', { class: 'home-heading' },
          h('span', { html: categoryIcons[category] ?? '' }), category, h('span', { class: 'home-count' }, String(list.length))),
        h('div', { class: 'card-grid' }, ...list.map(card)),
      )),
    ].filter(Boolean));
  };

  container.append(h('div', { class: 'home' },
    h('section', { class: 'home-hero' },
      h('h1', { class: 'home-title' }, 'What are you working with?'),
      h('p', { class: 'home-lede' },
        `${tools.length} developer tools that run entirely in your browser. Paste something and the right one is suggested, or press `,
        h('kbd', {}, shortcutLabel('K')), ' to jump anywhere.'),
      box,
      suggestions,
    ),
    collections,
  ));
  showSamples();
  renderCollections();
  const unsubscribe = onPrefsChange(renderCollections);
  box.focus();

  return {
    kind: 'home',
    paste(text) {
      setField(box, text);
      box.focus();
    },
    dispose: unsubscribe,
  };
}
