import { profileService } from '../services/profile.service.js';
import { socialService } from '../services/social.service.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const profileController = {
  byUsername: handle(async (req, res) => {
    res.json(await profileService.getByUsername(req.params.username, req.user.id));
  }),
  mine: handle(async (req, res) => {
    res.json(await profileService.getMine(req.user.id));
  }),
  update: handle(async (req, res) => {
    res.json({ user: await profileService.update(req.user.id, req.body) });
  }),
  changePassword: handle(async (req, res) => {
    res.json(await profileService.changePassword(req.user.id, req.body));
  }),
  updateLanguages: handle(async (req, res) => {
    res.json({ user: await profileService.updateLanguages(req.user.id, req.body) });
  }),
  setAvatar: handle(async (req, res) => {
    res.json({ user: await profileService.setAvatar(req.user.id, req.file) });
  }),
  removeAvatar: handle(async (req, res) => {
    res.json({ user: await profileService.removeAvatar(req.user.id) });
  }),
  deleteAccount: handle(async (req, res) => {
    await profileService.deleteAccount(req.user.id, req.body);
    res.clearCookie('filmprep_refresh', { path: '/api/v1/auth' });
    res.status(204).send();
  }),
  leaderboard: handle(async (req, res) => {
    res.json({ items: await profileService.leaderboard() });
  }),
};

export const socialController = {
  summary: handle(async (req, res) => {
    res.json(await socialService.summary(req.params.id, req.user.id));
  }),
  rate: handle(async (req, res) => {
    res.json({ rating: await socialService.rate(req.params.id, req.user.id, req.body) });
  }),
  unrate: handle(async (req, res) => {
    res.json({ rating: await socialService.unrate(req.params.id, req.user.id) });
  }),
  favorite: handle(async (req, res) => {
    res.json({ favorite: await socialService.setFavorite(req.params.id, req.user.id, true) });
  }),
  unfavorite: handle(async (req, res) => {
    res.json({ favorite: await socialService.setFavorite(req.params.id, req.user.id, false) });
  }),
  comments: handle(async (req, res) => {
    res.json({ items: await socialService.listComments(req.params.id, req.user) });
  }),
  addComment: handle(async (req, res) => {
    res.status(201).json({ item: await socialService.addComment(req.params.id, req.user, req.body) });
  }),
  editComment: handle(async (req, res) => {
    res.json({ item: await socialService.editComment(req.params.commentId, req.user, req.body) });
  }),
  deleteComment: handle(async (req, res) => {
    res.json(await socialService.deleteComment(req.params.commentId, req.user));
  }),
};
