import { pool } from '../db/pool.js';
import { slugify } from '../utils/slug.js';

function mapMedia(row) {
  if (!row) return null;
  const lexiconCount = row.lexicon_count != null ? Number(row.lexicon_count) : undefined;
  const quizQuestionCount =
    row.quiz_question_count != null ? Number(row.quiz_question_count) : undefined;
  return {
    id: row.id,
    slug: row.slug || null,
    title: row.title,
    description: row.description,
    synopsis: row.synopsis || '',
    year: row.year,
    genres: row.genres || [],
    themes: row.themes || [],
    language: row.language,
    recommendedLevel: row.recommended_level,
    posterUrl: row.poster_url,
    externalWatchUrl: row.external_watch_url,
    videoUrl: row.video_url,
    status: row.status,
    ownerId: row.owner_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lexiconCount,
    phrasesCount: row.phrases_count != null ? Number(row.phrases_count) : undefined,
    grammarCount: row.grammar_count != null ? Number(row.grammar_count) : undefined,
    quizQuestionCount,
    hasMaterials: lexiconCount != null ? lexiconCount > 0 : undefined,
    hasQuiz: quizQuestionCount != null ? quizQuestionCount >= 5 : undefined,
    videoStorageKey: row.video_storage_key || null,
    videoStorageDriver: row.video_storage_driver || null,
    videoStatus: row.video_status || 'none',
    videoStage: row.video_stage || null,
    videoProgress: row.video_progress ?? 0,
    videoError: row.video_error || null,
    videoDurationSec: row.video_duration_sec ?? null,
    hasVideo: Boolean(row.video_url) || row.video_status === 'ready',
    countries: row.countries || [],
    director: row.director || null,
    runtimeMin: row.runtime_min ?? null,
    ratingAvg: row.rating_avg != null ? Number(row.rating_avg) : null,
    ratingCount: row.rating_count != null ? Number(row.rating_count) : 0,
  };
}

const VIDEO_FIELDS = `
  video_storage_key, video_storage_driver, video_status, video_stage,
  video_progress, video_error, video_duration_sec
`;

const SELECT_FIELDS = `
  id, slug, title, description, synopsis, year, genres, themes, language,
  recommended_level, poster_url, external_watch_url, video_url, status,
  created_at, updated_at, countries, director, runtime_min, owner_id, ${VIDEO_FIELDS}
`;

const SELECT_FIELDS_WITH_STATS = `
  media_items.id, media_items.slug, media_items.title, media_items.description, media_items.synopsis, media_items.year,
  media_items.genres, media_items.themes, media_items.language,
  media_items.recommended_level, media_items.poster_url, media_items.external_watch_url,
  media_items.video_url, media_items.status, media_items.created_at, media_items.updated_at,
  media_items.video_storage_key, media_items.video_storage_driver, media_items.video_status,
  media_items.video_stage, media_items.video_progress, media_items.video_error,
  media_items.video_duration_sec,
  media_items.countries, media_items.director, media_items.runtime_min, media_items.owner_id,
  (SELECT COUNT(*)::int FROM lexicon_entries le WHERE le.media_id = media_items.id) AS lexicon_count,
  (SELECT COUNT(*)::int FROM phrases ph WHERE ph.media_id = media_items.id) AS phrases_count,
  (SELECT COUNT(*)::int FROM grammar_patterns gp WHERE gp.media_id = media_items.id) AS grammar_count,
  (
    SELECT COUNT(*)::int
    FROM quiz_questions qq
    JOIN quizzes qz ON qz.id = qq.quiz_id
    WHERE qz.media_id = media_items.id AND qz.is_published = TRUE
  ) AS quiz_question_count,
  (SELECT ROUND(AVG(mr.stars)::numeric, 1) FROM media_ratings mr WHERE mr.media_id = media_items.id) AS rating_avg,
  (SELECT COUNT(*)::int FROM media_ratings mr WHERE mr.media_id = media_items.id) AS rating_count
`;

// Whitelisted ORDER BY clauses (sort key comes from the query string)
const SORTS = {
  title: 'media_items.title ASC',
  year_desc: 'media_items.year DESC NULLS LAST, media_items.title ASC',
  year_asc: 'media_items.year ASC NULLS LAST, media_items.title ASC',
  rating: 'rating_avg DESC NULLS LAST, rating_count DESC, media_items.title ASC',
  popular: `(
      (SELECT COUNT(*) FROM media_favorites f WHERE f.media_id = media_items.id) +
      (SELECT COUNT(*) FROM media_ratings r WHERE r.media_id = media_items.id) +
      (SELECT COUNT(*) FROM media_comments c WHERE c.media_id = media_items.id AND c.deleted_at IS NULL)
    ) DESC, media_items.title ASC`,
  new: 'media_items.created_at DESC',
  runtime: 'media_items.runtime_min ASC NULLS LAST, media_items.title ASC',
};

export const mediaRepository = {
  /** Distinct values for catalog filter dropdowns (published films only). */
  async filterOptions() {
    const { rows } = await pool.query(
      `SELECT
         ARRAY(SELECT DISTINCT unnest(genres) FROM media_items WHERE status = 'published' ORDER BY 1) AS genres,
         ARRAY(SELECT DISTINCT unnest(themes) FROM media_items WHERE status = 'published' ORDER BY 1) AS themes,
         ARRAY(SELECT DISTINCT unnest(countries) FROM media_items WHERE status = 'published' ORDER BY 1) AS countries,
         ARRAY(SELECT DISTINCT language FROM media_items WHERE status = 'published' ORDER BY 1) AS languages,
         MIN(year) AS year_min,
         MAX(year) AS year_max
       FROM media_items WHERE status = 'published'`,
    );
    const row = rows[0];
    return {
      genres: row.genres,
      themes: row.themes,
      countries: row.countries,
      languages: row.languages,
      yearMin: row.year_min,
      yearMax: row.year_max,
    };
  },

  async listPublished({
    theme,
    genre,
    country,
    level,
    language,
    q,
    yearFrom,
    yearTo,
    minRating,
    hasVideo,
    hasQuiz,
    sort = 'title',
    page = 1,
    limit = 12,
  }) {
    const where = ["status = 'published'"];
    const params = [];
    const add = (value) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (theme) where.push(`${add(theme)} = ANY(themes)`);
    if (genre) where.push(`${add(genre)} = ANY(genres)`);
    if (country) where.push(`${add(country)} = ANY(countries)`);
    if (level) where.push(`recommended_level = ${add(level)}`);
    if (language) where.push(`language = ${add(language)}`);
    if (q) {
      const like = add(`%${q.toLowerCase()}%`);
      where.push(`(lower(title) LIKE ${like} OR lower(coalesce(director, '')) LIKE ${like})`);
    }
    if (yearFrom) where.push(`year >= ${add(yearFrom)}`);
    if (yearTo) where.push(`year <= ${add(yearTo)}`);
    if (minRating) {
      where.push(
        `(SELECT AVG(r.stars) FROM media_ratings r WHERE r.media_id = media_items.id) >= ${add(minRating)}`,
      );
    }
    if (hasVideo) where.push(`(video_status = 'ready' OR video_url IS NOT NULL)`);
    if (hasQuiz) {
      where.push(`(
        SELECT COUNT(*) FROM quiz_questions qq JOIN quizzes qz ON qz.id = qq.quiz_id
        WHERE qz.media_id = media_items.id AND qz.is_published = TRUE
      ) >= 5`);
    }

    const whereSql = where.join(' AND ');
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM media_items WHERE ${whereSql}`,
      params,
    );

    const offset = (page - 1) * limit;
    const limitRef = add(limit);
    const offsetRef = add(offset);
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS_WITH_STATS}
       FROM media_items
       WHERE ${whereSql}
       ORDER BY ${SORTS[sort] || SORTS.title}
       LIMIT ${limitRef} OFFSET ${offsetRef}`,
      params,
    );

    return {
      items: rows.map(mapMedia),
      total: countResult.rows[0].total,
      page,
      limit,
    };
  },

  /** Personal films of one learner, newest first. */
  async listOwned(ownerId) {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS_WITH_STATS}
       FROM media_items
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [ownerId],
    );
    return rows.map(mapMedia);
  },

  async countOwned(ownerId) {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM media_items WHERE owner_id = $1',
      [ownerId],
    );
    return rows[0].n;
  },

  /** Admin catalog: personal films of learners are not part of it. */
  async listAll({ status, page = 1, limit = 20 }) {
    const where = ['owner_id IS NULL'];
    const params = [];

    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const countParams = params.slice(0, -2);
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM media_items ${whereSql}`,
      countParams,
    );

    const limitIdx = params.length - 1;
    const offsetIdx = params.length;
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS_WITH_STATS}
       FROM media_items
       ${whereSql}
       ORDER BY updated_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    return {
      items: rows.map(mapMedia),
      total: countResult.rows[0].total,
      page,
      limit,
    };
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS_WITH_STATS}
       FROM media_items
       WHERE media_items.id = $1`,
      [id],
    );
    return mapMedia(rows[0]);
  },

  async create(data) {
    const { rows } = await pool.query(
      `INSERT INTO media_items (
         title, description, year, genres, themes, language,
         recommended_level, poster_url, external_watch_url, video_url, status, synopsis,
         countries, director, runtime_min, owner_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING ${SELECT_FIELDS}`,
      [
        data.title,
        data.description ?? '',
        data.year ?? null,
        data.genres ?? [],
        data.themes ?? [],
        data.language ?? 'en',
        data.recommendedLevel ?? null,
        data.posterUrl ?? null,
        data.externalWatchUrl ?? null,
        data.videoUrl ?? null,
        data.status ?? 'draft',
        data.synopsis ?? '',
        data.countries ?? [],
        data.director ?? null,
        data.runtimeMin ?? null,
        data.ownerId ?? null,
      ],
    );
    const row = rows[0];
    row.slug = await this.assignSlug(row.id, row.title, row.year);
    return mapMedia(row);
  },

  async update(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    const next = {
      title: data.title ?? current.title,
      description: data.description ?? current.description,
      synopsis: data.synopsis ?? current.synopsis,
      year: data.year !== undefined ? data.year : current.year,
      genres: data.genres ?? current.genres,
      themes: data.themes ?? current.themes,
      language: data.language ?? current.language,
      recommendedLevel:
        data.recommendedLevel !== undefined
          ? data.recommendedLevel
          : current.recommendedLevel,
      posterUrl: data.posterUrl !== undefined ? data.posterUrl : current.posterUrl,
      externalWatchUrl:
        data.externalWatchUrl !== undefined
          ? data.externalWatchUrl
          : current.externalWatchUrl,
      videoUrl: data.videoUrl !== undefined ? data.videoUrl : current.videoUrl,
      status: data.status ?? current.status,
      countries: data.countries ?? current.countries,
      director: data.director !== undefined ? data.director : current.director,
      runtimeMin: data.runtimeMin !== undefined ? data.runtimeMin : current.runtimeMin,
    };

    const { rows } = await pool.query(
      `UPDATE media_items SET
         title = $2,
         description = $3,
         year = $4,
         genres = $5,
         themes = $6,
         language = $7,
         recommended_level = $8,
         poster_url = $9,
         external_watch_url = $10,
         video_url = $11,
         status = $12,
         synopsis = $13,
         countries = $14,
         director = $15,
         runtime_min = $16,
         updated_at = NOW()
       WHERE id = $1
       RETURNING ${SELECT_FIELDS}`,
      [
        id,
        next.title,
        next.description,
        next.year,
        next.genres,
        next.themes,
        next.language,
        next.recommendedLevel,
        next.posterUrl,
        next.externalWatchUrl,
        next.videoUrl,
        next.status,
        next.synopsis,
        next.countries,
        next.director,
        next.runtimeMin,
      ],
    );
    const row = rows[0];
    if (row && (next.title !== current.title || !row.slug)) {
      row.slug = await this.assignSlug(id, next.title, next.year);
    }
    return mapMedia(row);
  },

  /** Unique readable URL name from the title; on a clash the year, then a number is added. */
  async assignSlug(id, title, year) {
    const base = slugify(title) || 'film';
    const { rows } = await pool.query(
      `SELECT slug FROM media_items WHERE id <> $1 AND (slug = $2 OR slug LIKE $2 || '-%')`,
      [id, base],
    );
    const taken = new Set(rows.map((r) => r.slug));
    let slug = base;
    if (taken.has(slug) && year) slug = `${base}-${year}`;
    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
    await pool.query(`UPDATE media_items SET slug = $2 WHERE id = $1`, [id, slug]);
    return slug;
  },

  /** Films added by seeds/scripts straight into the DB get their slug on API start. */
  async fillMissingSlugs() {
    const { rows } = await pool.query(
      `SELECT id, title, year FROM media_items WHERE slug IS NULL ORDER BY (owner_id IS NOT NULL), created_at`,
    );
    for (const row of rows) await this.assignSlug(row.id, row.title, row.year);
    return rows.length;
  },

  async findIdBySlug(slug) {
    const { rows } = await pool.query(`SELECT id FROM media_items WHERE slug = $1`, [slug]);
    return rows[0]?.id || null;
  },

  /** Partial update of HLS processing state; only keys present in `fields` are written. */
  async updateVideoState(id, fields) {
    const columns = {
      storageKey: 'video_storage_key',
      storageDriver: 'video_storage_driver',
      status: 'video_status',
      stage: 'video_stage',
      progress: 'video_progress',
      error: 'video_error',
      durationSec: 'video_duration_sec',
      videoUrl: 'video_url',
    };
    const sets = [];
    const params = [id];
    for (const [key, column] of Object.entries(columns)) {
      if (fields[key] !== undefined) {
        params.push(fields[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    if (!sets.length) return;
    await pool.query(
      `UPDATE media_items SET ${sets.join(', ')} WHERE id = $1`,
      params,
    );
  },

  async failInterruptedVideoJobs() {
    const { rowCount } = await pool.query(
      `UPDATE media_items
       SET video_status = 'failed', video_stage = NULL,
           video_error = 'Обработка прервана перезапуском сервера — загрузите файл ещё раз'
       WHERE video_status = 'processing'`,
    );
    return rowCount;
  },

  /** Films that have subtitles in their own language, catalog films first. */
  async listWithOriginalSubtitles() {
    const { rows } = await pool.query(
      `SELECT m.id, m.language, m.title FROM media_items m
       WHERE EXISTS (SELECT 1 FROM subtitles s WHERE s.media_id = m.id AND s.language = COALESCE(m.language, 'en'))
       ORDER BY (m.owner_id IS NOT NULL), m.created_at DESC`,
    );
    return rows;
  },

  /** Ready films stored in the cloud, catalog films first. */
  async listCloudVideoIds() {
    const { rows } = await pool.query(
      `SELECT id FROM media_items
       WHERE video_status = 'ready' AND video_storage_key IS NOT NULL
         AND COALESCE(video_storage_driver, 'local') <> 'local'
       ORDER BY (owner_id IS NOT NULL), created_at DESC`,
    );
    return rows.map((row) => row.id);
  },

  async remove(id) {
    const { rowCount } = await pool.query(`DELETE FROM media_items WHERE id = $1`, [id]);
    return rowCount > 0;
  },
};
