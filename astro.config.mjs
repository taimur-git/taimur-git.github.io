import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://taimur-git.github.io',
  integrations: [mdx(), sitemap()],
  output: 'static',
});
