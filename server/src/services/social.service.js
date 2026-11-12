import { z } from 'zod';
import { mediaRepository } from '../repositories/media.repository.js';
import { socialRepository } from '../repositories/social.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { avatarUrl } from '../utils/userView.js';
import { ranksForUsers } from './profile.service.js';

const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Комментарий пустой')
    .max(2000, 'Комментарий — до 2000 символов'),
  parentId: z.string().uuid().nullable().optional(),
});

const ratingSchema = z.object({
  stars: z.number().int().min(1, 'Оценка от 1 до 5').max(5, 'Оценка от 1 до 5'),
});

// Simple flood guard: one comment per user per few seconds
const COMMENT_COOLDOWN_MS = 5000;
const lastCommentAt = new Map();

async function requirePublished(mediaId) {
  const media = await mediaRepository.findById(mediaId);
  if (!media || media.status !== 'published') {
    throw createHttpError(404, 'NOT_FOUND', 'Фильм не найден');
  }
  return media;
}

async function withAuthorRanks(comments) {
  const ids = [...new Set(comments.filter((c) => c.author).map((c) => c.author.id))];
  const ranks = await ranksForUsers(ids);
  return comments.map((c) => {
    if (!c.author) return c;
    const { avatarPath, ...author } = c.author;
    const rank = ranks.get(author.id)?.rank;
    return {
      ...c,
      author: {
        ...author,
        displayName: author.displayName || author.username,
        avatarUrl: avatarUrl(avatarPath),
        rankTitle: rank?.title || null,
        rankLevel: rank?.level || 1,
      },
    };
  });
}

function canModify(comment, viewer) {
  return comment.userId === viewer.id || viewer.role === 'admin';
}

export const socialService = {
  async summary(mediaId, userId) {
    await requirePublished(mediaId);
    const [rating, favorite] = await Promise.all([
      socialRepository.ratingSummary(mediaId, userId),
      socialRepository.favoriteSummary(mediaId, userId),
    ]);
    return { rating, favorite };
  },

  async rate(mediaId, userId, body) {
    await requirePublished(mediaId);
    const parsed = ratingSchema.safeParse({ stars: Number(body?.stars) });
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    await socialRepository.setRating(userId, mediaId, parsed.data.stars);
    return socialRepository.ratingSummary(mediaId, userId);
  },

  async unrate(mediaId, userId) {
    await requirePublished(mediaId);
    await socialRepository.removeRating(userId, mediaId);
    return socialRepository.ratingSummary(mediaId, userId);
  },

  async setFavorite(mediaId, userId, on) {
    await requirePublished(mediaId);
    await socialRepository.setFavorite(userId, mediaId, on);
    return socialRepository.favoriteSummary(mediaId, userId);
  },

  async listComments(mediaId, viewer) {
    await requirePublished(mediaId);
    const comments = await withAuthorRanks(await socialRepository.listComments(mediaId));
    return comments.map((c) => ({
      ...c,
      canEdit: Boolean(c.author) && c.author.id === viewer.id,
      canDelete: Boolean(c.author) && (c.author.id === viewer.id || viewer.role === 'admin'),
    }));
  },

  async addComment(mediaId, viewer, body) {
    await requirePublished(mediaId);
    const parsed = commentSchema.safeParse(body || {});
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const last = lastCommentAt.get(viewer.id) || 0;
    if (Date.now() - last < COMMENT_COOLDOWN_MS) {
      throw createHttpError(429, 'TOO_FAST', 'Не так быстро — подождите пару секунд');
    }

    const { parentId } = parsed.data;
    if (parentId) {
      const parent = await socialRepository.findComment(parentId);
      if (!parent || parent.mediaId !== mediaId) {
        throw createHttpError(404, 'NOT_FOUND', 'Комментарий для ответа не найден');
      }
      if (parent.deleted) {
        throw createHttpError(400, 'VALIDATION_ERROR', 'Нельзя ответить на удалённый комментарий');
      }
    }

    const created = await socialRepository.createComment({
      mediaId,
      userId: viewer.id,
      parentId,
      body: parsed.data.body,
    });
    lastCommentAt.set(viewer.id, Date.now());
    const [withRank] = await withAuthorRanks([created]);
    return { ...withRank, canEdit: true, canDelete: true };
  },

  async editComment(commentId, viewer, body) {
    const comment = await socialRepository.findComment(commentId);
    if (!comment || comment.deleted) throw createHttpError(404, 'NOT_FOUND', 'Комментарий не найден');
    if (comment.userId !== viewer.id) {
      throw createHttpError(403, 'FORBIDDEN', 'Редактировать можно только свои комментарии');
    }
    const parsed = commentSchema.pick({ body: true }).safeParse(body || {});
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const updated = await socialRepository.updateComment(commentId, parsed.data.body);
    const [withRank] = await withAuthorRanks([updated]);
    return { ...withRank, canEdit: true, canDelete: true };
  },

  async deleteComment(commentId, viewer) {
    const comment = await socialRepository.findComment(commentId);
    if (!comment || comment.deleted) throw createHttpError(404, 'NOT_FOUND', 'Комментарий не найден');
    if (!canModify(comment, viewer)) {
      throw createHttpError(403, 'FORBIDDEN', 'Удалять можно только свои комментарии');
    }
    await socialRepository.deleteComment(commentId);
    return { ok: true };
  },
};
