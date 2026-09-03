import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { openRecipesDocument } from '../../lib/recipe/openrecipes';

export const getStaticPaths: GetStaticPaths = async () => {
  const recipes = await getCollection('recipes', ({ data }) => !data.draft);
  return recipes.map((recipe) => ({ params: { slug: recipe.id }, props: { recipe } }));
};

export const GET: APIRoute = ({ props }) => {
  const { recipe } = props as { recipe: { id: string; data: Parameters<typeof openRecipesDocument>[0] } };

  return new Response(openRecipesDocument(recipe.data), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${recipe.id}.openrecipes"`,
    },
  });
};
