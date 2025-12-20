import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getTechnicalSpec } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { Effect } from 'effect';

/**
 * POST /api/applications/:id/resolve-abbreviation - Формирование аббревиатуры продукции
 *
 * Формирует аббревиатуру продукции на основе параметров из заявки и технических условий.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

	// Валидация UUID
	const uuidError = requireValidUUID(id);
	if (uuidError)
		return uuidError;

	// Парсим тело запроса
	let body: { technicalSpecId?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Неверный формат JSON в теле запроса' }, { status: 400 });
	}

	// Валидация technicalSpecId
	if (!body.technicalSpecId || typeof body.technicalSpecId !== 'string') {
		return json(
			{ error: 'Отсутствует или неверный параметр technicalSpecId' },
			{ status: 400 }
		);
	}

	const result = await Effect.runPromise(
		Effect.gen(function* () {
			// Проверяем существование заявки
			yield* getApplication(id);
			// Проверяем существование технического условия
			yield* getTechnicalSpec(body.technicalSpecId);
		})
	).catch((error) => handleStorageError(error));
	
	if (result instanceof Response) {
		return result;
	}

	// TODO: Реализовать processAbbreviationResolve в processing.ts
	// Пока возвращаем успех
	return json({ success: true, message: 'Abbreviation resolution not yet implemented' });
};

