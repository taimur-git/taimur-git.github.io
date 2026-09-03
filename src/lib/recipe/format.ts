/* Quantity and duration rendering. Imported by both server-rendered .astro
   frontmatter and the client scaling script, so scaled amounts format
   identically to the ones built at compile time. */

export const UNITS = [
  'g', 'kg', 'ml', 'l',
  'tsp', 'tbsp', 'cup',
  'piece', 'clove', 'slice', 'pinch', 'handful', 'packet', 'tin',
  'leaf', 'sprig', 'bunch',
] as const;

export type Unit = (typeof UNITS)[number];

/* metric units sit flush against the number: 560g, 1.5L */
const TIGHT = new Set<string>(['g', 'kg', 'ml', 'l']);
const LABEL: Record<string, string> = { l: 'L' };
const PLURAL: Record<string, string> = {
  cup: 'cups', clove: 'cloves', slice: 'slices', pinch: 'pinches',
  handful: 'handfuls', packet: 'packets', tin: 'tins',
  leaf: 'leaves', sprig: 'sprigs', bunch: 'bunches',
};

const FRACS: [number, string][] = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

/** 1.5 → "1½", 0.667 → "⅔". For spoons, cups and countable things. */
export function formatFraction(n: number): string {
  const whole = Math.floor(n);
  const frac = n - whole;
  for (const [val, ch] of FRACS) {
    if (Math.abs(frac - val) < 0.04) return whole > 0 ? `${whole}${ch}` : ch;
  }
  if (frac < 0.04) return String(whole);
  if (n >= 10) return String(Math.round(n));
  return String(Math.round(n * 100) / 100);
}

/** 1.5 → "1.5", 560 → "560". For grams and millilitres. */
export function formatDecimal(n: number): string {
  const rounded = n >= 10 ? Math.round(n) : Math.round(n * 100) / 100;
  return String(rounded);
}

/** "560g", "2 tbsp", "4 cloves", "½" (piece renders bare). */
export function renderQty(qty?: number, unit?: string): string {
  if (qty === undefined) return '';
  const tight = unit !== undefined && TIGHT.has(unit);
  const num = tight ? formatDecimal(qty) : formatFraction(qty);
  if (unit === undefined || unit === 'piece') return num;
  if (tight) return `${num}${LABEL[unit] ?? unit}`;
  const word = qty > 1 && PLURAL[unit] ? PLURAL[unit] : unit;
  return `${num} ${word}`;
}

/** 75 → "1 hr 15 min". Display and Paprika. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** 75 → "PT1H15M". schema.org requires ISO 8601, never free text. */
export function isoDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h > 0 ? `${h}H` : ''}${m > 0 || h === 0 ? `${m}M` : ''}`;
}

/** Full ingredient line: "560g beef mince, 20-25% fat". */
export function renderIngredient(
  ing: { qty?: number; unit?: string; name: string; note?: string },
  factor = 1,
): string {
  const amount = renderQty(ing.qty === undefined ? undefined : ing.qty * factor, ing.unit);
  const head = amount ? `${amount} ${ing.name}` : ing.name;
  return ing.note ? `${head}, ${ing.note}` : head;
}
