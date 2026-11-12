const MESSAGES_BY_CODE = {
  VALIDATION_ERROR: 'Проверьте введённые данные',
  NOT_FOUND: 'Не найдено',
  UNAUTHORIZED: 'Сессия истекла, войдите снова',
  FORBIDDEN: 'Недостаточно прав',
  EMAIL_TAKEN: 'Этот email уже зарегистрирован',
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  INVALID_FILE: 'Неподходящий формат файла',
  NO_FILE: 'Выберите файл',
  NO_SUBTITLES: 'Сначала загрузите субтитры',
  QUIZ_NOT_READY: 'Тест пока недоступен',
  GOOGLE_NOT_CONFIGURED: 'Вход через Google не настроен',
  GOOGLE_TOKEN_ERROR: 'Не удалось войти через Google',
  GOOGLE_PROFILE_ERROR: 'Не удалось получить профиль Google',
  GOOGLE_USER_ERROR: 'Не удалось создать аккаунт через Google',
  EMAIL_NOT_VERIFIED: 'Email в Google не подтверждён',
  MISSING_CODE: 'Не удалось войти через Google',
  USERNAME_TAKEN: 'Этот никнейм уже занят',
  USER_NOT_FOUND: 'Пользователь не найден',
  WRONG_PASSWORD: 'Текущий пароль указан неверно',
  FILE_TOO_LARGE: 'Файл слишком большой',
  TOO_FAST: 'Не так быстро — подождите пару секунд',
};

/** Server messages are English; show Russian by error code, keep already-Russian text as is. */
export function toRussianMessage(code, serverMessage) {
  if (serverMessage && /[а-яё]/i.test(serverMessage)) return serverMessage;
  return MESSAGES_BY_CODE[code] || 'Что-то пошло не так, попробуйте ещё раз';
}
