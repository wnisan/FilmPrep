import { myFilmsService } from '../services/myFilms.service.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const myFilmsController = {
  list: handle(async (req, res) => {
    res.json({ items: await myFilmsService.list(req.user.id), limit: myFilmsService.limit() });
  }),
  create: handle(async (req, res) => {
    res.status(201).json({ item: await myFilmsService.create(req.user.id, req.body) });
  }),
  get: handle(async (req, res) => {
    res.json({ item: await myFilmsService.get(req.user.id, req.params.id) });
  }),
  update: handle(async (req, res) => {
    res.json({ item: await myFilmsService.update(req.user.id, req.params.id, req.body) });
  }),
  remove: handle(async (req, res) => {
    res.json(await myFilmsService.remove(req.user.id, req.params.id));
  }),
  uploadVideo: handle(async (req, res) => {
    res.status(202).json({ item: await myFilmsService.uploadVideo(req.user.id, req.params.id, req.file) });
  }),
  setVideoLink: handle(async (req, res) => {
    res.json({ item: await myFilmsService.setVideoLink(req.user.id, req.params.id, req.body?.url) });
  }),
  removeVideo: handle(async (req, res) => {
    res.json({ item: await myFilmsService.removeVideo(req.user.id, req.params.id) });
  }),
  uploadSubtitle: handle(async (req, res) => {
    const language = req.body?.language || req.query.language;
    res.status(201).json({
      item: await myFilmsService.uploadSubtitle(req.user.id, req.params.id, req.file, language),
    });
  }),
  uploadPoster: handle(async (req, res) => {
    res.json({ item: await myFilmsService.uploadPoster(req.user.id, req.params.id, req.file) });
  }),
  removePoster: handle(async (req, res) => {
    res.json({ item: await myFilmsService.removePoster(req.user.id, req.params.id) });
  }),
  searchPosters: handle(async (req, res) => {
    res.json(await myFilmsService.searchPosters(req.user.id, req.params.id, req.query.q));
  }),
  removeSubtitles: handle(async (req, res) => {
    res.json({ item: await myFilmsService.removeSubtitles(req.user.id, req.params.id, req.params.role) });
  }),
  translateSubtitles: handle(async (req, res) => {
    res.status(202).json({ item: await myFilmsService.translateSubtitles(req.user.id, req.params.id) });
  }),
  prepare: handle(async (req, res) => {
    res.status(202).json({ item: await myFilmsService.prepare(req.user.id, req.params.id, req.body || {}) });
  }),
};
