import { z } from 'zod';
import { CEFR_LEVELS } from '../constants.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { LANGUAGE_CODES } from '../utils/languages.js';
import { findViewableMedia } from '../utils/mediaAccess.js';

const cefrEnum = z.enum(CEFR_LEVELS);

const mediaInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().default(''),
  synopsis: z.string().max(20000).optional().default(''),
  year: z.number().int().min(1888).max(2100).nullable().optional(),
  genres: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  themes: z.array(z.string().trim().min(1).max(40)).max(12).optional().default([]),
  language: z.enum(LANGUAGE_CODES, { message: 'Неизвестный язык фильма' }).optional().default('en'),
  recommendedLevel: cefrEnum.nullable().optional(),
  posterUrl: z
    .union([z.string().url(), z.string().regex(/^\/(uploads|posters)\//), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  externalWatchUrl: z
    .union([z.string().url(), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  // YouTube/Vimeo/https MP4 or local /uploads/videos/...
  videoUrl: z
    .union([
      z.string().url(),
      z.string().regex(/^\/uploads\//),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .transform((v) => (v ? v : null)),
  status: z.enum(['draft', 'published']).optional().default('draft'),
  countries: z.array(z.string().trim().min(1).max(60)).max(10).optional().default([]),
  director: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  runtimeMin: z.number().int().min(1).max(1000).nullable().optional(),
});

const mediaUpdateSchema = mediaInputSchema.partial();

const flag = z
  .enum(['1', '0', 'true', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');

const listQuerySchema = z.object({
  theme: z.string().trim().min(1).max(40).optional(),
  genre: z.string().trim().min(1).max(40).optional(),
  country: z.string().trim().min(1).max(60).optional(),
  level: cefrEnum.optional(),
  language: z.enum(LANGUAGE_CODES).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  yearFrom: z.coerce.number().int().min(1888).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1888).max(2100).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  hasVideo: flag,
  hasQuiz: flag,
  sort: z.enum(['title', 'year_desc', 'year_asc', 'rating', 'popular', 'new', 'runtime']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(12),
  status: z.enum(['draft', 'published']).optional(),
});

export const mediaService = {
  async listForLearner(query) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid query');
    }
    const { status, ...filters } = parsed.data;
    return mediaRepository.listPublished(filters);
  },

  filterOptions() {
    return mediaRepository.filterOptions();
  },

  getViewableById(id, user) {
    return findViewableMedia(id, user);
  },

  async listForAdmin(query) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid query');
    }
    const { status, page, limit } = parsed.data;
    return mediaRepository.listAll({ status, page, limit });
  },

  async getForAdmin(id) {
    const item = await mediaRepository.findById(id);
    if (!item) {
      throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    }
    return item;
  },

  async create(input) {
    const parsed = mediaInputSchema.safeParse(input);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }
    return mediaRepository.create(parsed.data);
  },

  async update(id, input) {
    const parsed = mediaUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }
    const updated = await mediaRepository.update(id, parsed.data);
    if (!updated) {
      throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    }
    return updated;
  },

  async remove(id) {
    const ok = await mediaRepository.remove(id);
    if (!ok) {
      throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    }
  },
};
