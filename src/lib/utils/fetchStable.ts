/**
 * Fetch с таймаутом и retry логикой для стабильной работы с внешними API
 */

/**
 * Выполняет fetch запрос с таймаутом и автоматическим retry при сетевых ошибках
 *
 * @param url - URL для запроса
 * @param options - Опции для fetch (method, headers, body и т.д.)
 * @param timeout - Таймаут в миллисекундах (по умолчанию 30000 = 30 секунд)
 * @param maxRetries - Максимальное количество попыток (по умолчанию 2, итого 3 запроса)
 * @param retryDelay - Задержка между попытками в миллисекундах (по умолчанию 1000 = 1 секунда)
 * @returns Promise с Response
 */
export async function fetchStable(
	url: string,
	options: RequestInit,
	timeout: number = 30000,
	maxRetries: number = 2,
	retryDelay: number = 1000
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		let timeoutId: NodeJS.Timeout | null = null;

		try {
			// Создаем AbortController для таймаута
			const controller = new AbortController();
			timeoutId = setTimeout(() => controller.abort(), timeout);

			// Выполняем запрос с таймаутом
			const response = await fetch(url, {
				...options,
				signal: controller.signal
			});

			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			return response;
		} catch (error) {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			// Проверяем, является ли ошибка сетевой (fetch failed, timeout и т.д.)
			const isNetworkError =
				error instanceof TypeError ||
				error instanceof DOMException ||
				(error instanceof Error &&
					(error.message.includes('fetch') ||
						error.message.includes('network') ||
						error.message.includes('timeout') ||
						error.message.includes('aborted')));

			lastError = error as Error;

			// Если это не сетевая ошибка или последняя попытка - выбрасываем ошибку
			if (!isNetworkError || attempt === maxRetries) {
				throw error;
			}

			// Ждем перед следующей попыткой (экспоненциальная задержка)
			await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
		}
	}

	throw lastError || new Error('Неизвестная ошибка при выполнении fetch запроса');
}

