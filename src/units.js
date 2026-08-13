// Unit conversion tables. Every unit declares how many base units it is worth,
// so a conversion is just `value * from.factor / to.factor`. Scales that don't
// pass through zero (the temperatures) give explicit to/from functions instead.

const linear = (symbol, name, factor) => ({ symbol, name, factor });

const CATEGORIES = [
  {
    name: 'Length',
    units: [
      linear('nm', 'Nanometre', 1e-9), linear('µm', 'Micrometre', 1e-6), linear('mm', 'Millimetre', 1e-3),
      linear('cm', 'Centimetre', 1e-2), linear('m', 'Metre', 1), linear('km', 'Kilometre', 1e3),
      linear('in', 'Inch', 0.0254), linear('ft', 'Foot', 0.3048), linear('yd', 'Yard', 0.9144),
      linear('mi', 'Mile', 1609.344), linear('nmi', 'Nautical mile', 1852),
    ],
  },
  {
    name: 'Mass',
    units: [
      linear('mg', 'Milligram', 1e-6), linear('g', 'Gram', 1e-3), linear('kg', 'Kilogram', 1),
      linear('t', 'Tonne', 1e3), linear('oz', 'Ounce', 0.028349523125), linear('lb', 'Pound', 0.45359237),
      linear('st', 'Stone', 6.35029318), linear('ton', 'US ton', 907.18474),
    ],
  },
  {
    name: 'Temperature',
    units: [
      { symbol: '°C', name: 'Celsius', toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
      { symbol: '°F', name: 'Fahrenheit', toBase: (v) => (v + 459.67) * (5 / 9), fromBase: (v) => v * (9 / 5) - 459.67 },
      { symbol: 'K', name: 'Kelvin', factor: 1 },
      { symbol: '°R', name: 'Rankine', factor: 5 / 9 },
    ],
  },
  {
    name: 'Area',
    units: [
      linear('mm²', 'Square millimetre', 1e-6), linear('cm²', 'Square centimetre', 1e-4),
      linear('m²', 'Square metre', 1), linear('ha', 'Hectare', 1e4), linear('km²', 'Square kilometre', 1e6),
      linear('in²', 'Square inch', 0.00064516), linear('ft²', 'Square foot', 0.09290304),
      linear('ac', 'Acre', 4046.8564224), linear('mi²', 'Square mile', 2589988.110336),
    ],
  },
  {
    name: 'Volume',
    units: [
      linear('ml', 'Millilitre', 1e-3), linear('l', 'Litre', 1), linear('m³', 'Cubic metre', 1e3),
      linear('tsp', 'US teaspoon', 0.00492892159375), linear('tbsp', 'US tablespoon', 0.01478676478125),
      linear('fl oz', 'US fluid ounce', 0.0295735295625), linear('cup', 'US cup', 0.2365882365),
      linear('pt', 'US pint', 0.473176473), linear('qt', 'US quart', 0.946352946),
      linear('gal', 'US gallon', 3.785411784), linear('imp gal', 'Imperial gallon', 4.54609),
    ],
  },
  {
    name: 'Speed',
    units: [
      linear('m/s', 'Metres per second', 1), linear('km/h', 'Kilometres per hour', 1 / 3.6),
      linear('mph', 'Miles per hour', 0.44704), linear('kn', 'Knot', 0.514444444444),
      linear('ft/s', 'Feet per second', 0.3048), linear('c', 'Speed of light', 299792458),
    ],
  },
  {
    name: 'Time',
    units: [
      linear('ns', 'Nanosecond', 1e-9), linear('µs', 'Microsecond', 1e-6), linear('ms', 'Millisecond', 1e-3),
      linear('s', 'Second', 1), linear('min', 'Minute', 60), linear('h', 'Hour', 3600),
      linear('d', 'Day', 86400), linear('wk', 'Week', 604800), linear('yr', 'Julian year', 31557600),
    ],
  },
  {
    name: 'Data',
    units: [
      linear('bit', 'Bit', 1 / 8), linear('B', 'Byte', 1), linear('KB', 'Kilobyte (1000)', 1e3),
      linear('KiB', 'Kibibyte (1024)', 1024), linear('MB', 'Megabyte', 1e6), linear('MiB', 'Mebibyte', 1024 ** 2),
      linear('GB', 'Gigabyte', 1e9), linear('GiB', 'Gibibyte', 1024 ** 3),
      linear('TB', 'Terabyte', 1e12), linear('TiB', 'Tebibyte', 1024 ** 4),
    ],
  },
  {
    name: 'Pressure',
    units: [
      linear('Pa', 'Pascal', 1), linear('hPa', 'Hectopascal', 100), linear('kPa', 'Kilopascal', 1e3),
      linear('bar', 'Bar', 1e5), linear('atm', 'Atmosphere', 101325),
      linear('psi', 'Pound per square inch', 6894.757293168), linear('mmHg', 'Millimetre of mercury', 133.322387415),
    ],
  },
  {
    name: 'Energy',
    units: [
      linear('J', 'Joule', 1), linear('kJ', 'Kilojoule', 1e3), linear('cal', 'Calorie', 4.184),
      linear('kcal', 'Kilocalorie', 4184), linear('Wh', 'Watt hour', 3600), linear('kWh', 'Kilowatt hour', 3.6e6),
      linear('BTU', 'British thermal unit', 1055.05585262), linear('eV', 'Electronvolt', 1.602176634e-19),
    ],
  },
  {
    name: 'Power',
    units: [
      linear('mW', 'Milliwatt', 1e-3), linear('W', 'Watt', 1), linear('kW', 'Kilowatt', 1e3),
      linear('MW', 'Megawatt', 1e6), linear('hp', 'Horsepower (mechanical)', 745.6998715823),
      linear('PS', 'Metric horsepower', 735.49875),
    ],
  },
  {
    name: 'Angle',
    units: [
      linear('°', 'Degree', 1), linear('rad', 'Radian', 180 / Math.PI), linear('grad', 'Gradian', 0.9),
      linear('′', 'Arcminute', 1 / 60), linear('″', 'Arcsecond', 1 / 3600), linear('turn', 'Turn', 360),
    ],
  },
];

export const unitCategories = CATEGORIES.map((category) => category.name);

export const unitsIn = (categoryName) => CATEGORIES.find((c) => c.name === categoryName)?.units ?? [];

const toBase = (unit, value) => (unit.toBase ? unit.toBase(value) : value * unit.factor);
const fromBase = (unit, value) => (unit.fromBase ? unit.fromBase(value) : value / unit.factor);

/**
 * Convert one value into every unit of its category at once.
 *
 * @param {string} categoryName
 * @param {number} value
 * @param {string} fromSymbol
 * @returns {Array<{unit:Object, value:number}>}
 */
export function convertAll(categoryName, value, fromSymbol) {
  const units = unitsIn(categoryName);
  const source = units.find((unit) => unit.symbol === fromSymbol);
  if (!source) throw new Error(`Unknown unit "${fromSymbol}".`);
  const base = toBase(source, value);
  return units.map((unit) => ({ unit, value: fromBase(unit, base) }));
}

/**
 * Format a converted number so both 0.000001 and 1e21 stay readable, without
 * the trailing float noise that plain `toString` leaves behind.
 */
export function formatQuantity(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e15 || magnitude < 1e-6) return value.toExponential(6).replace(/\.?0+e/, 'e');
  const decimals = Math.max(0, Math.min(10, 8 - Math.floor(Math.log10(magnitude))));
  return Number(value.toFixed(decimals)).toLocaleString(undefined, { maximumFractionDigits: 10 });
}
