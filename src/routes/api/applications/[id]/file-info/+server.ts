import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getFileInfo } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { Effect } from 'effect';

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

	const fileInfo = await Effect.runPromise(
		Effect.gen(function* () {
			// Проверяем существование заявки
			yield* getApplication(id);
			// Получаем информацию о файле
			return yield* getFileInfo(id);
		})
	).catch((error) => handleStorageError(error));
	
	if (fileInfo instanceof Response) {
		return fileInfo;
	}
	
	// Возвращаем информацию о файле
	return json({
		name: fileInfo.name,
		type: fileInfo.type,
		extension: fileInfo.extension,
		pageCount: fileInfo.pageCount,
		extractedText: fileInfo.extractedText
	});
};

