// User-Agent string parsing. Every rule is a pattern plus a name, matched in
// specificity order — Edge advertises itself as Chrome, Chrome as Safari, and
// almost everything claims to be Mozilla, so the first match wins.

const firstCapture = (match) => match?.slice(1).find(Boolean) ?? null;

/** Run an ordered rule list and return `{ name, version }` for the first hit. */
function matchRule(rules, text) {
  for (const [name, pattern] of rules) {
    const match = text.match(pattern);
    if (match) return { name, version: firstCapture(match) };
  }
  return null;
}

const BOTS = [
  ['Googlebot', /Googlebot(?:-\w+)?\/?([\d.]+)?/],
  ['Bingbot', /bingbot\/([\d.]+)/i],
  ['DuckDuckBot', /DuckDuckBot/i],
  ['Baiduspider', /Baiduspider/i],
  ['YandexBot', /YandexBot\/([\d.]+)/i],
  ['Applebot', /Applebot\/([\d.]+)/i],
  ['ClaudeBot', /Claude(?:Bot|-Web)\/?([\d.]+)?/i],
  ['GPTBot', /GPTBot\/([\d.]+)/i],
  ['Facebook crawler', /facebookexternalhit\/([\d.]+)/i],
  ['Twitterbot', /Twitterbot\/([\d.]+)/i],
  ['Slackbot', /Slackbot(?:-LinkExpanding)?\/?([\d.]+)?/i],
  ['Discordbot', /Discordbot\/([\d.]+)/i],
  ['WhatsApp', /WhatsApp\/([\d.]+)/i],
  ['Telegram', /TelegramBot/i],
  ['Ahrefs', /AhrefsBot\/([\d.]+)/i],
  ['Semrush', /SemrushBot\/([\d.~]+)/i],
  ['curl', /curl\/([\d.]+)/i],
  ['Wget', /Wget\/([\d.]+)/i],
  ['Python requests', /python-requests\/([\d.]+)/i],
  ['Python urllib', /Python-urllib\/([\d.]+)/i],
  ['axios', /axios\/([\d.]+)/i],
  ['node-fetch', /node-fetch\/([\d.]+)/i],
  ['Go HTTP client', /Go-http-client\/([\d.]+)/i],
  ['Java', /Java\/([\d._]+)/i],
  ['PostmanRuntime', /PostmanRuntime\/([\d.]+)/i],
  ['Headless Chrome', /HeadlessChrome\/([\d.]+)/],
  ['Generic crawler', /(?:bot|crawler|spider|scraper|slurp)\b/i],
];

const BROWSERS = [
  ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
  ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
  ['Opera', /Opera[\s/]([\d.]+)/],
  ['Vivaldi', /Vivaldi\/([\d.]+)/],
  ['Yandex Browser', /YaBrowser\/([\d.]+)/],
  ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
  ['UC Browser', /UCBrowser\/([\d.]+)/],
  ['DuckDuckGo', /DuckDuckGo\/([\d.]+)/],
  ['Silk', /Silk\/([\d.]+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
  ['Safari', /Version\/([\d.]+).*\bSafari\//],
  ['Safari', /\bSafari\/([\d.]+)/],
  ['Internet Explorer', /MSIE ([\d.]+)/],
  ['Internet Explorer', /Trident\/.*rv:([\d.]+)/],
];

const ENGINES = [
  ['EdgeHTML', /Edge\/([\d.]+)/],
  ['Trident', /Trident\/([\d.]+)/],
  ['Presto', /Presto\/([\d.]+)/],
  ['Gecko', /rv:([\d.]+)\).*Gecko\/|Gecko\/\d+ Firefox\/([\d.]+)/],
  ['Blink', /Chrome\/([\d.]+)/],
  ['WebKit', /AppleWebKit\/([\d.]+)/],
];

const WINDOWS_RELEASES = {
  '10.0': '10 or 11', 6.3: '8.1', 6.2: '8', 6.1: '7', '6.0': 'Vista', 5.2: 'XP x64', 5.1: 'XP',
};

const LINUX_DISTRIBUTIONS = ['Ubuntu', 'Fedora', 'Debian', 'Arch', 'CentOS', 'Red Hat', 'SUSE', 'Mint'];

function detectOs(text) {
  const windows = text.match(/Windows NT ([\d.]+)/);
  if (windows) return { name: 'Windows', version: WINDOWS_RELEASES[windows[1]] ?? windows[1] };
  if (/Windows Phone ([\d.]+)/.test(text)) return { name: 'Windows Phone', version: text.match(/Windows Phone ([\d.]+)/)[1] };

  const ios = text.match(/(?:iPhone )?OS (\d+[._]\d+(?:[._]\d+)?) like Mac OS X/);
  if (ios) return { name: /iPad/.test(text) ? 'iPadOS' : 'iOS', version: ios[1].replace(/_/g, '.') };

  const mac = text.match(/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/);
  if (mac) return { name: 'macOS', version: mac[1].replace(/_/g, '.') };
  if (/Macintosh/.test(text)) return { name: 'macOS', version: null };

  const android = text.match(/Android ([\d.]+)/);
  if (android) return { name: 'Android', version: android[1] };
  if (/Android/.test(text)) return { name: 'Android', version: null };

  const chromeOs = text.match(/CrOS \S+ ([\d.]+)/);
  if (chromeOs) return { name: 'ChromeOS', version: chromeOs[1] };

  const distribution = LINUX_DISTRIBUTIONS.find((name) => new RegExp(name, 'i').test(text));
  if (distribution) return { name: distribution + ' Linux', version: null };
  if (/Linux/.test(text)) return { name: 'Linux', version: null };
  if (/FreeBSD/.test(text)) return { name: 'FreeBSD', version: null };
  if (/CrOS/.test(text)) return { name: 'ChromeOS', version: null };
  return null;
}

const ARCHITECTURES = [
  ['x86-64', /(?:Win64|WOW64|x86_64|amd64|x64)/i],
  ['ARM64', /(?:arm64|aarch64)/i],
  ['ARM', /\barm\b/i],
  ['x86', /(?:i[36]86|Win32)/i],
];

function detectDevice(text, os) {
  if (/\bTV\b|SmartTV|GoogleTV|AppleTV|HbbTV|NetCast|Roku/i.test(text)) return 'TV';
  if (/PlayStation|Xbox|Nintendo/i.test(text)) return 'Console';
  if (/iPad|Tablet|Kindle|Silk|PlayBook/i.test(text)) return 'Tablet';
  if (/iPhone|iPod|Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(text)) return 'Phone';
  if (os?.name === 'Android') return 'Phone';
  return 'Desktop';
}

const MODEL_PATTERNS = [
  /Android [\d.]+; ([^;)]+?)(?: Build\/|\))/,
  /\(([^;]*(?:iPhone|iPad|iPod)[^;)]*)[;)]/,
];

function detectModel(text) {
  for (const pattern of MODEL_PATTERNS) {
    const match = text.match(pattern);
    const model = match?.[1]?.trim();
    if (model && !/^(?:U|K|wv)$/.test(model)) return model;
  }
  return null;
}

const join = (part) => (part ? [part.name, part.version].filter(Boolean).join(' ') : null);

/**
 * Break a User-Agent string into its parts.
 *
 * @param {string} text
 * @returns {{ rows: Array<[string, string]>, isBot: boolean, notes: string[] }}
 */
export function parseUserAgent(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste a User-Agent string.');

  const bot = matchRule(BOTS, trimmed);
  const browser = matchRule(BROWSERS, trimmed);
  const engine = matchRule(ENGINES, trimmed);
  const os = detectOs(trimmed);
  const device = detectDevice(trimmed, os);
  const architecture = ARCHITECTURES.find(([, pattern]) => pattern.test(trimmed))?.[0] ?? null;
  const model = detectModel(trimmed);

  const rows = [
    ['Type', bot ? 'Bot or tool' : 'Browser'],
    [bot ? 'Agent' : 'Browser', join(bot) || join(browser) || 'Unknown'],
    ['Engine', join(engine) || '—'],
    ['Operating system', join(os) || '—'],
    ['Device', device],
    ['Model', model || '—'],
    ['Architecture', architecture || '—'],
    ['Length', `${trimmed.length} characters`],
  ];

  const notes = [];
  if (!bot && /Chrome\/\d+/.test(trimmed) && /Safari\/\d+/.test(trimmed)) {
    notes.push('Claims both Chrome and Safari — every Blink browser does, for legacy sniffing.');
  }
  if (/Mozilla\/5\.0/.test(trimmed)) notes.push('The "Mozilla/5.0" prefix is vestigial; it tells you nothing.');
  if (browser?.name === 'Chrome' && Number.parseInt(browser.version, 10) >= 110) {
    notes.push('Chrome freezes parts of this string — prefer Client Hints (Sec-CH-UA) for real detection.');
  }
  if (/HeadlessChrome/.test(trimmed)) notes.push('Headless Chrome — usually automation, not a person.');

  return { rows, isBot: Boolean(bot), notes };
}
