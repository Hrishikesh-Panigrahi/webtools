// IPv4 and IPv6 address maths: parsing, formatting and subnet arithmetic.
// IPv4 works in unsigned 32-bit integers, IPv6 in BigInt, so a /8 and a /12
// answer with the same code path.

// A message quotes what the reader typed, but a pasted blob would otherwise be
// echoed back in full — unreadable, and long enough to distort the layout.
const MAX_QUOTED = 32;
const quote = (text) => {
  const trimmed = String(text).trim();
  return `"${trimmed.length > MAX_QUOTED ? `${trimmed.slice(0, MAX_QUOTED)}…` : trimmed}"`;
};

// ---------- IPv4 ----------

export function parseIpv4(text) {
  const parts = text.trim().split('.');
  if (parts.length !== 4) throw new Error(`${quote(text)} is not an IPv4 address.`);
  return parts.reduce((accumulator, part) => {
    if (!/^\d{1,3}$/.test(part)) throw new Error(`${quote(text)} has a non-numeric octet.`);
    const octet = Number(part);
    if (octet > 255) throw new Error(`${quote(text)} has an octet above 255.`);
    return accumulator * 256 + octet;
  }, 0);
}

export const formatIpv4 = (value) => [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');

const ipv4Mask = (prefix) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

/** A dotted mask like 255.255.254.0 back to its prefix length, if it is contiguous. */
function maskToPrefix(mask) {
  const inverted = ~mask >>> 0;
  if (((inverted + 1) & inverted) !== 0) throw new Error('Netmask bits are not contiguous.');
  return 32 - Math.log2(inverted + 1);
}

const IPV4_SCOPES = [
  ['0.0.0.0/8', 'Current network'],
  ['10.0.0.0/8', 'Private (RFC 1918)'],
  ['100.64.0.0/10', 'Carrier-grade NAT'],
  ['127.0.0.0/8', 'Loopback'],
  ['169.254.0.0/16', 'Link-local'],
  ['172.16.0.0/12', 'Private (RFC 1918)'],
  ['192.0.2.0/24', 'Documentation'],
  ['192.168.0.0/16', 'Private (RFC 1918)'],
  ['198.18.0.0/15', 'Benchmarking'],
  ['224.0.0.0/4', 'Multicast'],
  ['240.0.0.0/4', 'Reserved'],
];

function ipv4Scope(address) {
  for (const [range, label] of IPV4_SCOPES) {
    const [base, prefix] = range.split('/');
    const mask = ipv4Mask(Number(prefix));
    if ((address & mask) >>> 0 === (parseIpv4(base) & mask) >>> 0) return label;
  }
  return 'Public';
}

const ipv4Class = (address) => {
  const leading = address >>> 24;
  if (leading < 128) return 'A';
  if (leading < 192) return 'B';
  if (leading < 224) return 'C';
  return leading < 240 ? 'D (multicast)' : 'E (reserved)';
};

const toBinary = (address) => [24, 16, 8, 0].map((shift) => ((address >>> shift) & 255).toString(2).padStart(8, '0')).join('.');

function describeIpv4(address, prefix) {
  const mask = ipv4Mask(prefix);
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  // /31 point-to-point links use both addresses; a /32 is a single host route.
  const usable = prefix >= 31 ? total : Math.max(0, total - 2);
  const firstHost = prefix >= 31 ? network : network + 1;
  const lastHost = prefix >= 31 ? broadcast : broadcast - 1;

  return {
    version: 4,
    prefix,
    rows: [
      ['Address', formatIpv4(address)],
      ['Network', `${formatIpv4(network)}/${prefix}`],
      ['Netmask', formatIpv4(mask)],
      ['Wildcard', formatIpv4(~mask >>> 0)],
      ['Broadcast', prefix >= 31 ? '—' : formatIpv4(broadcast)],
      ['Host range', usable ? `${formatIpv4(firstHost)} – ${formatIpv4(lastHost)}` : '—'],
      ['Total addresses', total.toLocaleString()],
      ['Usable hosts', usable.toLocaleString()],
      ['Class', ipv4Class(address)],
      ['Scope', ipv4Scope(address)],
      ['Integer', (address >>> 0).toLocaleString('en-US', { useGrouping: false })],
      ['Hex', '0x' + (address >>> 0).toString(16).padStart(8, '0')],
      ['Binary', toBinary(address)],
      ['Reverse DNS', formatIpv4(address).split('.').reverse().join('.') + '.in-addr.arpa'],
    ],
  };
}

// ---------- IPv6 ----------

/** Split a scope/zone id (`fe80::1%eth0`) off an address, as `ip addr` prints it. */
export function splitZone(text) {
  const [address, ...zone] = text.trim().replace(/^\[|\]$/g, '').split('%');
  return { address, zone: zone.join('%') || null };
}

export function parseIpv6(text) {
  const { address: trimmed } = splitZone(text);
  if (!/^[0-9a-f:.]+$/i.test(trimmed)) throw new Error(`${quote(text)} is not an IPv6 address.`);

  const halves = trimmed.split('::');
  if (halves.length > 2) throw new Error('An IPv6 address may contain "::" only once.');

  const hasGap = halves.length === 2;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = hasGap && halves[1] ? halves[1].split(':') : [];

  // A trailing IPv4 form (::ffff:192.168.0.1) stands in for the final two groups.
  const trailingGroups = hasGap ? tail : head;
  const lastGroup = trailingGroups[trailingGroups.length - 1];
  if (lastGroup?.includes('.')) {
    const value = parseIpv4(lastGroup);
    trailingGroups.splice(-1, 1, ((value >>> 16) & 0xffff).toString(16), (value & 0xffff).toString(16));
  }

  const supplied = head.length + tail.length;
  if (!hasGap && supplied !== 8) throw new Error('An IPv6 address needs eight groups.');
  if (hasGap && supplied > 7) throw new Error('Too many groups for an IPv6 address.');

  const all = hasGap ? [...head, ...new Array(8 - supplied).fill('0'), ...tail] : head;

  return all.reduce((accumulator, group) => {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) throw new Error(`${quote(group)} is not a valid IPv6 group.`);
    return (accumulator << 16n) | BigInt(parseInt(group, 16));
  }, 0n);
}

const ipv6Groups = (value) => Array.from({ length: 8 }, (_, i) => Number((value >> BigInt((7 - i) * 16)) & 0xffffn));

export const formatIpv6Full = (value) => ipv6Groups(value).map((group) => group.toString(16).padStart(4, '0')).join(':');

/** RFC 5952 form: lowercase, no leading zeros, longest zero run collapsed to "::". */
export function formatIpv6(value) {
  const groups = ipv6Groups(value);
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < 8; i++) {
    if (groups[i] !== 0) continue;
    let run = 0;
    while (i + run < 8 && groups[i + run] === 0) run++;
    if (run > bestLength) { bestLength = run; bestStart = i; }
    i += run - 1;
  }
  const text = groups.map((group) => group.toString(16));
  if (bestLength < 2) return text.join(':');
  return `${text.slice(0, bestStart).join(':')}::${text.slice(bestStart + bestLength).join(':')}`;
}

const IPV6_SCOPES = [
  ['::/128', 'Unspecified'],
  ['::1/128', 'Loopback'],
  ['::ffff:0:0/96', 'IPv4-mapped'],
  ['64:ff9b::/96', 'IPv4/IPv6 translation'],
  ['100::/64', 'Discard-only'],
  ['2001:db8::/32', 'Documentation'],
  ['2001::/32', 'Teredo'],
  ['2002::/16', '6to4'],
  ['fc00::/7', 'Unique local'],
  ['fe80::/10', 'Link-local'],
  ['ff00::/8', 'Multicast'],
  ['2000::/3', 'Global unicast'],
];

const ipv6Mask = (prefix) => (prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix));

function ipv6Scope(address) {
  for (const [range, label] of IPV6_SCOPES) {
    const [base, prefix] = range.split('/');
    const mask = ipv6Mask(Number(prefix));
    if ((address & mask) === (parseIpv6(base) & mask)) return label;
  }
  return 'Reserved';
}

const reverseIpv6 = (address) => formatIpv6Full(address).replace(/:/g, '').split('').reverse().join('.') + '.ip6.arpa';

function describeIpv6(address, prefix, zone) {
  const mask = ipv6Mask(prefix);
  const network = address & mask;
  const last = network | (~mask & ((1n << 128n) - 1n));
  const total = 1n << BigInt(128 - prefix);

  return {
    version: 6,
    prefix,
    rows: [
      ['Address', formatIpv6(address)],
      ...(zone ? [['Zone', zone]] : []),
      ['Expanded', formatIpv6Full(address)],
      ['Network', `${formatIpv6(network)}/${prefix}`],
      ['First address', formatIpv6(network)],
      ['Last address', formatIpv6(last)],
      ['Total addresses', total.toLocaleString('en-US')],
      ['/64 subnets', prefix <= 64 ? (1n << BigInt(64 - prefix)).toLocaleString('en-US') : '—'],
      ['Scope', ipv6Scope(address)],
      ['Reverse DNS', reverseIpv6(address)],
    ],
  };
}

// ---------- Entry point ----------

/**
 * Describe any of `10.0.0.1`, `10.0.0.1/24`, `10.0.0.1 255.255.255.0`
 * or `2001:db8::1/48` as a list of `[label, value]` rows.
 */
export function describeAddress(input) {
  const text = input.trim();
  if (!text) throw new Error('Enter an IP address.');

  const [addressPart, maskPart] = text.split(/[/\s]+/);
  const isIpv6 = addressPart.includes(':');

  let prefix;
  if (maskPart === undefined) prefix = isIpv6 ? 128 : 32;
  else if (!isIpv6 && maskPart.includes('.')) prefix = maskToPrefix(parseIpv4(maskPart));
  else {
    if (!/^\d{1,3}$/.test(maskPart)) throw new Error(`${quote(maskPart)} is not a prefix length.`);
    prefix = Number(maskPart);
  }

  const maxPrefix = isIpv6 ? 128 : 32;
  if (prefix > maxPrefix) throw new Error(`A prefix cannot exceed /${maxPrefix}.`);

  return isIpv6
    ? describeIpv6(parseIpv6(addressPart), prefix, splitZone(addressPart).zone)
    : describeIpv4(parseIpv4(addressPart), prefix);
}

/** Split a network into equal subnets of `newPrefix`, capped at `limit` rows. */
export function splitSubnets(input, newPrefix, limit = 64) {
  const text = input.trim();
  const isIpv6 = text.includes(':');
  const [addressPart, maskPart] = text.split(/[/\s]+/);
  const basePrefix = maskPart === undefined ? (isIpv6 ? 128 : 32) : Number(maskPart);
  if (newPrefix < basePrefix) throw new Error(`/${newPrefix} is larger than the network you started with.`);

  const maxPrefix = isIpv6 ? 128 : 32;
  if (newPrefix > maxPrefix) throw new Error(`A prefix cannot exceed /${maxPrefix}.`);

  const count = 2 ** Math.min(newPrefix - basePrefix, 20);
  const shown = Math.min(count, limit);

  if (isIpv6) {
    const network = parseIpv6(addressPart) & ipv6Mask(basePrefix);
    const step = 1n << BigInt(128 - newPrefix);
    return {
      total: count,
      subnets: Array.from({ length: shown }, (_, i) => {
        const start = network + BigInt(i) * step;
        return { network: `${formatIpv6(start)}/${newPrefix}`, range: `${formatIpv6(start)} – ${formatIpv6(start + step - 1n)}` };
      }),
    };
  }

  const network = (parseIpv4(addressPart) & ipv4Mask(basePrefix)) >>> 0;
  const step = 2 ** (32 - newPrefix);
  return {
    total: count,
    subnets: Array.from({ length: shown }, (_, i) => {
      const start = network + i * step;
      const end = start + step - 1;
      return {
        network: `${formatIpv4(start)}/${newPrefix}`,
        range: newPrefix >= 31 ? `${formatIpv4(start)} – ${formatIpv4(end)}` : `${formatIpv4(start + 1)} – ${formatIpv4(end - 1)}`,
      };
    }),
  };
}
