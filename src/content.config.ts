import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const cvCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/cv' }),
  schema: z.object({
    name: z.string(),
    title: z.string(),
    photo: z.string(),
    contact: z.object({
      email: z.string(),
      phone: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
      location: z.string(),
    }),
    summary: z.string(),
    expertise: z.array(z.string()),
    education: z.array(z.object({
      degree: z.string(),
      institution: z.string(),
      start: z.number(),
      end: z.number().optional(),
      notes: z.string().optional(),
    })),
    experience: z.array(z.object({
      role: z.string(),
      org: z.string(),
      start: z.number(),
      end: z.number().nullable(),
      bullets: z.array(z.string()).optional(),
    })),
    certifications: z.array(z.object({
      name: z.string(),
      issuer: z.string(),
      year: z.number(),
      badge: z.string().optional(),
      url: z.string().optional(),
    })),
    skills: z.object({
      languages: z.array(z.string()),
      tools: z.array(z.string()),
      concepts: z.array(z.string()),
    }),
    languages_spoken: z.array(z.object({
      lang: z.string(),
      level: z.string(),
    })),
  }),
});

const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    excerpt: z.string(),
    tags: z.array(z.string()),
    draft: z.boolean().default(false),
  }),
});

const researchCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/research' }),
  schema: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    venue: z.string(),
    year: z.number(),
    doi: z.string().optional(),
    abstract: z.string(),
    pdf: z.string().optional(),
    tags: z.array(z.string()),
  }),
});

const projectsCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    repo: z.string().optional(),
    demo: z.string().optional(),
    date: z.date(),
    featured: z.boolean().default(false),
  }),
});

export const collections = {
  cv: cvCollection,
  blog: blogCollection,
  research: researchCollection,
  projects: projectsCollection,
};
