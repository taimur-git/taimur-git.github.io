import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { paprikaArchive } from '../../lib/recipe/paprika';

export const getStaticPaths: GetStaticPaths = async () => {
  const recipes = await getCollection('recipes', ({ data }) => !data.draft);
  return recipes.map((recipe) => ({ params: { slug: recipe.id }, props: { recipe } }));
};

export const GET: APIRoute = ({ props, site }) => {
  const { recipe } = props as { recipe: { id: string; data: Parameters<typeof paprikaArchive>[0] } };
  const url = new URL(`/recipes/${recipe.id}`, site);
  const body = paprikaArchive(recipe.data, recipe.id, url);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${recipe.id}.paprikarecipes"`,
    },
  });
};
