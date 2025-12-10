// import { json } from '@sveltejs/kit';
// import type { RequestHandler } from './$types.js';
// import { getApplication, getTechnicalSpec } from '$lib/storage/index.js';
// import { requireValidUUID, handleStorageError } from '$lib/api/index.js';
// import type { GenerateAbbreviationRequest } from '$lib/api/types.js';
// import { generateAbbreviation, ProcessingError } from '$lib/business/processing.js';
// import { logger } from '$lib/utils/logger.js';

// /**
//  * POST /api/applications/:id/generate-abbreviation - Формирование аббревиатуры
//  *
//  * Формирует аббревиатуру продукции на основе параметров из заявки и технических условий.
//  */
// export const POST: RequestHandler = async ({ params, request }) => {
// 	const { id } = params;

// 	try {
// 		logger.info('Начало формирования аббревиатуры', { applicationId: id });

// 		// Валидация UUID
// 		const uuidError = requireValidUUID(id);
// 		if (uuidError) {
// 			logger.warn('Неверный формат UUID', { applicationId: id });
// 			return uuidError;
// 		}

// 		// Проверяем существование заявки
// 		const application = getApplication(id);
// 		if (!application) {
// 			logger.warn('Заявка не найдена', { applicationId: id });
// 			return json({ error: 'Заявка не найдена' }, { status: 404 });
// 		}

// 		// Парсим тело запроса
// 		let body: GenerateAbbreviationRequest;
// 		try {
// 			body = await request.json();
// 		} catch {
// 			logger.warn('Неверный формат JSON в теле запроса', { applicationId: id });
// 			return json({ error: 'Неверный формат JSON в теле запроса' }, { status: 400 });
// 		}

// 		// Валидация technicalSpecId
// 		if (!body.technicalSpecId || typeof body.technicalSpecId !== 'string') {
// 			logger.warn('Отсутствует или неверный параметр technicalSpecId', {
// 				applicationId: id,
// 				technicalSpecId: body.technicalSpecId
// 			});
// 			return json(
// 				{
// 					error: 'Отсутствует или неверный параметр technicalSpecId'
// 				},
// 				{ status: 400 }
// 			);
// 		}

// 		// Проверяем существование технического условия
// 		const technicalSpec = getTechnicalSpec(body.technicalSpecId);
// 		if (!technicalSpec) {
// 			logger.warn('Техническое условие не найдено', {
// 				applicationId: id,
// 				technicalSpecId: body.technicalSpecId
// 			});
// 			return json({ error: 'Техническое условие не найдено' }, { status: 404 });
// 		}

// 		// Формируем аббревиатуру
// 		const result = await generateAbbreviation(id, body.technicalSpecId);

// 		logger.info('Аббревиатура успешно сформирована', {
// 			applicationId: id,
// 			technicalSpecId: body.technicalSpecId,
// 			abbreviation: result.abbreviation,
// 			parametersCount: result.parameters.length,
// 			ocrOperationId: result.ocrOperationId,
// 			llmOperationId: result.llmOperationId
// 		});

// 		// Возвращаем результат с ID операций
// 		return json({
// 			parameters: result.parameters,
// 			abbreviation: result.abbreviation,
// 			operations: {
// 				ocr: result.ocrOperationId,
// 				llm: result.llmOperationId
// 			}
// 		});
// 	} catch (err) {
// 		// Обработка ошибок обработки
// 		if (err instanceof ProcessingError) {
// 			logger.error('Ошибка при формировании аббревиатуры', {
// 				applicationId: id,
// 				message: err.message,
// 				details: err.cause?.message,
// 				stack: err.cause?.stack || err.stack
// 			});
// 			return json(
// 				{
// 					error: err.message,
// 					details: err.cause?.message
// 				},
// 				{ status: 500 }
// 			);
// 		}

// 		// Обработка ошибок хранилища
// 		logger.error('Неожиданная ошибка при формировании аббревиатуры', {
// 			applicationId: id,
// 			error: err instanceof Error ? err.message : String(err),
// 			stack: err instanceof Error ? err.stack : undefined
// 		});
// 		return handleStorageError(err);
// 	}
// };
