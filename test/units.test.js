import test from 'node:test';
import assert from 'node:assert/strict';
import { unitCategories, unitsIn, convertAll, formatQuantity } from '../src/units.js';

/** Convert between two units of a category and return the raw number. */
const convert = (category, value, from, to) => {
  const hit = convertAll(category, value, from).find((result) => result.unit.symbol === to);
  assert.ok(hit, `no "${to}" in ${category}`);
  return hit.value;
};

const close = (actual, expected, places = 6) => {
  assert.equal(Number(actual.toFixed(places)), Number(expected.toFixed(places)));
};

test('every category has units with unique symbols', () => {
  assert.ok(unitCategories.length >= 10);
  for (const category of unitCategories) {
    const units = unitsIn(category);
    assert.ok(units.length >= 4, `${category} needs several units`);
    const symbols = units.map((unit) => unit.symbol);
    assert.equal(new Set(symbols).size, symbols.length, `${category} has duplicate symbols`);
    for (const unit of units) {
      assert.ok(unit.name, 'every unit needs a name');
      assert.ok(unit.factor !== undefined || (unit.toBase && unit.fromBase), `${unit.symbol} needs a scale`);
    }
  }
});

test('converting to the same unit is the identity', () => {
  for (const category of unitCategories) {
    for (const unit of unitsIn(category)) {
      close(convert(category, 7.5, unit.symbol, unit.symbol), 7.5, 9);
    }
  }
});

test('conversion round-trips through every other unit', () => {
  for (const category of unitCategories) {
    const units = unitsIn(category);
    for (const from of units) {
      for (const to of units) {
        const forward = convert(category, 12, from.symbol, to.symbol);
        const back = convert(category, forward, to.symbol, from.symbol);
        assert.ok(Math.abs(back - 12) < 1e-6, `${category}: 12 ${from.symbol} -> ${to.symbol} -> ${back}`);
      }
    }
  }
});

test('temperature scales handle their offsets', () => {
  close(convert('Temperature', 100, '°C', '°F'), 212);
  close(convert('Temperature', 0, '°C', '°F'), 32);
  close(convert('Temperature', -40, '°C', '°F'), -40, 9);
  close(convert('Temperature', 0, '°C', 'K'), 273.15);
  close(convert('Temperature', -273.15, '°C', 'K'), 0, 9);
  close(convert('Temperature', 0, 'K', '°R'), 0, 9);
  close(convert('Temperature', 100, '°C', '°R'), 671.67, 2);
});

test('length, mass and speed match their defined ratios', () => {
  close(convert('Length', 1, 'mi', 'km'), 1.609344);
  close(convert('Length', 1, 'in', 'cm'), 2.54);
  close(convert('Length', 1, 'nmi', 'm'), 1852, 9);
  close(convert('Mass', 1, 'kg', 'lb'), 2.204623, 6);
  close(convert('Mass', 1, 'st', 'lb'), 14, 5);
  close(convert('Speed', 60, 'mph', 'km/h'), 96.5606, 4);
  close(convert('Speed', 1, 'kn', 'km/h'), 1.852, 6);
});

test('decimal and binary data units stay distinct', () => {
  assert.equal(convert('Data', 1, 'GB', 'MB'), 1000);
  assert.equal(convert('Data', 1, 'GiB', 'MiB'), 1024);
  assert.equal(convert('Data', 1, 'B', 'bit'), 8);
  assert.equal(convert('Data', 1, 'TiB', 'GiB'), 1024);
});

test('time, angle, pressure and energy', () => {
  assert.equal(convert('Time', 1, 'd', 'h'), 24);
  assert.equal(convert('Time', 1, 'wk', 'd'), 7);
  close(convert('Angle', 180, '°', 'rad'), Math.PI);
  close(convert('Angle', 1, 'turn', '°'), 360, 9);
  close(convert('Pressure', 1, 'atm', 'psi'), 14.6959, 4);
  close(convert('Pressure', 1, 'bar', 'kPa'), 100, 9);
  assert.equal(convert('Energy', 1, 'kWh', 'J'), 3600000);
  close(convert('Energy', 1, 'kcal', 'cal'), 1000, 6);
});

test('an unknown unit is rejected', () => {
  assert.throws(() => convertAll('Length', 1, 'furlong'), /Unknown unit/);
});

test('quantities format readably across magnitudes', () => {
  assert.equal(formatQuantity(0), '0');
  assert.equal(formatQuantity(0.000000123), '1.23e-7');
  assert.equal(formatQuantity(NaN), '—');
  assert.equal(formatQuantity(Infinity), '—');
  assert.match(formatQuantity(1e20), /e\+?20/);
  assert.ok(!formatQuantity(0.1 + 0.2).includes('0000'), 'float noise must not leak through');
});
