import { z } from 'astro/zod';
import { UNITS } from './format';

export const ALLERGENS = [
  'gluten', 'dairy', 'egg', 'fish', 'shellfish', 'molluscs', 'soy',
  'peanut', 'treenut', 'sesame', 'mustard', 'sulphites', 'celery', 'lupin',
] as const;

/* Positive claims about the finished dish. Manual, like allergens:
   the absence of a declared allergen is not a claim of freedom from it. */
export const DIETS = [
  'vegetarian', 'vegan', 'pescatarian',
  'gluten-free', 'dairy-free', 'low-salt', 'low-calorie',
] as const;

export const HEAT = ['none', 'mild', 'medium', 'hot'] as const;

const ingredient = z.object({
  id: z.string(),
  qty: z.number().optional(),
  unit: z.enum(UNITS).optional(),
  name: z.string(),
  /* trailing qualifier: "20-25% fat", "or regular". Never scaled. */
  note: z.string().optional(),
  optional: z.boolean().default(false),
  /* this line is the output of another component on the same page */
  ref: z.string().optional(),
});

const op = z.object({
  id: z.string(),
  /* ingredient ids and other op ids. Order decides row order. */
  in: z.array(z.string()).min(1),
  /* newlines are line breaks in the cell; **text** renders bold */
  do: z.string().optional(),
  /* ordered list instead of do: the build column */
  list: z.array(z.string()).optional(),
  /* render as the emphasised end-of-flow cell */
  final: z.boolean().default(false),
});

const nutrition = z.object({
  basis: z.string(),
  calories: z.number().optional(),
  fat: z.number().optional(),
  carbs: z.number().optional(),
  protein: z.number().optional(),
  salt: z.number().optional(),
});

const component = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().optional(),
  /* an alternate path, not a part of the dish: rendered dimmed and tagged,
     and left out of every export so it cannot double the shopping list */
  optional: z.boolean().default(false),
  /* only for a component that changes the finished dish enough that the
     recipe-level figures no longer describe it. Display only — the exports
     carry one nutrition block and it is the recipe's */
  nutrition: nutrition.optional(),
  ingredients: z.array(ingredient).min(1),
  ops: z.array(op).min(1),
  /* id of the op every other node feeds into */
  root: z.string(),
});

export const recipeSchema = z.object({
  title: z.string(),
  date: z.date(),
  summary: z.string(),
  tags: z.array(z.string()),
  draft: z.boolean().default(false),

  cuisine: z.string().optional(),
  category: z.string().optional(),

  yield: z.string(),
  servings: z.number().int().positive(),
  prep: z.number().int().nonnegative(),
  cook: z.number().int().nonnegative(),

  image: z.string().optional(),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  diet: z.array(z.enum(DIETS)).default([]),
  heat: z.enum(HEAT).default('none'),

  nutrition: nutrition.optional(),

  sources: z.array(z.object({
    name: z.string(),
    url: z.string().url().optional(),
  })).default([]),

  components: z.array(component).min(1),
});

export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeComponent = z.infer<typeof component>;
export type RecipeIngredient = z.infer<typeof ingredient>;
export type RecipeOp = z.infer<typeof op>;
