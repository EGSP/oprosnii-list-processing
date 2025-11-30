/**
 * Бизнес-логика обработки заявок
 *
 * Функции для определения типа изделия и формирования аббревиатуры
 * с использованием OCR и LLM сервисов.
 */

import {
	extractTextFromFileWithOperation,
	checkYandexOCROperation,
	OCRError
} from '../ai/index.js';
import { callYandexGPTStructured, LLMError } from '../ai/index.js';
import {
	ProductTypeSchema,
	AbbreviationParametersSchema,
	validateParametersAgainstTU,
	generateAbbreviation,
	type ProductTypeResult,
	type AbbreviationParameter
} from './schemas.js';
import {
	getApplication,
	updateApplication,
	getApplicationFile,
	getTechnicalSpec,
	getOperation,
	getOperationByApplicationAndType,
	updateOperationStatus,
	checkAndUpdateOperation
} from '../storage/index.js';
import type { ProcessingOperation } from '../storage/types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export class ProcessingError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'ProcessingError';
	}
}

/**
 * Определяет MIME тип по расширению файла
 */
function getMimeTypeFromFilename(filename: string): string {
	const extension = filename.split('.').pop()?.toLowerCase();

	switch (extension) {
		case 'pdf':
			return 'application/pdf';
		case 'docx':
			return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
		case 'xlsx':
			return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		default:
			return 'application/octet-stream';
	}
}

/**
 * Ограничивает текст до указанной длины
 */
function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return text.substring(0, maxLength);
}

/**
 * Определяет тип изделия из заявки
 *
 * 1. Получает файл заявки из storage
 * 2. Извлекает текст через OCR (с использованием операций)
 * 3. Вызывает LLM для определения типа изделия (с использованием операций)
 * 4. Сохраняет результаты в БД
 * 5. Возвращает структурированный результат и ID операций
 *
 * @param applicationId - GUID заявки
 * @returns Результат определения типа изделия и ID операций
 */
export async function detectProductType(applicationId: string): Promise<{
	result: ProductTypeResult;
	ocrOperationId?: string;
	llmOperationId?: string;
}> {
	logger.info('Начало определения типа изделия', { applicationId });

	// Получаем заявку
	const application = getApplication(applicationId);
	if (!application) {
		logger.error('Заявка не найдена при определении типа изделия', { applicationId });
		throw new ProcessingError(`Заявка ${applicationId} не найдена`);
	}

	// Устанавливаем дату начала обработки
	if (!application.processingStartDate) {
		updateApplication(applicationId, {
			processingStartDate: new Date().toISOString()
		});
	}

	let extractedText: string;
	let ocrOperationId: string | undefined;

	// Проверяем, есть ли уже завершенная OCR операция
	const existingOCROperation = getOperationByApplicationAndType(applicationId, 'ocr');
	if (
		existingOCROperation &&
		existingOCROperation.status === 'completed' &&
		existingOCROperation.result
	) {
		const result = existingOCROperation.result as { text?: string };
		if (result.text) {
			// Используем результат из операции
			extractedText = result.text;
			ocrOperationId = existingOCROperation.id;
		}
	}

	// Если текста нет, извлекаем через операцию
	if (!extractedText) {
		logger.info('Извлечение текста из файла', { applicationId });
		const fileData = getApplicationFile(applicationId);
		if (!fileData) {
			logger.error('Файл заявки не найден', { applicationId });
			throw new ProcessingError(`Файл заявки ${applicationId} не найден`);
		}

		const mimeType = getMimeTypeFromFilename(fileData.filename);
		try {
			const ocrResult = await extractTextFromFileWithOperation(
				applicationId,
				fileData.buffer,
				mimeType,
				fileData.filename
			);

			if (ocrResult.operationId) {
				// Асинхронная операция - возвращаем ID операции
				ocrOperationId = ocrResult.operationId;
				logger.info('OCR операция асинхронная', { applicationId, ocrOperationId });
				throw new ProcessingError(
					'OCR операция асинхронная. Используйте checkAndUpdateOperation для проверки статуса.'
				);
			} else if (ocrResult.text) {
				// Синхронная операция завершена
				extractedText = ocrResult.text;
				const ocrOperation = getOperationByApplicationAndType(applicationId, 'ocr');
				ocrOperationId = ocrOperation?.id;
				logger.info('Текст успешно извлечен из файла', {
					applicationId,
					ocrOperationId,
					textLength: extractedText.length
				});
			} else {
				logger.error('Не удалось извлечь текст из файла', { applicationId });
				throw new ProcessingError('Не удалось извлечь текст из файла');
			}
		} catch (error) {
			if (error instanceof ProcessingError) {
				throw error;
			}
			if (error instanceof OCRError) {
				logger.error('Ошибка OCR при извлечении текста', {
					applicationId,
					message: error.message,
					stack: error.stack
				});
				throw new ProcessingError(`Ошибка OCR: ${error.message}`, error);
			}
			logger.error('Неожиданная ошибка при извлечении текста', {
				applicationId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			throw new ProcessingError('Ошибка при извлечении текста из файла', error as Error);
		}
	}

	// Ограничиваем текст для LLM
	const limitedText = truncateText(extractedText, config.maxTextLengthForLLM);

	// Формируем промпт для определения типа изделия
	const prompt = `Проанализируй следующий текст из технической заявки и определи тип изделия.

Текст заявки:
${limitedText}

Определи тип изделия на основе информации в тексте. Верни результат в формате JSON с полями:
- type: строка с типом изделия
- confidence: число от 0 до 1 (уровень уверенности)
- reasoning: строка с обоснованием выбора типа

ВАЖНО: Не придумывай параметры, извлекай только то, что есть в тексте.`;

	const systemPrompt =
		'Ты эксперт по анализу технических заявок. Твоя задача - определить тип изделия на основе текста заявки.';

	try {
		logger.info('Вызов LLM для определения типа изделия', {
			applicationId,
			textLength: limitedText.length
		});

		// Вызываем LLM с structured output и созданием операции
		const productTypeResult = await callYandexGPTStructured(
			prompt,
			ProductTypeSchema,
			systemPrompt,
			{ temperature: 0.3 },
			2,
			{
				applicationId,
				type: 'llm_product_type'
			}
		);

		// Получаем ID операции LLM
		const llmOperation = getOperationByApplicationAndType(applicationId, 'llm_product_type');
		const llmOperationId = llmOperation?.id;

		logger.info('Тип изделия определен LLM', {
			applicationId,
			productType: productTypeResult.type,
			confidence: productTypeResult.confidence,
			llmOperationId
		});

		// Сохраняем результат в БД заявки (для обратной совместимости)
		updateApplication(applicationId, {
			productType: productTypeResult.type,
			llmProductTypeResult: productTypeResult
		});

		return {
			result: productTypeResult,
			ocrOperationId,
			llmOperationId
		};
	} catch (error) {
		if (error instanceof LLMError) {
			logger.error('Ошибка LLM при определении типа изделия', {
				applicationId,
				message: error.message,
				cause: error.cause?.message,
				stack: error.stack
			});
			throw new ProcessingError(`Ошибка LLM: ${error.message}`, error);
		}
		logger.error('Неожиданная ошибка при определении типа изделия', {
			applicationId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new ProcessingError('Ошибка при определении типа изделия', error as Error);
	}
}

/**
 * Формирует аббревиатуру продукции на основе параметров из заявки и ТУ
 *
 * 1. Получает заявку и ТУ из storage
 * 2. Получает текст (из OCR операции или повторное извлечение)
 * 3. Ограничивает текст до 6000 символов
 * 4. Формирует промпт с учетом ТУ
 * 5. Вызывает LLM для извлечения параметров (structured output с операцией)
 * 6. Валидирует параметры по правилам ТУ
 * 7. Формирует аббревиатуру по шаблону из ТУ
 * 8. Сохраняет результаты в БД
 *
 * @param applicationId - GUID заявки
 * @param technicalSpecId - ID технического условия
 * @returns Результат формирования аббревиатуры и ID операций
 */
export async function generateAbbreviation(
	applicationId: string,
	technicalSpecId: string
): Promise<{
	parameters: AbbreviationParameter[];
	abbreviation: string;
	ocrOperationId?: string;
	llmOperationId?: string;
}> {
	logger.info('Начало формирования аббревиатуры', { applicationId, technicalSpecId });

	// Получаем заявку
	const application = getApplication(applicationId);
	if (!application) {
		logger.error('Заявка не найдена при формировании аббревиатуры', { applicationId });
		throw new ProcessingError(`Заявка ${applicationId} не найдена`);
	}

	// Получаем техническое условие
	const technicalSpec = getTechnicalSpec(technicalSpecId);
	if (!technicalSpec) {
		logger.error('Техническое условие не найдено', { applicationId, technicalSpecId });
		throw new ProcessingError(`Техническое условие ${technicalSpecId} не найдено`);
	}

	// Получаем текст из OCR операции
	let extractedText: string;
	let ocrOperationId: string | undefined;

	const existingOCROperation = getOperationByApplicationAndType(applicationId, 'ocr');
	if (
		existingOCROperation &&
		existingOCROperation.status === 'completed' &&
		existingOCROperation.result
	) {
		const result = existingOCROperation.result as { text?: string };
		if (result.text) {
			extractedText = result.text;
			ocrOperationId = existingOCROperation.id;
		}
	}

	// Если текста нет, извлекаем через операцию
	if (!extractedText) {
		logger.info('Извлечение текста из файла для формирования аббревиатуры', {
			applicationId,
			technicalSpecId
		});
		const fileData = getApplicationFile(applicationId);
		if (!fileData) {
			logger.error('Файл заявки не найден', { applicationId });
			throw new ProcessingError(`Файл заявки ${applicationId} не найден`);
		}

		const mimeType = getMimeTypeFromFilename(fileData.filename);
		try {
			const ocrResult = await extractTextFromFileWithOperation(
				applicationId,
				fileData.buffer,
				mimeType,
				fileData.filename
			);

			if (ocrResult.operationId) {
				// Асинхронная операция
				ocrOperationId = ocrResult.operationId;
				logger.info('OCR операция асинхронная', { applicationId, ocrOperationId });
				throw new ProcessingError(
					'OCR операция асинхронная. Используйте checkAndUpdateOperation для проверки статуса.'
				);
			} else if (ocrResult.text) {
				extractedText = ocrResult.text;
				const ocrOperation = getOperationByApplicationAndType(applicationId, 'ocr');
				ocrOperationId = ocrOperation?.id;
				logger.info('Текст успешно извлечен для формирования аббревиатуры', {
					applicationId,
					ocrOperationId,
					textLength: extractedText.length
				});
			} else {
				logger.error('Не удалось извлечь текст из файла', { applicationId });
				throw new ProcessingError('Не удалось извлечь текст из файла');
			}
		} catch (error) {
			if (error instanceof ProcessingError) {
				throw error;
			}
			if (error instanceof OCRError) {
				logger.error('Ошибка OCR при извлечении текста', {
					applicationId,
					message: error.message,
					stack: error.stack
				});
				throw new ProcessingError(`Ошибка OCR: ${error.message}`, error);
			}
			logger.error('Неожиданная ошибка при извлечении текста', {
				applicationId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			throw new ProcessingError('Ошибка при извлечении текста из файла', error as Error);
		}
	}

	// Ограничиваем текст для LLM
	const limitedText = truncateText(extractedText, config.maxTextLengthForLLM);

	// Формируем описание правил ТУ для промпта
	const rulesDescription = technicalSpec.rules
		.map((rule) => `- ${rule.parameter}: код "${rule.code}" - ${rule.description}`)
		.join('\n');

	// Формируем промпт для извлечения параметров
	const prompt = `Проанализируй следующий текст из технической заявки и извлеки параметры для формирования аббревиатуры продукции.

Текст заявки:
${limitedText}

Технические условия (ТУ):
${technicalSpec.name}
${technicalSpec.description || ''}

Правила формирования аббревиатуры:
${rulesDescription}

Шаблон аббревиатуры: ${technicalSpec.abbreviationTemplate}

Извлеки из текста значения для каждого параметра из правил ТУ. Для каждого параметра верни:
- parameter: название параметра
- value: значение, найденное в тексте
- code: код из ТУ, если значение соответствует описанию правила
- confidence: уровень уверенности (0-1)

ВАЖНО: 
- Не придумывай параметры, извлекай только то, что есть в тексте
- Если значение не найдено в тексте, не включай параметр в результат
- Сопоставляй найденные значения с описаниями правил ТУ для определения кодов`;

	const systemPrompt =
		'Ты эксперт по анализу технических заявок. Твоя задача - извлечь параметры продукции из текста заявки с учетом технических условий.';

	try {
		logger.info('Вызов LLM для извлечения параметров аббревиатуры', {
			applicationId,
			technicalSpecId,
			textLength: limitedText.length,
			rulesCount: technicalSpec.rules.length
		});

		// Вызываем LLM с structured output и созданием операции
		const parametersResult = await callYandexGPTStructured(
			prompt,
			AbbreviationParametersSchema,
			systemPrompt,
			{ temperature: 0.3 },
			2,
			{
				applicationId,
				type: 'llm_abbreviation'
			}
		);

		// Получаем ID операции LLM
		const llmOperation = getOperationByApplicationAndType(applicationId, 'llm_abbreviation');
		const llmOperationId = llmOperation?.id;

		logger.info('Параметры извлечены LLM', {
			applicationId,
			parametersCount: parametersResult.parameters.length,
			llmOperationId
		});

		// Валидируем параметры по правилам ТУ
		const validatedParameters = validateParametersAgainstTU(
			parametersResult.parameters,
			technicalSpec
		);

		logger.info('Параметры валидированы по ТУ', {
			applicationId,
			validatedParametersCount: validatedParameters.length
		});

		// Формируем аббревиатуру по шаблону
		const abbreviation = generateAbbreviation(
			validatedParameters,
			technicalSpec.abbreviationTemplate
		);

		logger.info('Аббревиатура сформирована', {
			applicationId,
			abbreviation,
			technicalSpecId
		});

		// Сохраняем результат в БД заявки (для обратной совместимости)
		const result = {
			parameters: validatedParameters,
			abbreviation,
			technicalSpecId,
			generatedAt: new Date().toISOString()
		};

		updateApplication(applicationId, {
			llmAbbreviationResult: result,
			processingEndDate: new Date().toISOString()
		});

		return {
			parameters: validatedParameters,
			abbreviation,
			ocrOperationId,
			llmOperationId
		};
	} catch (error) {
		if (error instanceof LLMError) {
			logger.error('Ошибка LLM при формировании аббревиатуры', {
				applicationId,
				technicalSpecId,
				message: error.message,
				cause: error.cause?.message,
				stack: error.stack
			});
			throw new ProcessingError(`Ошибка LLM: ${error.message}`, error);
		}
		logger.error('Неожиданная ошибка при формировании аббревиатуры', {
			applicationId,
			technicalSpecId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new ProcessingError('Ошибка при формировании аббревиатуры', error as Error);
	}
}

/**
 * Получает статус операции обработки
 */
export function getOperationStatus(operationId: string): ProcessingOperation | null {
	return getOperation(operationId);
}

/**
 * Проверяет и обновляет статус асинхронной операции
 * Для OCR операций проверяет статус у внешнего сервиса
 */
export async function checkAndUpdateOperation(
	operationId: string
): Promise<ProcessingOperation | null> {
	logger.debug('Проверка статуса операции', { operationId });

	const operation = getOperation(operationId);
	if (!operation) {
		logger.warn('Операция не найдена', { operationId });
		return null;
	}

	// Если операция уже завершена или не имеет externalOperationId, возвращаем как есть
	if (
		operation.status === 'completed' ||
		operation.status === 'failed' ||
		!operation.externalOperationId
	) {
		return operation;
	}

	// Проверяем статус только для OCR операций от Yandex
	if (
		operation.type === 'ocr' &&
		operation.provider === 'yandex' &&
		operation.externalOperationId
	) {
		try {
			logger.debug('Проверка статуса YandexOCR операции', {
				operationId,
				externalOperationId: operation.externalOperationId
			});

			const checkResult = await checkYandexOCROperation(operation.externalOperationId);

			if (checkResult.done) {
				if (checkResult.text) {
					// Операция завершена успешно
					logger.info('YandexOCR операция завершена успешно', {
						operationId,
						textLength: checkResult.text.length
					});
					updateOperationStatus(operationId, 'completed', {
						result: { text: checkResult.text }
					});
				} else if (checkResult.error) {
					// Операция завершена с ошибкой
					logger.error('YandexOCR операция завершена с ошибкой', {
						operationId,
						error: checkResult.error
					});
					updateOperationStatus(operationId, 'failed', {
						error: { message: checkResult.error }
					});
				}
			} else {
				logger.debug('YandexOCR операция еще выполняется', { operationId });
			}
			// Если done === false, операция еще выполняется, статус не меняем

			return getOperation(operationId);
		} catch (error) {
			// Ошибка при проверке статуса
			logger.error('Ошибка при проверке статуса YandexOCR операции', {
				operationId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			updateOperationStatus(operationId, 'failed', {
				error: {
					message: error instanceof Error ? error.message : 'Unknown error',
					details: error
				}
			});
			return getOperation(operationId);
		}
	}

	// Для других типов операций просто возвращаем текущий статус
	return operation;
}
