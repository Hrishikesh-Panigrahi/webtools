import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeAddress, splitSubnets, parseIpv4, formatIpv4, parseIpv6, formatIpv6, formatIpv6Full,
} from '../src/ip.js';

/** Look one labelled row out of a description. */
const field = (input, label) => {
  const row = describeAddress(input).rows.find(([name]) => name === label);
  assert.ok(row, `no "${label}" row for ${input}`);
  return row[1];
};

test('IPv4 addresses parse and format symmetrically', () => {
  for (const address of ['0.0.0.0', '1.2.3.4', '192.168.1.1', '255.255.255.255']) {
    assert.equal(formatIpv4(parseIpv4(address)), address);
  }
});

test('IPv4 subnet arithmetic', () => {
  assert.equal(field('192.168.1.130/26', 'Network'), '192.168.1.128/26');
  assert.equal(field('192.168.1.130/26', 'Netmask'), '255.255.255.192');
  assert.equal(field('192.168.1.130/26', 'Wildcard'), '0.0.0.63');
  assert.equal(field('192.168.1.130/26', 'Broadcast'), '192.168.1.191');
  assert.equal(field('192.168.1.130/26', 'Host range'), '192.168.1.129 – 192.168.1.190');
  assert.equal(field('192.168.1.130/26', 'Total addresses'), '64');
  assert.equal(field('192.168.1.130/26', 'Usable hosts'), '62');
});

test('a dotted netmask is accepted in place of a prefix', () => {
  assert.equal(field('10.1.2.3 255.255.254.0', 'Network'), '10.1.2.0/23');
  assert.equal(field('10.1.2.3 255.255.255.0', 'Network'), '10.1.2.0/24');
});

test('a bare address is treated as a single host', () => {
  assert.equal(field('8.8.8.8', 'Network'), '8.8.8.8/32');
  assert.equal(field('8.8.8.8', 'Usable hosts'), '1');
});

test('point-to-point and host prefixes follow RFC 3021', () => {
  assert.equal(field('10.0.0.0/31', 'Usable hosts'), '2', 'a /31 uses both addresses');
  assert.equal(field('10.0.0.0/31', 'Broadcast'), '—');
  assert.equal(field('10.0.0.7/32', 'Usable hosts'), '1');
});

test('IPv4 scopes are classified', () => {
  const cases = [
    ['10.0.0.1', 'Private (RFC 1918)'],
    ['172.16.0.1', 'Private (RFC 1918)'],
    ['172.32.0.1', 'Public'],
    ['192.168.1.1', 'Private (RFC 1918)'],
    ['127.0.0.1', 'Loopback'],
    ['169.254.5.5', 'Link-local'],
    ['100.64.0.1', 'Carrier-grade NAT'],
    ['224.0.0.1', 'Multicast'],
    ['8.8.8.8', 'Public'],
  ];
  for (const [address, scope] of cases) assert.equal(field(address, 'Scope'), scope, address);
});

test('IPv4 classes, integers and reverse DNS', () => {
  assert.equal(field('10.0.0.1', 'Class'), 'A');
  assert.equal(field('130.0.0.1', 'Class'), 'B');
  assert.equal(field('200.0.0.1', 'Class'), 'C');
  assert.equal(field('255.255.255.255', 'Integer'), '4294967295');
  assert.equal(field('1.2.3.4', 'Hex'), '0x01020304');
  assert.equal(field('1.2.3.4', 'Reverse DNS'), '4.3.2.1.in-addr.arpa');
  assert.equal(field('1.2.3.4', 'Binary'), '00000001.00000010.00000011.00000100');
});

test('IPv6 compresses per RFC 5952', () => {
  assert.equal(formatIpv6(parseIpv6('2001:0db8:0000:0000:0000:ff00:0042:8329')), '2001:db8::ff00:42:8329');
  assert.equal(formatIpv6(parseIpv6('::1')), '::1');
  assert.equal(formatIpv6(parseIpv6('::')), '::');
  assert.equal(formatIpv6(parseIpv6('fe80:0:0:0:1:0:0:2')), 'fe80::1:0:0:2', 'longest run wins');
});

test('IPv6 expands to eight full groups', () => {
  assert.equal(formatIpv6Full(parseIpv6('2001:db8::1')), '2001:0db8:0000:0000:0000:0000:0000:0001');
  assert.equal(formatIpv6Full(parseIpv6('::')), '0000:0000:0000:0000:0000:0000:0000:0000');
});

test('IPv6 accepts an embedded IPv4 tail', () => {
  assert.equal(formatIpv6Full(parseIpv6('::ffff:192.168.0.1')), '0000:0000:0000:0000:0000:ffff:c0a8:0001');
  assert.equal(formatIpv6(parseIpv6('0:0:0:0:0:ffff:1.2.3.4')), '::ffff:102:304');
});

test('IPv6 subnet arithmetic', () => {
  assert.equal(field('2001:db8:abcd:1234::1/48', 'Network'), '2001:db8:abcd::/48');
  assert.equal(field('2001:db8:abcd:1234::1/48', 'First address'), '2001:db8:abcd::');
  assert.equal(field('2001:db8:abcd:1234::1/48', 'Last address'), '2001:db8:abcd:ffff:ffff:ffff:ffff:ffff');
  assert.equal(field('2001:db8::/48', '/64 subnets'), (65536).toLocaleString('en-US'));
  assert.equal(field('2001:db8::1/128', '/64 subnets'), '—');
});

test('IPv6 scopes are classified', () => {
  const cases = [
    ['::1', 'Loopback'],
    ['::', 'Unspecified'],
    ['fe80::1', 'Link-local'],
    ['fd12:3456::1', 'Unique local'],
    ['2001:db8::1', 'Documentation'],
    ['2606:4700::1111', 'Global unicast'],
    ['ff02::1', 'Multicast'],
  ];
  for (const [address, scope] of cases) assert.equal(field(address, 'Scope'), scope, address);
});

test('IPv6 reverse DNS is nibble-reversed', () => {
  assert.equal(
    field('::1', 'Reverse DNS'),
    '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.ip6.arpa',
  );
});

test('malformed input is rejected', () => {
  const bad = [
    '', '999.1.1.1', '1.2.3', '1.2.3.4.5', 'hello', '10.0.0.1/33',
    '2001:db8:::1', '2001:db8::1/129', '1.2.3.4 255.255.0.255', 'gggg::1',
    '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9',
  ];
  for (const input of bad) assert.throws(() => describeAddress(input), Error, `"${input}" should be rejected`);
});

test('splitting an IPv4 network', () => {
  const { total, subnets } = splitSubnets('192.168.0.0/24', 26);
  assert.equal(total, 4);
  assert.equal(subnets.length, 4);
  assert.equal(subnets[0].network, '192.168.0.0/26');
  assert.equal(subnets[3].network, '192.168.0.192/26');
  assert.equal(subnets[3].range, '192.168.0.193 – 192.168.0.254');
});

test('splitting an IPv6 network', () => {
  const { total, subnets } = splitSubnets('2001:db8::/48', 50);
  assert.equal(total, 4);
  assert.equal(subnets[0].network, '2001:db8::/50');
  assert.equal(subnets[2].network, '2001:db8:0:8000::/50');
});

test('splitting caps the rows it returns but reports the true total', () => {
  const { total, subnets } = splitSubnets('10.0.0.0/8', 24, 10);
  assert.equal(total, 65536);
  assert.equal(subnets.length, 10, 'only the requested number of rows come back');
});

test('a split into a larger block is rejected', () => {
  assert.throws(() => splitSubnets('192.168.0.0/24', 16), /larger than the network/);
  assert.throws(() => splitSubnets('192.168.0.0/24', 33), /cannot exceed/);
});
