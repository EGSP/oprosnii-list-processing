import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, notImplemented, handleStorageError } from '$lib/api/index.js';

/**
 * POST /api/applications/:id/detect-product-type - Определение типа изделия
 * 
 * ⚠️ Заглушка: возвращает 501 Not Implemented
 */
export const POST: RequestHandler = async ({ params }) => {
	try {
		const { id } = params;

		// Валидация UUID
		const uuidError = requireValidUUID(id);
		if (uuidError) {
			return uuidError;
		}

		// Проверяем существование заявки
		const application = getApplication(id);
		if (!application) {
			return json({ error: 'Заявка не найдена' }, { status: 404 });
		}

		// Возвращаем ошибку "не реализовано"
		return notImplemented(
			'OCR и LLM сервисы не настроены. Функция будет доступна после настройки внешних сервисов.'
		);
	} catch (err) {
		return handleStorageError(err);
	}
};

