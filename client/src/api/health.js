/**
 * Проверка доступности API (через Vite proxy → Express).
 * 503 при «degraded» тоже считаем ответом API — смотрим поле status.
 */
export async function fetchHealth() {
  const response = await fetch('/api/v1/health');
  const body = await response.json().catch(() => null);
  if (!body) {
    throw new Error('Health check failed');
  }
  return body;
}
