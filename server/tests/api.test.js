import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { config } from '../src/config/index.js';
import { myFilmsService } from '../src/services/myFilms.service.js';
import { quizRepository } from '../src/repositories/quiz.repository.js';

const app = createApp();
const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

async function registerLearner(suffix = Date.now()) {
  const email = `test_${suffix}@example.com`;
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email,
      password: 'password123',
      displayName: 'Test User',
      cefrLevel: 'B1',
    });
  return res;
}

describe('FilmPrep API', () => {
  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%@example.com'`).catch(() => {});
    await pool.end();
  });

  test('GET /api/v1/health returns status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('service', 'filmprep-api');
    expect(res.body).toHaveProperty('database');
  });

  test('POST /api/v1/auth/register validates password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'bad@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('auth + published catalog flow', async () => {
    const health = await request(app).get('/api/v1/health');
    if (health.body.database !== 'up') {
      return; // skip DB-dependent part if Postgres unavailable
    }

    const reg = await registerLearner();
    expect(reg.status).toBe(201);
    expect(reg.body).toHaveProperty('accessToken');
    expect(reg.body.user.role).toBe('learner');

    const token = reg.body.accessToken;
    const catalog = await request(app)
      .get('/api/v1/media')
      .set('Authorization', `Bearer ${token}`);

    expect(catalog.status).toBe(200);
    expect(Array.isArray(catalog.body.items)).toBe(true);
    // draft items must not appear
    expect(catalog.body.items.every((item) => item.status === 'published')).toBe(true);
  });

  test('Paddington quiz is available after seed', async () => {
    const health = await request(app).get('/api/v1/health');
    if (health.body.database !== 'up') return;

    const reg = await registerLearner(`quiz_${Date.now()}`);
    expect(reg.status).toBe(201);
    const token = reg.body.accessToken;

    const catalog = await request(app)
      .get('/api/v1/media')
      .query({ q: 'Paddington' })
      .set('Authorization', `Bearer ${token}`);

    expect(catalog.status).toBe(200);
    if (!catalog.body.items.length) return;

    const mediaId = catalog.body.items[0].id;
    const quiz = await request(app)
      .get(`/api/v1/media/${mediaId}/quiz`)
      .set('Authorization', `Bearer ${token}`);

    expect(quiz.status).toBe(200);
    expect(quiz.body.questions.length).toBeGreaterThanOrEqual(5);
    expect(quiz.body.questions[0]).not.toHaveProperty('correctAnswer');
  });

  test('personal dictionary, subtitle translation, daily goal and recommendations', async () => {
    const health = await request(app).get('/api/v1/health');
    if (health.body.database !== 'up') return;

    const reg = await registerLearner(`dict_${Date.now()}`);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };

    const goal0 = await request(app).get('/api/v1/me/goal').set(auth);
    expect(goal0.status).toBe(200);
    expect(goal0.body).toMatchObject({ goal: 10, today: 0, streak: 0 });

    const setGoal = await request(app).patch('/api/v1/me/goal').set(auth).send({ dailyGoal: 2, reminderEnabled: true, reminderTime: '20:30' });
    expect(setGoal.status).toBe(200);
    expect(setGoal.body.reminder).toEqual({ enabled: true, time: '20:30' });
    const badGoal = await request(app).patch('/api/v1/me/goal').set(auth).send({ reminderTime: '25:00' });
    expect(badGoal.status).toBe(400);

    const saved = await request(app)
      .post('/api/v1/me/dictionary')
      .set(auth)
      .send({ word: 'Serendipity,', translation: 'счастливая случайность', context: 'Pure serendipity.', source: 'subtitle' });
    expect(saved.status).toBe(201);
    const again = await request(app).post('/api/v1/me/dictionary').set(auth).send({ word: 'serendipity' });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(saved.body.id);
    await request(app).post('/api/v1/me/dictionary').set(auth).send({ word: 'wanderlust' });

    const list = await request(app).get('/api/v1/me/dictionary').set(auth);
    expect(list.body.items.map((w) => w.word).sort()).toEqual(['Serendipity,', 'wanderlust']);
    expect(list.body.items.find((w) => w.word === 'Serendipity,').translation).toBe('счастливая случайность');

    const goal1 = await request(app).get('/api/v1/me/goal').set(auth);
    expect(goal1.body).toMatchObject({ today: 2, completed: true, streak: 1 });

    const translated = await request(app).post('/api/v1/me/dictionary/translate').set(auth).send({ word: 'serendipity' });
    expect(translated.status).toBe(200);
    expect(translated.body).toMatchObject({ inDictionary: true, source: 'mine', translation: 'счастливая случайность' });

    const fromFilm = await request(app).post('/api/v1/me/dictionary/translate').set(auth).send({ word: 'Dragons!' });
    expect(fromFilm.status).toBe(200);
    if (fromFilm.body.source === 'film') expect(fromFilm.body.lemma.toLowerCase()).toBe('dragon');

    const browse = await request(app).get('/api/v1/me/dictionary/browse').query({ limit: 5 }).set(auth);
    expect(browse.status).toBe(200);
    expect(browse.body.items.length).toBeLessThanOrEqual(5);

    const removed = await request(app).delete(`/api/v1/me/dictionary/${saved.body.id}`).set(auth);
    expect(removed.status).toBe(200);

    const reco = await request(app).get('/api/v1/me/recommendations').set(auth);
    expect(reco.status).toBe(200);
    expect(Array.isArray(reco.body.items)).toBe(true);
    if (reco.body.items.length) {
      expect(reco.body.items[0]).toHaveProperty('reasons');
      const similar = await request(app).get(`/api/v1/media/${reco.body.items[0].id}/similar`).set(auth);
      expect(similar.status).toBe(200);
      expect(similar.body.items.every((f) => f.id !== reco.body.items[0].id)).toBe(true);
    }
  });

  test('catalog filters: options, year range, country, sort validation', async () => {
    const health = await request(app).get('/api/v1/health');
    if (health.body.database !== 'up') return;

    const reg = await registerLearner(`filters_${Date.now()}`);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };

    const options = await request(app).get('/api/v1/media/filters').set(auth);
    expect(options.status).toBe(200);
    expect(Array.isArray(options.body.countries)).toBe(true);
    expect(Array.isArray(options.body.genres)).toBe(true);

    const byYear = await request(app)
      .get('/api/v1/media')
      .query({ yearFrom: 2012, yearTo: 2016, sort: 'year_asc', limit: 50 })
      .set(auth);
    expect(byYear.status).toBe(200);
    const years = byYear.body.items.map((i) => i.year);
    expect(years.every((y) => y >= 2012 && y <= 2016)).toBe(true);
    expect([...years].sort((a, b) => a - b)).toEqual(years);

    if (options.body.countries.length) {
      const country = options.body.countries[0];
      const byCountry = await request(app).get('/api/v1/media').query({ country, limit: 50 }).set(auth);
      expect(byCountry.status).toBe(200);
      expect(byCountry.body.items.length).toBeGreaterThan(0);
      expect(byCountry.body.items.every((i) => i.countries.includes(country))).toBe(true);
    }

    const badSort = await request(app).get('/api/v1/media').query({ sort: 'id; DROP TABLE users' }).set(auth);
    expect(badSort.status).toBe(400);
  });

  test('study languages: register, switch, per-language dictionary, catalog filter', async () => {
    const health = await request(app).get('/api/v1/health');
    if (health.body.database !== 'up') return;

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `lang_${Date.now()}@example.com`, password: 'password123', cefrLevel: 'A2', language: 'es' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.activeLanguage).toBe('es');
    expect(reg.body.user.learningLanguages).toEqual([{ code: 'es', level: 'A2' }]);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };

    const bad = await request(app).put('/api/v1/me/languages').set(auth).send({ languages: [{ code: 'xx', level: 'A1' }] });
    expect(bad.status).toBe(400);

    const updated = await request(app)
      .put('/api/v1/me/languages')
      .set(auth)
      .send({ languages: [{ code: 'es', level: 'A2' }, { code: 'en', level: 'B2' }], active: 'en' });
    expect(updated.status).toBe(200);
    expect(updated.body.user.activeLanguage).toBe('en');
    expect(updated.body.user.cefrLevel).toBe('B2');

    await request(app).post('/api/v1/me/dictionary').set(auth).send({ word: 'Casa', language: 'es', source: 'manual' });
    await request(app).post('/api/v1/me/dictionary').set(auth).send({ word: 'house', source: 'manual' });
    const dict = await request(app).get('/api/v1/me/dictionary').set(auth);
    expect(dict.body.languages).toMatchObject({ es: 1, en: 1 });
    const onlyEs = await request(app).get('/api/v1/me/dictionary').query({ language: 'es' }).set(auth);
    expect(onlyEs.body.items.map((i) => i.word)).toEqual(['Casa']);

    const options = await request(app).get('/api/v1/media/filters').set(auth);
    expect(options.body.languages).toContain('en');
    const byLang = await request(app).get('/api/v1/media').query({ language: 'en', limit: 50 }).set(auth);
    expect(byLang.status).toBe(200);
    expect(byLang.body.items.every((i) => i.language === 'en')).toBe(true);
  });

  test(
    'POST /api/v1/auth/refresh rotates tokens via cookie',
    async () => {
      const health = await request(app).get('/api/v1/health');
      if (health.body.database !== 'up') return;

      const agent = request.agent(app);
      const reg = await agent.post('/api/v1/auth/register').send({
        email: `refresh_${Date.now()}@example.com`,
        password: 'password123',
        cefrLevel: 'B1',
      });

      expect(reg.status).toBe(201);
      expect(reg.body.accessToken).toBeTruthy();

      const refreshed = await agent.post('/api/v1/auth/refresh').send({});
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.accessToken).toBeTruthy();
      expect(refreshed.body.accessToken).not.toBe(reg.body.accessToken);
      expect(refreshed.body.user.email).toBe(reg.body.user.email);

      const me = await agent
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.user.id).toBe(reg.body.user.id);
    },
    20000,
  );

  test(
    'profiles, ratings, favorites and threaded comments',
    async () => {
      const health = await request(app).get('/api/v1/health');
      if (health.body.database !== 'up') return;

      const stamp = Date.now();
      const a = await registerLearner(`social_a_${stamp}`);
      const b = await registerLearner(`social_b_${stamp}`);
      const auth = (res) => ({ Authorization: `Bearer ${res.body.accessToken}` });
      expect(a.body.user.username).toMatch(/^[a-z0-9_]{3,24}$/);

      const nick = `nick_${String(stamp).slice(-8)}`;
      const updated = await request(app)
        .patch('/api/v1/me/profile')
        .set(auth(a))
        .send({ username: nick, bio: 'Люблю кино', displayName: 'Аня' });
      expect(updated.status).toBe(200);
      expect(updated.body.user.username).toBe(nick);

      const taken = await request(app).patch('/api/v1/me/profile').set(auth(b)).send({ username: nick });
      expect(taken.status).toBe(409);

      const catalog = await request(app).get('/api/v1/media').set(auth(a));
      if (!catalog.body.items.length) return;
      const mediaId = catalog.body.items[0].id;

      const rated = await request(app).put(`/api/v1/media/${mediaId}/rating`).set(auth(a)).send({ stars: 5 });
      expect(rated.status).toBe(200);
      expect(rated.body.rating.mine).toBe(5);
      const badRating = await request(app).put(`/api/v1/media/${mediaId}/rating`).set(auth(a)).send({ stars: 7 });
      expect(badRating.status).toBe(400);

      const fav = await request(app).put(`/api/v1/media/${mediaId}/favorite`).set(auth(a));
      expect(fav.body.favorite.mine).toBe(true);

      const root = await request(app)
        .post(`/api/v1/media/${mediaId}/comments`)
        .set(auth(a))
        .send({ body: 'Great film for B1!' });
      expect(root.status).toBe(201);
      expect(root.body.item.authorRating).toBe(5);

      const reply = await request(app)
        .post(`/api/v1/media/${mediaId}/comments`)
        .set(auth(b))
        .send({ body: 'Agree!', parentId: root.body.item.id });
      expect(reply.status).toBe(201);
      expect(reply.body.item.parentId).toBe(root.body.item.id);

      const foreignDelete = await request(app).delete(`/api/v1/comments/${root.body.item.id}`).set(auth(b));
      expect(foreignDelete.status).toBe(403);

      const profile = await request(app).get(`/api/v1/users/${nick}`).set(auth(b));
      expect(profile.status).toBe(200);
      expect(profile.body.user).not.toHaveProperty('email');
      expect(profile.body.favorites.map((f) => f.id)).toContain(mediaId);
      expect(profile.body.comments[0].body).toBe('Great film for B1!');
      expect(profile.body.rank.title).toBeTruthy();
      const unlocked = profile.body.achievements.filter((x) => x.unlocked).map((x) => x.id);
      expect(unlocked).toEqual(expect.arrayContaining(['critic', 'talk']));

      // root has a reply → stays as a placeholder
      const del = await request(app).delete(`/api/v1/comments/${root.body.item.id}`).set(auth(a));
      expect(del.status).toBe(200);
      const thread = await request(app).get(`/api/v1/media/${mediaId}/comments`).set(auth(a));
      const placeholder = thread.body.items.find((c) => c.id === root.body.item.id);
      expect(placeholder.deleted).toBe(true);
      expect(placeholder.body).toBe('');

      const wrongPwd = await request(app)
        .put('/api/v1/me/password')
        .set(auth(a))
        .send({ currentPassword: 'nope', newPassword: 'newpassword1' });
      expect(wrongPwd.status).toBe(400);
      const okPwd = await request(app)
        .put('/api/v1/me/password')
        .set(auth(a))
        .send({ currentPassword: 'password123', newPassword: 'newpassword1' });
      expect(okPwd.status).toBe(200);
    },
    20000,
  );

  test(
    'personal films: private to the owner, subtitles → words + quiz',
    async () => {
      const health = await request(app).get('/api/v1/health');
      if (health.body.database !== 'up') return;

      const llmEnabled = config.llm.enabled;
      config.llm.enabled = false;
      try {
        const stamp = Date.now();
        const owner = await registerLearner(`own_${stamp}`);
        const other = await registerLearner(`oth_${stamp}`);
        const auth = (r) => ({ Authorization: `Bearer ${r.body.accessToken}` });

        const bad = await request(app).post('/api/v1/me/films').set(auth(owner)).send({ title: '' });
        expect(bad.status).toBe(400);

        const created = await request(app)
          .post('/api/v1/me/films')
          .set(auth(owner))
          .send({ title: 'Home Movie', language: 'en', recommendedLevel: 'B1' });
        expect(created.status).toBe(201);
        const film = created.body.item;
        expect(film.status).toBe('private');

        const noSubs = await request(app).post(`/api/v1/me/films/${film.id}/prepare`).set(auth(owner)).send({});
        expect(noSubs.status).toBe(400);

        const badLink = await request(app)
          .put(`/api/v1/me/films/${film.id}/video-link`)
          .set(auth(owner))
          .send({ url: 'https://example.com/page' });
        expect(badLink.status).toBe(400);
        const link = await request(app)
          .put(`/api/v1/me/films/${film.id}/video-link`)
          .set(auth(owner))
          .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
        expect(link.status).toBe(200);
        expect(link.body.item.streamUrl).toContain('youtube.com');

        const subs = await request(app)
          .post(`/api/v1/me/films/${film.id}/subtitles`)
          .set(auth(owner))
          .field('language', 'en')
          .attach('file', path.join(fixturesDir, 'paddington.demo.srt'));
        expect(subs.status).toBe(201);
        expect(subs.body.item.subtitles.original).toBeTruthy();

        const prepared = await request(app)
          .post(`/api/v1/me/films/${film.id}/prepare`)
          .set(auth(owner))
          .send({ translate: false });
        expect(prepared.status).toBe(202);
        const pipeline = await myFilmsService.waitForPipeline(film.id, 30000);
        expect(pipeline.state).toBe('done');

        const ready = await request(app).get(`/api/v1/me/films/${film.id}`).set(auth(owner));
        expect(ready.body.item.materials.words).toBeGreaterThan(0);
        expect(ready.body.item.materials.quizQuestions).toBeGreaterThanOrEqual(5);

        const mine = await request(app).get(`/api/v1/media/${film.id}`).set(auth(owner));
        expect(mine.status).toBe(200);
        expect(mine.body.item.isOwn).toBe(true);
        const quiz = await request(app).get(`/api/v1/media/${film.id}/quiz`).set(auth(owner));
        expect(quiz.status).toBe(200);
        const types = quiz.body.questions.map((q) => q.questionType);
        expect(types).toEqual(expect.arrayContaining(['word_order', 'listening']));

        const withAnswers = await quizRepository.getQuestionsWithAnswers(quiz.body.quiz.id);
        const perfect = Object.fromEntries(
          withAnswers.map((q) => [q.id, Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer]),
        );
        const graded = await request(app)
          .post(`/api/v1/media/${film.id}/quiz/attempts`)
          .set(auth(owner))
          .send({ answers: perfect });
        expect(graded.body.attempt.percent).toBe(100);
        const orderQ = withAnswers.find((q) => q.questionType === 'word_order');
        const shuffled = await request(app)
          .post(`/api/v1/media/${film.id}/quiz/attempts`)
          .set(auth(owner))
          .send({ answers: { ...perfect, [orderQ.id]: [...orderQ.options].reverse().join(' ') } });
        expect(shuffled.body.details.find((d) => d.questionId === orderQ.id).correct).toBe(
          [...orderQ.options].reverse().join(' ').toLowerCase() === orderQ.correctAnswer.toLowerCase(),
        );

        const scene = await request(app).get(`/api/v1/media/${film.id}/practice/scene`).set(auth(owner));
        expect(scene.status).toBe(200);
        expect(scene.body.lines.length).toBe(8);
        const retell = await request(app)
          .post(`/api/v1/media/${film.id}/practice/retell`)
          .set(auth(owner))
          .send({ start: scene.body.start, text: 'Paddington arrives in London and meets a family.' });
        expect(retell.body.error.code).toBe('LLM_DISABLED');
        const words = await request(app).get(`/api/v1/media/${film.id}/lexicon`).set(auth(owner));
        expect(words.status).toBe(200);

        for (const url of [`/api/v1/media/${film.id}`, `/api/v1/media/${film.id}/quiz`, `/api/v1/me/films/${film.id}`]) {
          const res = await request(app).get(url).set(auth(other));
          expect(res.status).toBe(404);
        }
        const catalog = await request(app).get('/api/v1/media').query({ q: 'Home Movie' }).set(auth(other));
        expect(catalog.body.items.map((i) => i.id)).not.toContain(film.id);

        const list = await request(app).get('/api/v1/me/films').set(auth(owner));
        expect(list.body.items.map((i) => i.id)).toEqual([film.id]);

        expect(link.body.item.posterUrl).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
        const png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        );
        const poster = await request(app)
          .put(`/api/v1/me/films/${film.id}/poster`)
          .set(auth(owner))
          .attach('file', png, { filename: 'cover.png', contentType: 'image/png' });
        expect(poster.status).toBe(200);
        expect(poster.body.item.posterUrl).toMatch(/^\/uploads\/posters\/.+\.png$/);
        const served = await request(app).get(poster.body.item.posterUrl);
        expect(served.status).toBe(200);
        const noPoster = await request(app).delete(`/api/v1/me/films/${film.id}/poster`).set(auth(owner));
        expect(noPoster.body.item.posterUrl).toBeNull();

        const chat = await request(app)
          .post(`/api/v1/media/${film.id}/chat`)
          .set(auth(owner))
          .send({ messages: [{ role: 'user', content: 'Hi' }] });
        expect(chat.status).toBe(400);
        expect(chat.body.error.code).toBe('LLM_DISABLED');

        const removed = await request(app).delete(`/api/v1/me/films/${film.id}`).set(auth(owner));
        expect(removed.status).toBe(200);
        const gone = await request(app).get(`/api/v1/media/${film.id}`).set(auth(owner));
        expect(gone.status).toBe(404);
      } finally {
        config.llm.enabled = llmEnabled;
      }
    },
    40000,
  );
});
