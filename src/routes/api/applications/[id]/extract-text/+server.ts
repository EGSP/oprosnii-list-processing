import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { processTextExtraction } from '$lib/business/processing.js';

/**
 * POST /api/applications/:id/extract-text - Извлечение текста из файла заявки
 *
 * Извлекает текст из файла заявки с использованием OCR или других методов.
 */
export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError)
		return uuidError;

	const result = await getApplication(id)
		.asyncAndThen((application) => processTextExtraction(application.id))
		.map(() => ({ success: true }))
		.mapErr((error) => ({ error: error.message }))
		.match(
			(success) => json(success),
			(error) => handleStorageError(new Error(error.error || 'Failed to extract text'))
		);

	return result;
};

