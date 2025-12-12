import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getApplication, getTechnicalSpec } from '$lib/storage/index.js';
import { requireValidUUID, handleStorageError } from '$lib/api/utils.js';
import { err, ok } from 'neverthrow';

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

	// Проверяем существование заявки
	const applicationResult = getApplication(id);
	if (applicationResult.isErr()) {
		return json({ error: 'Заявка не найдена' }, { status: 404 });
	}

	// Проверяем существование технического условия
	const technicalSpecResult = getTechnicalSpec(body.technicalSpecId);
	if (technicalSpecResult.isErr()) {
		return json({ error: 'Техническое условие не найдено' }, { status: 404 });
	}

	// TODO: Реализовать processAbbreviationResolve в processing.ts
	// Пока возвращаем успех
	return json({ success: true, message: 'Abbreviation resolution not yet implemented' });
};

