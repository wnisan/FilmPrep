/**
 * Создаёт HTTP-ошибку с полями status и code для errorHandler.
 */
export function createHttpError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}
