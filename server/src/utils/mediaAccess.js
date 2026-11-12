import { ROLES } from '../constants.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { createHttpError } from './httpError.js';

/** Catalog films are open to everyone; a personal film only to its owner (and admins). */
export function canView(media, user) {
  if (!media) return false;
  if (media.status === 'published') return true;
  if (!user) return false;
  if (media.ownerId && media.ownerId === user.id) return true;
  return user.role === ROLES.ADMIN;
}

/**
 * Film the user may watch and study; 404 otherwise, so private films don't leak.
 * `user` may be a bare id (services that only know the learner).
 */
export async function findViewableMedia(mediaId, user) {
  const media = await mediaRepository.findById(mediaId);
  const who = typeof user === 'string' ? { id: user } : user;
  if (!canView(media, who)) {
    throw createHttpError(404, 'NOT_FOUND', 'Фильм не найден');
  }
  return media;
}
