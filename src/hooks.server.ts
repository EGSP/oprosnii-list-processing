/**
 * Server hooks для SvelteKit
 *
 * Выполняет инициализацию и проверку конфигурации при старте приложения
 */

import type { Handle } from '@sveltejs/kit';
import { validateAIConfig } from '$lib/ai/index.js';
import { logger } from '$lib/utils/logger.js';

// Флаг для проверки конфигурации (выполняется один раз)
let configValidated = false;

export const handle: Handle = async ({ event, resolve }) => {
	// Проверяем конфигурацию AI при первом запросе
	if (!configValidated) {
		try {
			validateAIConfig();
			logger.info('Конфигурация AI успешно проверена');
			configValidated = true;
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: 'Неизвестная ошибка при проверке конфигурации AI';
			logger.error('Ошибка конфигурации AI при старте приложения', {
				error: errorMessage,
				stack: error instanceof Error ? error.stack : undefined
			});
			// Не блокируем запрос, но логируем ошибку
			// Ошибка будет выброшена при первом использовании AI сервисов
		}
	}

	return resolve(event);
};

