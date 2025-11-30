import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getFileInfo } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/index.js';
import { logger } from '$lib/utils/logger.js';

/**
 * GET /api/applications/:id/file-info - Получение информации о файле заявки
 *
 * Возвращает информацию о файле заявки (без содержимого файла).
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	try {
		logger.info('Получение информации о файле заявки', { applicationId: id });

		// Валидация UUID
		const uuidError = requireValidUUID(id);
		if (uuidError) {
			logger.warn('Неверный формат UUID', { applicationId: id });
			return uuidError;
		}

		// Проверяем существование заявки
		const application = getApplication(id);
		if (!application) {
			logger.warn('Заявка не найдена', { applicationId: id });
			return json({ error: 'Заявка не найдена' }, { status: 404 });
		}

		// Получаем информацию о файле
		const fileInfo = await getFileInfo(id);
		if (!fileInfo) {
			logger.warn('Файл заявки не найден', { applicationId: id });
			return json({ error: 'Файл заявки не найден' }, { status: 404 });
		}

		// Возвращаем информацию о файле без buffer
		const response = {
			filename: fileInfo.filename,
			mimeType: fileInfo.mimeType,
			fileType: fileInfo.fileType,
			pageCount: fileInfo.pageCount,
			size: fileInfo.size,
			extractedText: fileInfo.extractedText
		};

		logger.info('Информация о файле успешно получена', {
			applicationId: id,
			filename: fileInfo.filename,
			fileType: fileInfo.fileType,
			pageCount: fileInfo.pageCount,
			size: fileInfo.size
		});

		return json(response);
	} catch (err) {
		// Обработка ошибок хранилища
		logger.error('Неожиданная ошибка при получении информации о файле', {
			applicationId: id,
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined
		});
		return handleStorageError(err);
	}
};

