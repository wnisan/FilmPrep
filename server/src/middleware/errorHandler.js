/**
 * Единый формат ошибок API: { error: { code, message } }
 */
export function errorHandler(err, _req, res, _next) {
  if (err.name === 'MulterError') {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_FILE',
        message: tooLarge ? 'Файл слишком большой' : 'Не удалось принять файл',
      },
    });
    return;
  }

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: { code, message } });
}
