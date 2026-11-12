import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { CEFR_LEVELS } from '../constants.js';
import { usersRepository, USERNAME_RE } from '../repositories/users.repository.js';
import { socialRepository } from '../repositories/social.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { learningLanguagesOf, toProfileUser, toPublicUser } from '../utils/userView.js';
import { LANGUAGE_CODES, sanitizeLearningLanguages } from '../utils/languages.js';
import { AVATAR_TYPES, avatarsDir } from '../middleware/upload.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { myFilmsService } from './myFilms.service.js';
import {
  computeAchievements,
  computeRank,
  computeXp,
  dayStreaks,
  featuredAchievements,
  longestRun,
} from './achievements.js';

const SALT_ROUNDS = 10;

const RESERVED_USERNAMES = new Set([
  'admin_panel', 'api', 'me', 'edit', 'settings', 'support', 'filmprep', 'root', 'system',
]);

const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Имя не может быть пустым').max(60, 'Имя — до 60 символов').optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, 'Никнейм: 3–24 символа, латиница, цифры и _')
    .optional(),
  bio: z.string().trim().max(500, 'Описание — до 500 символов').optional(),
  cefrLevel: z.enum(CEFR_LEVELS).nullable().optional(),
});

const languagesSchema = z.object({
  languages: z
    .array(
      z.object({
        code: z.enum(LANGUAGE_CODES, { message: 'Неизвестный язык' }),
        level: z.enum(CEFR_LEVELS).nullable().optional(),
      }),
    )
    .max(8, 'Можно выбрать до 8 языков')
    .optional(),
  active: z.enum(LANGUAGE_CODES, { message: 'Неизвестный язык' }).optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().max(72).optional().default(''),
  newPassword: z.string().min(8, 'Новый пароль — минимум 8 символов').max(72, 'Пароль — до 72 символов'),
});

// Magic bytes: the browser-reported MIME type alone is not trusted
const SIGNATURES = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  gif: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8',
  webp: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

function validationError(parsed) {
  return createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Проверьте данные');
}

/** XP, rank and badges for several users at once (comments, leaderboard). */
export async function ranksForUsers(userIds) {
  if (userIds && userIds.length === 0) return new Map();
  const stats = await socialRepository.statsForUsers(userIds);
  return new Map(stats.map((s) => [s.userId, { stats: s, rank: computeRank(computeXp(s)) }]));
}

async function fullProgress(userId) {
  const [[stats], answers, days, today] = await Promise.all([
    socialRepository.statsForUsers([userId]),
    socialRepository.answerHistory(userId),
    socialRepository.activityDays(userId),
    socialRepository.todayLocal(),
  ]);
  const answerStreak = longestRun(answers);
  const dayStreak = dayStreaks(days, today);
  const metrics = {
    ...stats,
    bestAnswerStreak: answerStreak.best,
    currentAnswerStreak: answerStreak.current,
    bestDayStreak: dayStreak.best,
    currentDayStreak: dayStreak.current,
    activeDays: days.length,
  };
  const achievements = computeAchievements(metrics);
  return {
    rank: computeRank(computeXp(stats)),
    stats: metrics,
    achievements,
    featured: featuredAchievements(achievements),
  };
}

async function buildProfile(user, { isOwner }) {
  const [progress, favorites, comments] = await Promise.all([
    fullProgress(user.id),
    socialRepository.listFavorites(user.id),
    socialRepository.listUserComments(user.id),
  ]);
  return {
    user: isOwner ? { ...toProfileUser(user), ...toPublicUser(user) } : toProfileUser(user),
    isOwner,
    ...progress,
    favorites,
    comments,
  };
}

async function removeAvatarFile(avatarPath) {
  if (!avatarPath) return;
  await fs.rm(path.join(avatarsDir, path.basename(avatarPath)), { force: true }).catch(() => {});
}

export const profileService = {
  async getByUsername(username, viewerId) {
    const user = await usersRepository.findByUsername(username);
    if (!user) throw createHttpError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
    return buildProfile(user, { isOwner: user.id === viewerId });
  },

  async getMine(userId) {
    const user = await usersRepository.findById(userId);
    if (!user) throw createHttpError(401, 'UNAUTHORIZED', 'User not found');
    return buildProfile(user, { isOwner: true });
  },

  async update(userId, body) {
    const parsed = profileSchema.safeParse(body || {});
    if (!parsed.success) throw validationError(parsed);

    const current = await usersRepository.findById(userId);
    if (!current) throw createHttpError(401, 'UNAUTHORIZED', 'User not found');

    const data = parsed.data;
    const username = data.username ?? current.username;
    if (username !== current.username) {
      if (RESERVED_USERNAMES.has(username)) {
        throw createHttpError(409, 'USERNAME_TAKEN', 'Этот никнейм занят');
      }
      if (await usersRepository.isUsernameTaken(username, userId)) {
        throw createHttpError(409, 'USERNAME_TAKEN', 'Этот никнейм уже занят');
      }
    }

    let updated = await usersRepository.updateProfile(userId, {
      displayName: data.displayName !== undefined ? data.displayName : current.display_name,
      cefrLevel: data.cefrLevel !== undefined ? data.cefrLevel : current.cefr_level,
      bio: data.bio !== undefined ? data.bio : current.bio,
      username,
    });
    // The single "level" field is the level of the language being studied right now
    if (data.cefrLevel !== undefined) {
      const { learningLanguages, activeLanguage } = learningLanguagesOf(updated);
      updated = await usersRepository.updateLanguages(userId, {
        learningLanguages: learningLanguages.map((l) =>
          l.code === activeLanguage ? { ...l, level: data.cefrLevel } : l,
        ),
        activeLanguage,
      });
    }
    return toPublicUser(updated);
  },

  /** body: { languages?: [{ code, level }], active?: 'es' } — either part may be omitted. */
  async updateLanguages(userId, body) {
    const parsed = languagesSchema.safeParse(body || {});
    if (!parsed.success) throw validationError(parsed);
    const current = await usersRepository.findById(userId);
    if (!current) throw createHttpError(401, 'UNAUTHORIZED', 'User not found');

    const now = learningLanguagesOf(current);
    const list = parsed.data.languages
      ? sanitizeLearningLanguages(parsed.data.languages)
      : now.learningLanguages;
    if (!list.length) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Выберите хотя бы один язык');
    }
    let active = parsed.data.active || now.activeLanguage;
    if (!list.some((l) => l.code === active)) {
      if (parsed.data.active) {
        list.push({ code: parsed.data.active, level: null });
      } else {
        active = list[0].code;
      }
    }
    const updated = await usersRepository.updateLanguages(userId, {
      learningLanguages: list,
      activeLanguage: active,
    });
    return toPublicUser(updated);
  },

  async changePassword(userId, body) {
    const parsed = passwordSchema.safeParse(body || {});
    if (!parsed.success) throw validationError(parsed);

    const user = await usersRepository.findAuthById(userId);
    if (!user) throw createHttpError(401, 'UNAUTHORIZED', 'User not found');

    // Google-only accounts have no password yet: they may set one without the old one
    if (user.password_hash) {
      const ok = await bcrypt.compare(parsed.data.currentPassword, user.password_hash);
      if (!ok) throw createHttpError(400, 'WRONG_PASSWORD', 'Текущий пароль указан неверно');
    }

    await usersRepository.updatePassword(userId, await bcrypt.hash(parsed.data.newPassword, SALT_ROUNDS));
    return { ok: true };
  },

  /** Accounts with a password confirm by password, Google-only accounts by typing their email. */
  async deleteAccount(userId, body) {
    const user = await usersRepository.findAuthById(userId);
    if (!user) throw createHttpError(401, 'UNAUTHORIZED', 'User not found');

    if (user.password_hash) {
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!password || !(await bcrypt.compare(password, user.password_hash))) {
        throw createHttpError(400, 'WRONG_PASSWORD', 'Пароль указан неверно');
      }
    } else {
      const typed = String(body?.email || '').trim().toLowerCase();
      if (typed !== String(user.email).toLowerCase()) {
        throw createHttpError(400, 'WRONG_CONFIRMATION', 'Введите свой email, чтобы подтвердить удаление');
      }
    }

    if (user.role === 'admin' && (await usersRepository.countAdmins()) <= 1) {
      throw createHttpError(409, 'LAST_ADMIN', 'Нельзя удалить единственного администратора');
    }

    // Personal films keep video and posters outside the DB, so they go through the regular removal
    for (const film of await mediaRepository.listOwned(userId)) {
      await myFilmsService.remove(userId, film.id);
    }
    const current = await usersRepository.findById(userId);
    await usersRepository.remove(userId);
    await removeAvatarFile(current?.avatar_path);
    return { ok: true };
  },

  async setAvatar(userId, file) {
    if (!file) throw createHttpError(400, 'NO_FILE', 'Выберите картинку');
    const ext = AVATAR_TYPES[file.mimetype];
    if (!ext || !SIGNATURES[ext](file.buffer)) {
      throw createHttpError(400, 'INVALID_FILE', 'Файл не похож на картинку JPG, PNG, WEBP или GIF');
    }

    const current = await usersRepository.findById(userId);
    const filename = `${userId}-${Date.now()}.${ext}`;
    await fs.writeFile(path.join(avatarsDir, filename), file.buffer);
    const updated = await usersRepository.setAvatar(userId, filename);
    await removeAvatarFile(current?.avatar_path);
    return toPublicUser(updated);
  },

  async removeAvatar(userId) {
    const current = await usersRepository.findById(userId);
    const updated = await usersRepository.setAvatar(userId, null);
    await removeAvatarFile(current?.avatar_path);
    return toPublicUser(updated);
  },

  async leaderboard(limit = 50) {
    const [users, ranks] = await Promise.all([socialRepository.listUsers(null), ranksForUsers(null)]);
    return users
      .map((u) => {
        const entry = ranks.get(u.id);
        return {
          user: toProfileUser(u),
          rank: entry.rank,
          wordsLearned: entry.stats.wordsLearned,
          quizzesPassed: entry.stats.quizzesPassed,
          comments: entry.stats.comments,
        };
      })
      .filter((row) => row.rank.xp > 0)
      .sort((a, b) => b.rank.xp - a.rank.xp || a.user.username.localeCompare(b.user.username))
      .slice(0, limit)
      .map((row, i) => ({ place: i + 1, ...row }));
  },
};
