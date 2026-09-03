/* .openrecipes writer: single-line XML, one recipe per file.

   Lossy on purpose. The format stores quantities as integers ×1000 against a
   fixed unit vocabulary, and these recipes are metric-first, so most lines fall
   back to count="0" with the rendered text in `article`. It is a courtesy
   export, not a faithful round trip. */

import type { Recipe } from './schema';
import { flattenOps } from './graph';
import { renderIngredient } from './format';

/* the vocabulary observed in the sample. Anything absent has no representation. */
const UNIT_MAP: Record<string, string> = {
  tsp: 'Teaspoon',
  tbsp: 'Tbspoon',
  cup: 'Cup',
  piece: 'Piece',
  clove: 'Piece',
  slice: 'Piece',
  leaf: 'Piece',
};

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    /* literal newlines in an attribute are destroyed by attribute-value
       normalisation in any conforming parser (XML 1.0 §3.3.3) */
    .replace(/\n/g, '&#10;');
}

export function openRecipesDocument(recipe: Recipe): string {
  const ingredients: string[] = [];

  recipe.components.forEach((component, index) => {
    if (index > 0) {
      ingredients.push('<ingredient count="0" unit="--" article="--" />');
    }
    for (const item of component.ingredients) {
      const unit = item.unit ? UNIT_MAP[item.unit] : undefined;
      if (unit && item.qty !== undefined) {
        const count = Math.round(item.qty * 1000);
        const article = item.note ? `${item.name}, ${item.note}` : item.name;
        ingredients.push(
          `<ingredient count="${count}" unit="${unit}" article="${escapeAttr(article)}" />`,
        );
      } else {
        /* no mappable unit: dump the whole rendered line into article */
        ingredients.push(
          `<ingredient count="0" unit="--" article="${escapeAttr(renderIngredient(item))}" />`,
        );
      }
    }
  });

  const instruction = recipe.components
    .flatMap((component) => [
      recipe.components.length > 1 ? `${component.name}:` : null,
      ...flattenOps(component).map((step) =>
        [step.list ? step.list.join('; ') : '', step.text].filter(Boolean).join('. '),
      ),
    ])
    .filter(Boolean)
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8" ?>' +
    `<recipe name="${escapeAttr(recipe.title)}" image="" portions="${recipe.servings}" ` +
    `instruction="${escapeAttr(instruction)}">` +
    ingredients.join('') +
    '</recipe>'
  );
}
