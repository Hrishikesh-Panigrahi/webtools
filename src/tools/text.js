import { h, setField } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { copyButton } from '../ui/buttons.js';
import { transformTool, toggleRow, inputHeader, runOnInput } from '../ui/panel.js';
import { diffView } from '../ui/diffView.js';
import { codeEditor } from '../ui/editor.js';
import { escapeHtml } from '../lib/security.js';

// Split on separators *and* on case boundaries, so an identifier already in one
// convention converts to another: `parseHTTPResponse` -> parse_http_response.
const splitWords = (text) => text
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  .trim()
  .split(/[\s_-]+/)
  .filter(Boolean);

const capitalize = (word) => word[0].toUpperCase() + word.slice(1).toLowerCase();

const CASES = {
  'UPPERCASE': (text) => text.toUpperCase(),
  'lowercase': (text) => text.toLowerCase(),
  'Title Case': (text) => text.replace(/\w\S*/g, capitalize),
  'Sentence case': (text) => text.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (start) => start.toUpperCase()),
  'camelCase': (text) => splitWords(text).map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word))).join(''),
  'PascalCase': (text) => splitWords(text).map(capitalize).join(''),
  'snake_case': (text) => splitWords(text).map((word) => word.toLowerCase()).join('_'),
  'kebab-case': (text) => splitWords(text).map((word) => word.toLowerCase()).join('-'),
  'CONSTANT_CASE': (text) => splitWords(text).map((word) => word.toUpperCase()).join('_'),
};

function caseMount(body) {
  const input = h('textarea', { class: 'io-textarea', placeholder: 'The quick brown fox', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea', readonly: true, spellcheck: 'false' });
  const targetCase = h('select', { class: 'select' }, ...Object.keys(CASES).map((name) => h('option', {}, name)));
  const run = () => { output.value = input.value ? CASES[targetCase.value](input.value) : ''; };
  input.addEventListener('input', run);
  targetCase.addEventListener('change', run);
  body.append(
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Text'), input),
    h('div', { class: 'tool-actions' }, h('span', { class: 'io-label' }, 'Convert to'), targetCase),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Result'), copyButton(() => output.value)),
      output,
    ),
  );
  input.focus();
}

function counterMount(body) {
  const input = h('textarea', { class: 'io-textarea tall', placeholder: 'Paste or type text…', spellcheck: 'false' });
  const stats = h('div', { class: 'stat-grid' });
  const addStat = (label) => {
    const value = h('div', { class: 'stat-value' }, '0');
    stats.append(h('div', { class: 'stat' }, value, h('div', { class: 'stat-label' }, label)));
    return value;
  };
  const characterCount = addStat('Characters');
  const wordCount = addStat('Words');
  const lineCount = addStat('Lines');
  const sentenceCount = addStat('Sentences');
  const byteCount = addStat('Bytes (UTF-8)');
  const run = () => {
    const text = input.value;
    characterCount.textContent = text.length.toLocaleString();
    wordCount.textContent = (text.trim() ? text.trim().split(/\s+/).length : 0).toLocaleString();
    lineCount.textContent = (text ? text.split(/\n/).length : 0).toLocaleString();
    // One non-terminator then terminators, rather than a greedy `[^.!?]+` run:
    // the greedy form backtracks over the whole string at every start position,
    // which turns a 50k paste into seconds of work for the same count.
    sentenceCount.textContent = (text.match(/[^.!?][.!?]+/g) || []).length.toLocaleString();
    byteCount.textContent = new TextEncoder().encode(text).length.toLocaleString();
  };
  input.addEventListener('input', run);
  body.append(h('div', { class: 'io-box' }, input), stats);
  input.focus();
}

const LOREM_WORDS = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur'.split(' ');

function loremMount(body) {
  const count = h('input', { class: 'part-input', type: 'number', min: '1', max: '50', value: '3', style: 'max-width:5rem' });
  const output = h('textarea', { class: 'io-textarea tall', readonly: true, spellcheck: 'false' });
  const generate = () => {
    const paragraphCount = Math.min(50, Math.max(1, Number(count.value) || 1));
    const paragraphs = [];
    for (let paragraph = 0; paragraph < paragraphCount; paragraph++) {
      const wordTotal = 30 + ((paragraph * 17) % 40); // deterministic-ish variety
      const words = [];
      for (let word = 0; word < wordTotal; word++) words.push(LOREM_WORDS[(paragraph * 7 + word * 3) % LOREM_WORDS.length]);
      const sentence = words.join(' ').replace(/(^|\.\s)([a-z])/g, (_, before, letter) => before + letter.toUpperCase());
      paragraphs.push(sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.');
    }
    output.value = paragraphs.join('\n\n');
  };
  count.addEventListener('input', generate);
  body.append(
    h('div', { class: 'tool-actions' },
      h('span', { class: 'io-label' }, 'Paragraphs'), count,
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: generate }, 'Generate'),
    ),
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Output'), copyButton(() => output.value)),
      output,
    ),
  );
  generate();
}

function regexMount(body) {
  const pattern = h('input', { class: 'url-field', spellcheck: 'false', placeholder: '\\b\\w+@\\w+\\.\\w+\\b' });
  const flags = h('input', { class: 'part-input', spellcheck: 'false', placeholder: 'gi', style: 'max-width:6rem' });
  const test = h('textarea', { class: 'io-textarea', placeholder: 'Text to match against…', spellcheck: 'false' });
  const error = h('div', { class: 'io-error' });
  const info = h('div', { class: 'rx-info' });
  const highlight = h('div', { class: 'rx-highlight' });

  const run = () => {
    error.textContent = '';
    info.textContent = '';
    if (!pattern.value) { highlight.textContent = test.value; return; }

    const text = test.value;
    let out = '', last = 0, count = 0, firstGroups = null, match;
    // The scan sits inside the try as well as the construction: V8 compiles a
    // pattern lazily, so an over-large one throws on the first exec, not on new.
    try {
      const flagStr = flags.value.includes('g') ? flags.value : flags.value + 'g';
      const re = new RegExp(pattern.value, flagStr);
      re.lastIndex = 0;
      while ((match = re.exec(text)) !== null) {
        out += escapeHtml(text.slice(last, match.index));
        // A zero-length match (e.g. `a*`) has nothing to highlight — counting it is
        // enough; an empty <mark> would just render as a stray sliver.
        if (match[0]) out += '<mark class="rx-hit">' + escapeHtml(match[0]) + '</mark>';
        last = match.index + match[0].length;
        count++;
        if (match.length > 1 && !firstGroups) firstGroups = match.slice(1);
        if (match.index === re.lastIndex) re.lastIndex++; // guard against zero-length matches
        if (count > 50000) break; // safety valve
      }
    } catch (e) {
      error.textContent = e.message;
      highlight.textContent = test.value;
      return;
    }
    out += escapeHtml(text.slice(last));
    highlight.innerHTML = out;
    info.textContent = `${count} ${count === 1 ? 'match' : 'matches'}`
      + (firstGroups ? ' · groups: ' + firstGroups.map((g, i) => `$${i + 1}=${g ?? ''}`).join(', ') : '');
  };

  [pattern, flags, test].forEach((field) => field.addEventListener('input', run));
  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label' }, 'Pattern'),
      h('div', { class: 'rx-pattern-row' }, pattern, flags),
      error,
    ),
    h('div', { class: 'io-box' }, h('div', { class: 'io-label' }, 'Test text'), test),
    h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Matches'), info),
    highlight,
  );
  pattern.focus();
}

const IGNORE_WHITESPACE = 'Ignore whitespace';
const IGNORE_CASE_IN_DIFF = 'Ignore case';

function diffMount(body) {
  const inputA = h('textarea', { class: 'io-textarea', placeholder: 'The quick brown fox\njumps over\nthe lazy dog', spellcheck: 'false' });
  const inputB = h('textarea', { class: 'io-textarea', placeholder: 'The quick brown fox\nleaps over\nthe lazy dog\nand naps', spellcheck: 'false' });
  const editorA = codeEditor(inputA);
  const editorB = codeEditor(inputB);
  const { row: options, boxes } = toggleRow([IGNORE_WHITESPACE, IGNORE_CASE_IN_DIFF]);
  const error = h('div', { class: 'io-error' });
  const result = h('div', {});

  const normalizer = () => {
    const ignoreWhitespace = boxes[IGNORE_WHITESPACE].checked;
    const ignoreCase = boxes[IGNORE_CASE_IN_DIFF].checked;
    if (!ignoreWhitespace && !ignoreCase) return undefined;
    return (line) => {
      const spaced = ignoreWhitespace ? line.trim().replace(/\s+/g, ' ') : line;
      return ignoreCase ? spaced.toLowerCase() : spaced;
    };
  };

  const run = () => {
    result.replaceChildren();
    error.textContent = '';
    if (!inputA.value && !inputB.value) return;
    try {
      result.append(diffView(inputA.value.split('\n'), inputB.value.split('\n'), 'The two texts are identical.', { normalize: normalizer() }));
    } catch (e) {
      error.textContent = e.message;
    }
  };

  const swap = h('button', {
    class: 'btn-copy', type: 'button', html: icons.swap + ' Swap', title: 'Swap the two sides',
    onClick: () => {
      const original = inputA.value;
      setField(inputA, inputB.value);
      setField(inputB, original);
    },
  });

  runOnInput([inputA, inputB], run);
  Object.values(boxes).forEach((box) => box.addEventListener('change', run));
  body.append(
    h('div', { class: 'io-grid' },
      h('div', { class: 'io-box' }, inputHeader('Original', inputA), editorA.root),
      h('div', { class: 'io-box' }, inputHeader('Changed', inputB, [swap]), editorB.root),
    ),
    h('div', { class: 'tool-actions' }, options),
    error,
    result,
  );
  inputA.focus();
}

const LINE_ORDERS = {
  'Original order': null,
  'A → Z': (a, b) => a.localeCompare(b),
  'Z → A': (a, b) => b.localeCompare(a),
  'Numeric': (a, b) => (Number.parseFloat(a) || 0) - (Number.parseFloat(b) || 0),
  'Shortest first': (a, b) => a.length - b.length,
  'Longest first': (a, b) => b.length - a.length,
};

const TRIM = 'Trim each line';
const DROP_BLANKS = 'Drop blank lines';
const DEDUPE = 'Remove duplicates';
const IGNORE_CASE = 'Ignore case';
const REVERSE = 'Reverse result';

function linesMount(body) {
  const input = h('textarea', { class: 'io-textarea tall', placeholder: 'banana\napple\ncherry\napple\n  banana', spellcheck: 'false' });
  const output = h('textarea', { class: 'io-textarea tall', readonly: true, spellcheck: 'false' });
  const inputEditor = codeEditor(input);
  const outputEditor = codeEditor(output);
  const order = h('select', { class: 'select' }, ...Object.keys(LINE_ORDERS).map((label) => h('option', {}, label)));
  const { row: options, boxes } = toggleRow([TRIM, DROP_BLANKS, DEDUPE, IGNORE_CASE, REVERSE], [TRIM, DROP_BLANKS, DEDUPE]);
  const counts = h('div', { class: 'rx-info' });

  const run = () => {
    const original = input.value ? input.value.split('\n') : [];
    const key = (line) => (boxes[IGNORE_CASE].checked ? line.toLowerCase() : line);

    let lines = boxes[TRIM].checked ? original.map((line) => line.trim()) : [...original];
    if (boxes[DROP_BLANKS].checked) lines = lines.filter((line) => line.trim() !== '');
    if (boxes[DEDUPE].checked) {
      const seen = new Set();
      lines = lines.filter((line) => {
        const identity = key(line);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
    }

    const compare = LINE_ORDERS[order.value];
    if (compare) {
      lines.sort(boxes[IGNORE_CASE].checked ? (a, b) => compare(key(a), key(b)) : compare);
    }
    if (boxes[REVERSE].checked) lines.reverse();

    output.value = lines.join('\n');
    const removed = original.length - lines.length;
    counts.textContent = original.length
      ? `${original.length.toLocaleString()} in · ${lines.length.toLocaleString()} out · ${removed.toLocaleString()} removed`
      : '';
  };

  input.addEventListener('input', run);
  order.addEventListener('change', run);
  Object.values(boxes).forEach((box) => box.addEventListener('change', run));

  body.append(
    h('div', { class: 'tool-actions' }, h('span', { class: 'io-label' }, 'Order'), order, options),
    h('div', { class: 'io-grid' },
      h('div', { class: 'io-box' }, inputHeader('Lines', input), inputEditor.root),
      h('div', { class: 'io-box' },
        h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Result'), counts, copyButton(() => output.value)),
        outputEditor.root,
      ),
    ),
  );
  input.focus();
}

// --- Text to speech ---

// The voice list arrives asynchronously in most browsers, and a long utterance
// is silently cut off in some, so the text is spoken one sentence at a time.
function speechMount(body) {
  const synth = window.speechSynthesis;
  const input = h('textarea', { class: 'io-textarea tall', spellcheck: 'false', placeholder: 'Type or paste something to read aloud…' });
  const voiceSelect = h('select', { class: 'select' });
  const status = h('span', { class: 'kv-value' }, 'Idle');

  if (!synth) {
    body.append(h('p', { class: 'tool-hint' }, 'This browser has no speech synthesis support.'));
    return;
  }

  const sliders = {};
  const sliderRow = (label, min, max, step, initial, format) => {
    const slider = h('input', { class: 'slider', type: 'range', min, max, step, value: String(initial) });
    const readout = h('span', { class: 'kv-value' }, format(initial));
    slider.addEventListener('input', () => { readout.textContent = format(Number(slider.value)); });
    sliders[label] = slider;
    return h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, label), slider, readout);
  };

  const rateRow = sliderRow('Rate', '0.5', '2', '0.1', 1, (v) => `${v.toFixed(1)}×`);
  const pitchRow = sliderRow('Pitch', '0', '2', '0.1', 1, (v) => v.toFixed(1));
  const volumeRow = sliderRow('Volume', '0', '1', '0.05', 1, (v) => `${Math.round(v * 100)}%`);

  let voices = [];
  const loadVoices = () => {
    voices = synth.getVoices();
    if (!voices.length) return;
    const previous = voiceSelect.value;
    voiceSelect.innerHTML = '';
    voices.forEach((voice, index) => {
      voiceSelect.append(h('option', { value: String(index) }, `${voice.name} — ${voice.lang}${voice.default ? ' (default)' : ''}`));
    });
    if (previous && voices[Number(previous)]) voiceSelect.value = previous;
  };
  loadVoices();
  synth.addEventListener('voiceschanged', loadVoices);

  const speak = () => {
    const text = input.value.trim();
    if (!text) return;
    synth.cancel();
    // Chunking keeps long text from hitting the per-utterance limits browsers impose.
    const chunks = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text];
    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      const voice = voices[Number(voiceSelect.value)];
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      utterance.rate = Number(sliders.Rate.value);
      utterance.pitch = Number(sliders.Pitch.value);
      utterance.volume = Number(sliders.Volume.value);
      if (index === chunks.length - 1) utterance.addEventListener('end', () => { status.textContent = 'Finished'; });
      synth.speak(utterance);
    });
    status.textContent = `Speaking ${chunks.length} chunk${chunks.length === 1 ? '' : 's'}`;
  };

  const pause = h('button', { class: 'btn', type: 'button' }, 'Pause');
  pause.addEventListener('click', () => {
    if (synth.paused) { synth.resume(); pause.textContent = 'Pause'; status.textContent = 'Speaking'; }
    else { synth.pause(); pause.textContent = 'Resume'; status.textContent = 'Paused'; }
  });

  body.append(
    h('div', { class: 'io-box' },
      h('div', { class: 'io-label-row' }, h('span', { class: 'io-label' }, 'Text'), status),
      input,
    ),
    h('div', { class: 'qr-controls' },
      h('label', { class: 'qr-control' }, h('span', { class: 'part-label' }, 'Voice'), voiceSelect),
      rateRow, pitchRow, volumeRow,
    ),
    h('div', { class: 'tool-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: speak }, 'Speak'),
      pause,
      h('button', {
        class: 'btn btn-ghost', type: 'button',
        onClick: () => { synth.cancel(); pause.textContent = 'Pause'; status.textContent = 'Stopped'; },
      }, 'Stop'),
    ),
    h('p', { class: 'tool-hint' }, 'Voices come from your operating system, so the list differs between machines.'),
  );
  input.focus();
}

export default [
  { id: 'text-case', category: 'Text', name: 'Case Converter', title: 'Case Converter', keywords: 'camel snake kebab pascal upper lower title', desc: 'Convert text between UPPER, lower, Title, camelCase, snake_case, kebab-case and more.', mount: caseMount },
  { id: 'text-regex', category: 'Text', name: 'Regex Tester', title: 'Regex Tester', keywords: 'regexp pattern match capture', desc: 'Test a regular expression against sample text with live match highlighting and capture groups.', mount: regexMount },
  { id: 'text-diff', category: 'Text', name: 'Diff', title: 'Text Diff', keywords: 'compare difference changes', desc: 'Line-by-line diff of two blocks of text. Green lines are added; red lines are removed.', mount: diffMount },
  {
    id: 'text-slugify', category: 'Text', name: 'Slugify', title: 'Slugify',
    desc: 'Turn any text into a clean, URL-friendly slug.',
    keywords: 'url friendly permalink kebab',
    mount: transformTool({
      placeholder: 'Hello, World! — My First Post',
      transform: (text) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    }),
  },
  {
    id: 'text-lines', category: 'Text', name: 'Sort & Dedupe', title: 'Sort & Deduplicate Lines',
    keywords: 'unique uniq lines order',
    desc: 'Sort, trim and de-duplicate a list of lines. Useful for log output, ID lists and config blocks.',
    mount: linesMount,
  },
  { id: 'text-count', category: 'Text', name: 'Word Counter', title: 'Word & Character Counter', keywords: 'length characters count bytes', desc: 'Live counts of characters, words, lines, sentences and UTF-8 bytes.', mount: counterMount },
  { id: 'text-lorem', category: 'Text', name: 'Lorem Ipsum', title: 'Lorem Ipsum Generator', keywords: 'placeholder dummy filler text', desc: 'Generate placeholder paragraphs.', mount: loremMount },
  {
    id: 'text-speech', category: 'Text', name: 'Text to Speech', title: 'Text to Speech',
    keywords: 'tts read aloud voice',
    desc: 'Read text aloud using the voices installed on your device.',
    mount: speechMount,
  },
];
