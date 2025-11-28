import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplicationFile, getApplication } from '$lib/storage/index.js';
import { requireValidUUID, getContentTypeFromFilename, handleStorageError } from '$lib/api/index.js';

/**
 * GET /api/applications/:id/file - Получение файла заявки
 */
export const GET: RequestHandler = async ({ params }: { params: { id: string } }) => {
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
			return error(404, { message: 'Заявка не найдена' });
		}

		// Получаем файл
		const fileData = getApplicationFile(id);

		if (!fileData) {
			return error(404, { message: 'Файл заявки не найден' });
		}

		// Определяем Content-Type
		const contentType = getContentTypeFromFilename(fileData.filename);

		// Конвертируем Buffer в Uint8Array для Response
		// Buffer в Node.js является подклассом Uint8Array, но для совместимости с Web API используем явное преобразование
		const uint8Array = new Uint8Array(fileData.buffer);

		// Возвращаем файл
		return new Response(uint8Array, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': `attachment; filename="${application.originalFilename}"`
			}
		});
	} catch (err) {
		return handleStorageError(err);
	}
};

