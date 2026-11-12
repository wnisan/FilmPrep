import { DEFAULT_LANGUAGE, sanitizeLearningLanguages } from './languages.js';

export function avatarUrl(avatarPath) {
  return avatarPath ? `/uploads/avatars/${avatarPath}` : null;
}

/** Studied languages with the active one first-class; old rows fall back to English. */
export function learningLanguagesOf(user) {
  const list = sanitizeLearningLanguages(user.learning_languages);
  if (!list.length) list.push({ code: DEFAULT_LANGUAGE, level: user.cefr_level ?? null });
  const active = list.some((l) => l.code === user.active_language) ? user.active_language : list[0].code;
  return { learningLanguages: list, activeLanguage: active };
}

/** Own account (includes email). */
export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    cefrLevel: user.cefr_level,
    ...learningLanguagesOf(user),
    displayName: user.display_name,
    username: user.username,
    bio: user.bio || '',
    avatarUrl: avatarUrl(user.avatar_path),
    hasPassword: Boolean(user.has_password),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/** Visible to other learners: no email. */
export function toProfileUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    bio: user.bio || '',
    avatarUrl: avatarUrl(user.avatar_path),
    role: user.role,
    cefrLevel: user.cefr_level,
    learningLanguages: learningLanguagesOf(user).learningLanguages,
    createdAt: user.created_at,
  };
}
