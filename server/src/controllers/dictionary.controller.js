import { dictionaryService } from '../services/dictionary.service.js';
import { goalsService } from '../services/goals.service.js';
import { recommendationsService } from '../services/recommendations.service.js';

const parseLimit = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : fallback;
};

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const dictionaryController = {
  list: handle(async (req, res) => {
    res.json(await dictionaryService.list(req.user.id, req.query));
  }),
  save: handle(async (req, res) => {
    const result = await dictionaryService.save(req.user.id, req.body);
    res.status(result.created ? 201 : 200).json(result);
  }),
  update: handle(async (req, res) => {
    res.json(await dictionaryService.update(req.user.id, req.params.wordId, req.body));
  }),
  remove: handle(async (req, res) => {
    res.json(await dictionaryService.remove(req.user.id, req.params.wordId, req.query.kind));
  }),
  browse: handle(async (req, res) => {
    res.json(await dictionaryService.browse(req.user.id, req.query));
  }),
  translate: handle(async (req, res) => {
    res.json(await dictionaryService.translate(req.user.id, req.body));
  }),
};

export const goalsController = {
  status: handle(async (req, res) => {
    res.json(await goalsService.status(req.user.id));
  }),
  update: handle(async (req, res) => {
    res.json(await goalsService.updateSettings(req.user.id, req.body));
  }),
};

export const recommendationsController = {
  mine: handle(async (req, res) => {
    res.json(await recommendationsService.forUser(req.user.id, { limit: parseLimit(req.query.limit, 10) }));
  }),
  similar: handle(async (req, res) => {
    res.json(await recommendationsService.similar(req.params.id, { limit: parseLimit(req.query.limit, 8) }));
  }),
};
