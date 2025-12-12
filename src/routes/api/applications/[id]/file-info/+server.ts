import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getFileInfo } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';

/**
 * GET /api/applications/:id/file-info - Получение информации о файле заявки
 *
 * Возвращает информацию о файле заявки (без содержимого файла).
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError)
		return uuidError;

	// Проверяем существование заявки
	const applicationResult = getApplication(id);
	if (applicationResult.isErr()) {
		return json({ error: 'Заявка не найдена' }, { status: 404 });
	}

	// Получаем информацию о файле
	const fileInfoResult = await getFileInfo(id);
	if (fileInfoResult.isErr()) {
		return handleStorageError(fileInfoResult.error);
	}

	const fileInfo = fileInfoResult.value;
	
	// Возвращаем информацию о файле
	return json({
		name: fileInfo.name,
		type: fileInfo.type,
		extension: fileInfo.extension,
		pageCount: fileInfo.pageCount,
		extractedText: fileInfo.extractedText
	});
};

