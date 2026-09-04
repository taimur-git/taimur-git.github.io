/* .paprikarecipes writer.

   The container is compressed twice: a ZIP holding one gzipped JSON document
   per recipe. Order matters: gzip first, then zip. Reversed, Paprika rejects
   the file without saying why.

   Because the entry is already gzipped there is nothing to gain from deflating
   it again, so the ZIP layer uses the STORE method and needs no library. */

import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import type { Recipe } from './schema';
import { flattenOps } from './graph';
import { exportedComponents } from './jsonld';
import { formatDuration, renderIngredient } from './format';
import { nutritionLines } from './jsonld';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Single-entry ZIP, STORE method, UTF-8 filename flag set. */
function zipStore(name: string, data: Uint8Array): Buffer {
  const nameBytes = Buffer.from(name, 'utf-8');
  const crc = crc32(data);
  const flags = 0x0800; /* filename is UTF-8 */

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(0, 8); /* method: store */
  local.writeUInt16LE(0, 10); /* mod time */
  local.writeUInt16LE(0x21, 12); /* mod date: 1980-01-01, keeps builds reproducible */
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42); /* offset of the local header */

  const centralSize = central.length + nameBytes.length;
  const centralOffset = local.length + nameBytes.length + data.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([local, nameBytes, data, central, nameBytes, end]);
}

/** Deterministic per slug: a fresh uid on every build reads as a new recipe. */
function stableUid(slug: string): string {
  const h = createHash('sha256').update(`recipe:${slug}`).digest('hex').toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export function paprikaRecord(recipe: Recipe, slug: string, url: URL) {
  /* section headings are kept here, unlike in the JSON-LD: every sample export
     carries them and they read better in the app than a flat list does */
  const parts = exportedComponents(recipe);

  const ingredients = parts
    .flatMap((c) => [
      parts.length > 1 ? c.name : null,
      ...c.ingredients.map((i) => renderIngredient(i)),
    ])
    .filter(Boolean)
    .join('\n');

  const directions = parts
    .flatMap((c) => [
      parts.length > 1 ? `${c.name}:` : null,
      ...flattenOps(c).map((step) =>
        [step.list ? step.list.join('; ') : '', step.text].filter(Boolean).join('. '),
      ),
    ])
    .filter(Boolean)
    .join('\n\n');

  const record = {
    uid: stableUid(slug),
    created: `${recipe.date.toISOString().slice(0, 10)} 00:00:00`,
    hash: '',
    name: recipe.title,
    description: recipe.summary,
    ingredients,
    directions,
    notes: recipe.allergens.length ? `Contains: ${recipe.allergens.join(', ')}.` : '',
    nutritional_info: nutritionLines(recipe).join('\n'),
    prep_time: recipe.prep ? formatDuration(recipe.prep) : '',
    cook_time: recipe.cook ? formatDuration(recipe.cook) : '',
    total_time: formatDuration(recipe.prep + recipe.cook),
    difficulty: '',
    servings: recipe.yield,
    rating: 0,
    source: url.hostname,
    source_url: url.href,
    photo: null as string | null,
    photo_large: null,
    photo_hash: null as string | null,
    image_url: recipe.image ? new URL(recipe.image, url).href : '',
    categories: [] as string[],
    photos: [] as unknown[],
  };

  record.hash = createHash('sha256')
    .update(`${record.name}${record.ingredients}${record.directions}`)
    .digest('hex')
    .toUpperCase();

  return record;
}

export function paprikaArchive(recipe: Recipe, slug: string, url: URL): Buffer {
  const json = JSON.stringify(paprikaRecord(recipe, slug, url));
  const gz = gzipSync(Buffer.from(json, 'utf-8'));
  return zipStore(`${recipe.title}.paprikarecipe`, gz);
}
