/* Turns a component's ingredient/op declaration into the cell grid the
   engineer view renders. Replaces the hand-tuned rowspans in the sample.

   The shape is a tree: ingredients are leaves, ops are internal nodes, `root`
   is the top. A leaf occupies one row, so an op's rowspan is the number of
   leaves beneath it and its column is its longest path from a leaf. Every
   node then stretches right to just before its parent's column, which is what
   produces the colspans; whatever is left over is filled with blank cells. */

import type { RecipeComponent } from './schema';

export interface Cell {
  kind: 'ing' | 'op' | 'gap';
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
  /* kind 'ing': the parts are kept separate so the amount can carry
     data-qty and be rescaled in place, exactly like the prose list */
  id?: string;
  qty?: number;
  unit?: string;
  name?: string;
  note?: string;
  optional?: boolean;
  ref?: string;
  /* kind 'op' */
  lines?: string[];
  list?: string[];
  final?: boolean;
}

export interface Layout {
  width: number;
  rows: Cell[][];
}

function fail(component: string, message: string): never {
  throw new Error(`recipe component "${component}": ${message}`);
}

export function layoutComponent(c: RecipeComponent): Layout {
  const ingredients = new Map(c.ingredients.map((i) => [i.id, i]));
  const ops = new Map(c.ops.map((o) => [o.id, o]));

  for (const id of ingredients.keys()) {
    if (ops.has(id)) fail(c.id, `id "${id}" is used by both an ingredient and an op`);
  }
  if (!ops.has(c.root)) fail(c.id, `root "${c.root}" is not an op`);

  /* every node feeds exactly one consumer, except the root */
  const consumedBy = new Map<string, string>();
  for (const op of c.ops) {
    for (const input of op.in) {
      if (!ingredients.has(input) && !ops.has(input)) {
        fail(c.id, `op "${op.id}" takes "${input}", which is neither an ingredient nor an op`);
      }
      const already = consumedBy.get(input);
      if (already) {
        fail(
          c.id,
          `"${input}" is used by both "${already}" and "${op.id}". An output can only be ` +
            `consumed once. Promote it to its own component and reference it with "ref".`,
        );
      }
      consumedBy.set(input, op.id);
    }
  }

  for (const id of ingredients.keys()) {
    if (!consumedBy.has(id)) fail(c.id, `ingredient "${id}" is never used by an op`);
  }
  for (const id of ops.keys()) {
    if (id !== c.root && !consumedBy.has(id)) fail(c.id, `op "${id}" output is never used`);
  }
  if (consumedBy.has(c.root)) fail(c.id, `root "${c.root}" feeds another op`);

  /* depth-first walk from the root: leaf order, leaf counts, columns */
  const leafOrder: string[] = [];
  const leafCount = new Map<string, number>();
  const col = new Map<string, number>();
  const visiting = new Set<string>();

  function walk(id: string): number {
    if (ingredients.has(id)) {
      leafOrder.push(id);
      leafCount.set(id, 1);
      col.set(id, 0);
      return 1;
    }
    if (visiting.has(id)) fail(c.id, `cycle through "${id}"`);
    visiting.add(id);
    const op = ops.get(id)!;
    let leaves = 0;
    let deepest = 0;
    for (const input of op.in) {
      leaves += walk(input);
      deepest = Math.max(deepest, col.get(input)!);
    }
    visiting.delete(id);
    leafCount.set(id, leaves);
    col.set(id, deepest + 1);
    return leaves;
  }
  walk(c.root);

  /* rows are the ingredient list itself, so a subtree's leaves have to be
     contiguous, which they are only if the author wrote them in walk order */
  const authored = c.ingredients.map((i) => i.id);
  if (authored.join(' ') !== leafOrder.join(' ')) {
    fail(
      c.id,
      'ingredients are not in method order, so the table cannot be laid out. ' +
        `Reorder them to:\n  ${leafOrder.join('\n  ')}`,
    );
  }

  const height = leafOrder.length;
  const width = col.get(c.root)! + 1;
  const rowOf = new Map(leafOrder.map((id, i) => [id, i]));

  const firstRow = (id: string): number =>
    ingredients.has(id) ? rowOf.get(id)! : firstRow(ops.get(id)!.in[0]);

  const grid: (Cell | null)[][] = Array.from({ length: height }, () =>
    Array<Cell | null>(width).fill(null),
  );
  const cells: Cell[] = [];

  function place(cell: Cell) {
    cells.push(cell);
    for (let r = cell.row; r < cell.row + cell.rowspan; r++) {
      for (let x = cell.col; x < cell.col + cell.colspan; x++) grid[r][x] = cell;
    }
  }

  for (const ing of c.ingredients) {
    place({
      kind: 'ing',
      row: rowOf.get(ing.id)!,
      col: 0,
      rowspan: 1,
      colspan: 1,
      id: ing.id,
      qty: ing.qty,
      unit: ing.unit,
      name: ing.name,
      note: ing.note,
      optional: ing.optional,
      ref: ing.ref,
    });
  }

  for (const op of c.ops) {
    const own = col.get(op.id)!;
    const parent = consumedBy.get(op.id);
    place({
      kind: 'op',
      row: firstRow(op.id),
      col: own,
      rowspan: leafCount.get(op.id)!,
      colspan: (parent ? col.get(parent)! : width) - own,
      lines: op.do ? op.do.split('\n') : undefined,
      list: op.list,
      final: op.final,
    });
  }

  /* fill the remainder with blanks, merging right then down, so a run of
     ingredients feeding one distant op shares a single empty cell */
  for (let r = 0; r < height; r++) {
    for (let x = 0; x < width; x++) {
      if (grid[r][x]) continue;

      let colspan = 1;
      while (x + colspan < width && !grid[r][x + colspan]) colspan++;

      let rowspan = 1;
      while (r + rowspan < height) {
        const row = grid[r + rowspan];
        const sameRun =
          row.slice(x, x + colspan).every((cell) => !cell) &&
          (x + colspan === width || row[x + colspan] !== null);
        if (!sameRun) break;
        rowspan++;
      }

      place({ kind: 'gap', row: r, col: x, rowspan, colspan });
      x += colspan - 1;
    }
  }

  const rows: Cell[][] = Array.from({ length: height }, () => []);
  for (const cell of cells) rows[cell.row].push(cell);
  for (const row of rows) row.sort((a, b) => a.col - b.col);

  return { width, rows };
}

/* Ops in method order, for the prose view and every export. */
export function flattenOps(c: RecipeComponent): { text: string; list?: string[] }[] {
  const ops = new Map(c.ops.map((o) => [o.id, o]));
  const out: { text: string; list?: string[] }[] = [];
  const seen = new Set<string>();

  function walk(id: string) {
    const op = ops.get(id);
    if (!op || seen.has(id)) return;
    seen.add(id);
    for (const input of op.in) walk(input);
    out.push({
      text: (op.do ?? '').replace(/\n/g, ' ').replace(/\*\*/g, '').trim(),
      list: op.list,
    });
  }
  walk(c.root);
  return out.filter((step) => step.text || step.list);
}
