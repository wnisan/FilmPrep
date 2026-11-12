import { pool } from '../db/pool.js';

const USER_PUBLIC_FIELDS = `
  id, email, role, cefr_level, display_name, username, bio, avatar_path,
  learning_languages, active_language,
  created_at, updated_at, google_id, (password_hash IS NOT NULL) AS has_password
`;

const USER_AUTH_FIELDS = `
  id, email, password_hash, role, cefr_level, display_name, username, bio, avatar_path,
  learning_languages, active_language,
  created_at, updated_at, google_id, (password_hash IS NOT NULL) AS has_password
`;

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

/** "Ivan.Petrov@x" → "ivan_petrov"; always 3–20 chars of [a-z0-9_]. */
export function normalizeUsernameBase(source) {
  let base = String(source || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  if (base.length < 3) base = `${base || 'user'}_fp`.slice(0, 20);
  return base;
}

export const usersRepository = {
  async findByEmail(email) {
    const { rows } = await pool.query(
      `SELECT ${USER_AUTH_FIELDS} FROM users WHERE email = $1`,
      [email],
    );
    return rows[0] || null;
  },

  async findByGoogleId(googleId) {
    const { rows } = await pool.query(
      `SELECT ${USER_AUTH_FIELDS} FROM users WHERE google_id = $1`,
      [googleId],
    );
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] || null;
  },

  async findAuthById(id) {
    const { rows } = await pool.query(`SELECT ${USER_AUTH_FIELDS} FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findByUsername(username) {
    const { rows } = await pool.query(
      `SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE username = $1`,
      [String(username || '').toLowerCase()],
    );
    return rows[0] || null;
  },

  async isUsernameTaken(username, exceptUserId = null) {
    const { rows } = await pool.query(
      `SELECT 1 FROM users WHERE username = $1 AND ($2::uuid IS NULL OR id <> $2)`,
      [username, exceptUserId],
    );
    return rows.length > 0;
  },

  /** First free nickname among base, base2, base3… */
  async uniqueUsername(source) {
    const base = normalizeUsernameBase(source);
    const { rows } = await pool.query(
      `SELECT username FROM users WHERE username = $1 OR username ~ ('^' || $1 || '[0-9]+$')`,
      [base],
    );
    const taken = new Set(rows.map((r) => r.username));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = `${base}${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  },

  async create({ email, passwordHash, role, cefrLevel, displayName, googleId, username, language = 'en' }) {
    const nickname = username || (await this.uniqueUsername(email.split('@')[0]));
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role, cefr_level, display_name, google_id, username,
                          learning_languages, active_language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${USER_PUBLIC_FIELDS}`,
      [
        email,
        passwordHash ?? null,
        role,
        cefrLevel ?? null,
        displayName ?? null,
        googleId ?? null,
        nickname,
        JSON.stringify([{ code: language, level: cefrLevel ?? null }]),
        language,
      ],
    );
    return rows[0];
  },

  /** Studied languages; cefr_level always mirrors the level of the active language. */
  async updateLanguages(id, { learningLanguages, activeLanguage }) {
    const active = learningLanguages.find((l) => l.code === activeLanguage) || learningLanguages[0];
    const { rows } = await pool.query(
      `UPDATE users SET
         learning_languages = $2::jsonb,
         active_language = $3,
         cefr_level = $4,
         updated_at = NOW()
       WHERE id = $1
       RETURNING ${USER_PUBLIC_FIELDS}`,
      [id, JSON.stringify(learningLanguages), active.code, active.level ?? null],
    );
    return rows[0] || null;
  },

  async linkGoogleId(id, googleId) {
    const { rows } = await pool.query(
      `UPDATE users SET google_id = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING ${USER_PUBLIC_FIELDS}`,
      [id, googleId],
    );
    return rows[0] || null;
  },

  async updateProfile(id, { displayName, cefrLevel, username, bio }) {
    const { rows } = await pool.query(
      `UPDATE users SET
         display_name = $2,
         cefr_level = $3,
         username = $4,
         bio = $5,
         updated_at = NOW()
       WHERE id = $1
       RETURNING ${USER_PUBLIC_FIELDS}`,
      [id, displayName ?? null, cefrLevel ?? null, username, bio ?? ''],
    );
    return rows[0] || null;
  },

  async updatePassword(id, passwordHash) {
    await pool.query(`UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`, [
      id,
      passwordHash,
    ]);
  },

  async setAvatar(id, avatarPath) {
    const { rows } = await pool.query(
      `UPDATE users SET avatar_path = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING ${USER_PUBLIC_FIELDS}`,
      [id, avatarPath],
    );
    return rows[0] || null;
  },

  async countAdmins() {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`);
    return rows[0].n;
  },

  /** Everything the user owns is removed by ON DELETE CASCADE. */
  async remove(id) {
    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  },
};
