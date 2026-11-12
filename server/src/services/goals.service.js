import { z } from 'zod';
import { dictionaryRepository } from '../repositories/dictionary.repository.js';
import { socialRepository } from '../repositories/social.repository.js';
import { createHttpError } from '../utils/httpError.js';

export const GOAL_PRESETS = [5, 10, 20, 30];

const settingsSchema = z.object({
  dailyGoal: z.number().int().min(1, 'Цель — от 1 слова').max(200, 'Цель — до 200 слов').optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Время в формате ЧЧ:ММ')
    .optional(),
});

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Duolingo-like streak: consecutive days on which the daily goal was reached.
 * Today not reached yet does not break the streak — it is still "at risk".
 */
export function computeStreak(counts, today, goal) {
  const met = (day) => (counts.get(day) || 0) >= goal;
  let current = 0;
  let day = met(today) ? today : shiftDay(today, -1);
  while (met(day)) {
    current += 1;
    day = shiftDay(day, -1);
  }

  let best = 0;
  let run = 0;
  let prev = null;
  [...counts.keys()].sort().forEach((d) => {
    if (!met(d)) {
      run = 0;
      prev = d;
      return;
    }
    run = prev && shiftDay(prev, 1) === d && run > 0 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  });
  return { current, best: Math.max(best, current) };
}

export const goalsService = {
  async status(userId) {
    const [settings, rows, today] = await Promise.all([
      dictionaryRepository.goalSettings(userId),
      dictionaryRepository.dailyWordCounts(userId),
      socialRepository.todayLocal(),
    ]);
    if (!settings) throw createHttpError(404, 'NOT_FOUND', 'Пользователь не найден');

    const goal = settings.daily_goal;
    const counts = new Map(rows.map((r) => [r.day, r.words]));
    const todayCount = counts.get(today) || 0;
    const streak = computeStreak(counts, today, goal);

    const week = [];
    for (let i = 6; i >= 0; i -= 1) {
      const day = shiftDay(today, -i);
      const words = counts.get(day) || 0;
      week.push({ day, words, met: words >= goal });
    }

    return {
      goal,
      presets: GOAL_PRESETS,
      today: todayCount,
      remaining: Math.max(0, goal - todayCount),
      completed: todayCount >= goal,
      streak: streak.current,
      bestStreak: streak.best,
      streakAtRisk: streak.current > 0 && todayCount < goal,
      daysMet: [...counts.values()].filter((w) => w >= goal).length,
      week,
      reminder: { enabled: settings.reminder_enabled, time: settings.reminder_time },
      date: today,
    };
  },

  async updateSettings(userId, input) {
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid input');
    }
    await dictionaryRepository.updateGoalSettings(userId, parsed.data);
    return this.status(userId);
  },
};
