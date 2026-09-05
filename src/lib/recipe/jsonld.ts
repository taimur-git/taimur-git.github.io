/* schema.org Recipe. This is the export that actually matters: it is what
   Paprika, Mealie, Tandoor, AnyList and Google's rich results all read.
   Astro is output:'static', so it ships server-rendered by construction. */

import type { Recipe } from './schema';
import { flattenOps } from './graph';
import type { FlatStep } from './graph';
import { isoDuration, renderIngredient } from './format';

/* only the diet tags with a schema.org RestrictedDiet equivalent */
const DIET_URL: Record<string, string> = {
  vegetarian: 'https://schema.org/VegetarianDiet',
  vegan: 'https://schema.org/VeganDiet',
  'gluten-free': 'https://schema.org/GlutenFreeDiet',
  'dairy-free': 'https://schema.org/LowLactoseDiet',
  'low-salt': 'https://schema.org/LowSaltDiet',
  'low-calorie': 'https://schema.org/LowCalorieDiet',
};

/* schema.org sodiumContent is sodium, but every recipe here declares salt,
   which is what a nutrition label in this part of the world prints. NaCl is
   39.34% sodium by mass, so salt / 2.5. Without this an importing app reads
   2.5x the sodium that is actually in the dish. */
export function sodiumFromSalt(salt: number): number {
  return Math.round((salt / 2.5) * 100) / 100;
}

/** The components an importing app should treat as the recipe. Optional ones
    are alternate paths, so including them would double the shopping list and
    read as extra steps rather than a substitution. */
export function exportedComponents(recipe: Recipe) {
  return recipe.components.filter((c) => !c.optional);
}

/** Ingredient lines, component headings deliberately omitted: a heading in
    recipeIngredient arrives in the importing app as food. */
export function ingredientLines(recipe: Recipe): string[] {
  return exportedComponents(recipe).flatMap((c) => c.ingredients.map((i) => renderIngredient(i)));
}

/** One step as plain text, for every export. The ingredients lead: an
    importing app renders directions as prose with no graph to read them
    against, and "mix" on its own instructs nobody. Amounts are included
    because a split ingredient is two authored lines that only the amount
    tells apart — see FlatStep. */
export function stepText(step: FlatStep): string {
  const ingredients = step.ingredients.map((i) => renderIngredient(i)).join('; ');
  const listed = step.list ? step.list.join('; ') : '';
  return [ingredients, listed, step.text].filter(Boolean).join('. ');
}

/** Steps in method order, tagged with the component they belong to. */
export function instructionSteps(recipe: Recipe): { name?: string; text: string }[] {
  return exportedComponents(recipe).flatMap((c) =>
    flattenOps(c).map((step, i) => {
      const text = stepText(step);
      return i === 0 ? { name: c.name, text } : { text };
    }),
  );
}

export function nutritionLines(recipe: Recipe): string[] {
  const n = recipe.nutrition;
  if (!n) return [];
  return [
    n.calories !== undefined && `Calories: ${n.calories} kcal`,
    n.fat !== undefined && `Fat: ${n.fat} g`,
    n.carbs !== undefined && `Carbohydrate: ${n.carbs} g`,
    n.protein !== undefined && `Protein: ${n.protein} g`,
    n.salt !== undefined && `Salt: ${n.salt} g`,
    `Basis: ${n.basis}`,
  ].filter(Boolean) as string[];
}

export function recipeJsonLd(recipe: Recipe, url: URL, author: string) {
  const total = recipe.prep + recipe.cook;

  const diets = recipe.diet.map((d) => DIET_URL[d]).filter(Boolean);

  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    description: recipe.summary,
    author: { '@type': 'Person', name: author },
    datePublished: recipe.date.toISOString().slice(0, 10),
    ...(recipe.image ? { image: [new URL(recipe.image, url).href] } : {}),
    prepTime: isoDuration(recipe.prep),
    cookTime: isoDuration(recipe.cook),
    totalTime: isoDuration(total),
    recipeYield: recipe.yield,
    ...(recipe.category ? { recipeCategory: recipe.category } : {}),
    ...(recipe.cuisine ? { recipeCuisine: recipe.cuisine } : {}),
    ...(diets.length ? { suitableForDiet: diets } : {}),
    keywords: [...recipe.tags, ...recipe.allergens.map((a) => `contains ${a}`)].join(', '),
    recipeIngredient: ingredientLines(recipe),
    recipeInstructions: instructionSteps(recipe).map((step) => ({
      '@type': 'HowToStep',
      ...(step.name ? { name: step.name } : {}),
      text: step.text,
    })),
    ...(recipe.nutrition
      ? {
          nutrition: {
            '@type': 'NutritionInformation',
            ...(recipe.nutrition.calories !== undefined
              ? { calories: `${recipe.nutrition.calories} calories` }
              : {}),
            ...(recipe.nutrition.fat !== undefined
              ? { fatContent: `${recipe.nutrition.fat} g` }
              : {}),
            ...(recipe.nutrition.carbs !== undefined
              ? { carbohydrateContent: `${recipe.nutrition.carbs} g` }
              : {}),
            ...(recipe.nutrition.protein !== undefined
              ? { proteinContent: `${recipe.nutrition.protein} g` }
              : {}),
            ...(recipe.nutrition.salt !== undefined
              ? { sodiumContent: `${sodiumFromSalt(recipe.nutrition.salt)} g` }
              : {}),
            servingSize: recipe.nutrition.basis,
          },
        }
      : {}),
    url: url.href,
  };
}
