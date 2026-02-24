import { Effect, Schedule, Duration, pipe } from 'effect';

/**
 * Fetch с таймаутом и retry логикой для стабильной работы с внешними API
 */

/**
 * Проверяет, является ли ошибка сетевой (fetch failed, timeout и т.д.)
 */
function isNetworkError(error: unknown): boolean {
	return (
		error instanceof TypeError ||
		error instanceof DOMException ||
		(error instanceof Error &&
			(
				error.message.includes('fetch') ||
				error.message.includes('network') ||
				error.message.includes('timeout') ||
				error.message.includes('aborted')
			))
	);
}

/**
 * Выполняет fetch запрос с таймаутом и автоматическим retry при сетевых ошибках
 *
 * @param url - URL для запроса
 * @param options - Опции для fetch (method, headers, body и т.д.)
 * @param timeout - Таймаут в миллисекундах (по умолчанию 30000 = 30 секунд)
 * @param maxRetries - Максимальное количество попыток (по умолчанию 2, итого 3 запроса)
 * @param retryDelay - Задержка между попытками в миллисекундах (по умолчанию 1000 = 1 секунда)
 * @returns Effect, содержащий Response при успехе или Error при ошибке
 */
export function fetchStable(
	url: string,
	options: RequestInit,
	timeout: number = 30000,
	maxRetries: number = 2,
	retryDelay: number = 1000
): Effect.Effect<Response, Error> {
	const fetchEffect = Effect.tryPromise({
		try: async () => {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeout);

			try {
				const response = await fetch(url, {
					...options,
					signal: controller.signal
				});
				return response;
			} finally {
				clearTimeout(timeoutId);
			}
		},
		catch: (error) => (error instanceof Error ? error : new Error(String(error)))
	});

	// Создаем расписание с экспоненциальной задержкой и ограничением количества попыток
	const retrySchedule = pipe(
		Schedule.exponential(Duration.millis(retryDelay)),
		Schedule.compose(Schedule.recurs(maxRetries))
	);

	// Применяем retry только для сетевых ошибок
	return pipe(
		fetchEffect,
		Effect.retry({
			schedule: retrySchedule,
			while: (error) => isNetworkError(error)
		})
	);
}



/**
 * Обертка над fetchStable для работы с JSON API
 * Обрабатывает сетевые ошибки, проверяет HTTP статус и парсит JSON
 */
export const fetchJson = (url: string, options: RequestInit = {}): Effect.Effect<any, Error> =>
	Effect.gen(function* () {
		const response = yield* fetchStable(url, options);

		if (!response.ok) {
			yield* Effect.fail(new Error(`HTTP ${response.status}: ${response.statusText}: ${response.body}`));
		}

		const data = yield* Effect.tryPromise({
			try: () => response.json(),
			catch: () => new Error(`Failed to parse JSON: ${response.body}`)
		});

		return data;
	});
