import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { purgeApplication } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { Effect } from 'effect';

/**
 * POST /api/applications/:id/purge - Полное удаление заявки (hard delete)
 */
export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError) return uuidError;

	const success = await Effect.runPromise(purgeApplication(id)).catch((error) =>
		handleStorageError(error)
	);

	if (success instanceof Response) {
		return success;
	}

	return json({ success, id });
};

