/**
 * Бизнес-логика обработки заявок
 *
 * Функции для определения типа изделия и формирования аббревиатуры
 * с использованием OCR и LLM сервисов.
 */

import {
	extractText,
	checkOCROperation,
	OCRError
} from '../ai/index.js';
import { callYandexGPTStructured, LLMError } from '../ai/index.js';
import {
	ProductTypeSchema,
	AbbreviationParametersSchema,
	validateParametersAgainstTU,
	generateAbbreviation as generateAbbreviationFromSchema,
	type ProductTypeResult,
	type AbbreviationParameter
} from './schemas.js';
import {
	getApplication,
	updateApplication,
	getFileInfo,
	getTechnicalSpec,
	getOperation,
	getOperationByApplicationAndType
} from '../storage/index.js';
import type { ProcessingOperation, TechnicalSpec } from './types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { err } from 'neverthrow';

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
 * Ограничивает текст до указанной длины
 */
function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	return text.substring(0, maxLength);
}

export async function extractText(applicationId: string): Promise<Result<ProcessingOperation, Error>> {

	const applicationResult =await getApplication(applicationId);
	if (applicationResult.isErr()) {
		return err(applicationResult.error);
	}
	const application = applicationResult.value;

	const fileInfoResult = await getFileInfo(applicationId);
	if (fileInfoResult.isErr()) {
		return err(fileInfoResult.error);
	}
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
	const applicationResult = getApplication(applicationId);
	if (applicationResult.isErr()) {
		logger.error('Заявка не найдена при определении типа изделия', { applicationId, error: applicationResult.error });
		throw new ProcessingError(`Заявка ${applicationId} не найдена`);
	}
	const application = applicationResult.value;

	let extractedText: string | undefined;
	let ocrOperationId: string | undefined;

	// Получаем информацию о файле (включая уже извлеченный текст, если есть)
	logger.info('Получение информации о файле', { applicationId });
	const fileInfo = await getFileInfo(applicationId);
	if (!fileInfo) {
		logger.error('Файл заявки не найден', { applicationId });
		throw new ProcessingError(`Файл заявки ${applicationId} не найден`);
	}

	// Если текст уже извлечен, используем его
	if (fileInfo.extractedText) {
		extractedText = fileInfo.extractedText;
		const existingOCROperation = getOperationByApplicationAndType(applicationId, 'ocr');
		ocrOperationId = existingOCROperation?.id;
		logger.info('Использован уже извлеченный текст', {
			applicationId,
			ocrOperationId,
			textLength: extractedText.length
		});
	}

	// Если текста нет, извлекаем через операцию
	if (!extractedText) {
		logger.info('Извлечение текста из файла', { applicationId });
		try {
			const ocrResult = await extractText(applicationId, {
				buffer: fileInfo.buffer,
				mimeType: fileInfo.mimeType,
				fileType: fileInfo.fileType,
				pageCount: fileInfo.pageCount,
				filename: fileInfo.filename
			});

			if (ocrResult.type === 'text') {
				// Синхронная операция завершена
				extractedText = ocrResult.text;
				const ocrOperation = getOperationByApplicationAndType(applicationId, 'ocr');

				ocrOperationId = ocrOperation?.id;
				logger.info('Текст успешно извлечен из файла', {
					applicationId,
					ocrOperationId,
					textLength: extractedText.length
				});
			} else if (ocrResult.type === 'processing') {
				// Асинхронная операция - возвращаем ID операции
				ocrOperationId = ocrResult.operationId;
				logger.info('OCR операция асинхронная', { applicationId, ocrOperationId });
				// Возвращаем результат с operationId, не выбрасываем ошибку
				// Функция вернет результат с ocrOperationId, но без extractedText
				// API endpoint должен обработать это и вернуть HTTP 202
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

	// Если операция асинхронная, возвращаем результат с operationId
	if (ocrOperationId && !extractedText) {
		logger.info('Возврат результата с асинхронной OCR операцией', {
			applicationId,
			ocrOperationId
		});
		return {
			result: {
				type: '',
				confidence: 0,
				reasoning: 'OCR операция выполняется асинхронно. Проверьте статус операции.'
			},
			ocrOperationId,
			llmOperationId: undefined
		};
	}

	// Проверяем, что текст был извлечен
	if (!extractedText) {
		logger.error('Не удалось извлечь текст из файла', { applicationId });
		throw new ProcessingError('Не удалось извлечь текст из файла');
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

		// Получаем ID операции LLM (с синхронизацией)
		const llmOperation = getOperationByApplicationAndType(applicationId, 'llm_product_type');

		const llmOperationId = llmOperation?.id;

		logger.info('Тип изделия определен LLM', {
			applicationId,
			productType: productTypeResult.type,
			confidence: productTypeResult.confidence,
			llmOperationId
		});

		// Сохраняем результат в БД заявки (для обратной совместимости)
		const updateResult = updateApplication(applicationId, {
			productType: productTypeResult
		});
		if (updateResult.isErr()) {
			logger.error('Ошибка при обновлении заявки', { applicationId, error: updateResult.error });
		}

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
 * Получает текст из существующей OCR операции или извлекает новый
 *
 * @param applicationId - GUID заявки
 * @returns Текст и ID OCR операции
 */
async function getOrExtractText(
	applicationId: string
): Promise<{ text: string; ocrOperationId?: string }> {
	let extractedText: string | undefined;
	let ocrOperationId: string | undefined;

	// Получаем информацию о файле (включая уже извлеченный текст, если есть)
	logger.info('Получение информации о файле для формирования аббревиатуры', { applicationId });
	const fileInfo = await getFileInfo(applicationId);
	if (!fileInfo) {
		logger.error('Файл заявки не найден', { applicationId });
		throw new ProcessingError(`Файл заявки ${applicationId} не найден`);
	}

	// Если текст уже извлечен, используем его
	if (fileInfo.extractedText) {
		extractedText = fileInfo.extractedText;
		const existingOCROperation = getOperationByApplicationAndType(applicationId, 'ocr');

		ocrOperationId = existingOCROperation?.id;
		logger.info('Использован уже извлеченный текст для формирования аббревиатуры', {
			applicationId,
			ocrOperationId,
			textLength: extractedText.length
		});
		return { text: extractedText, ocrOperationId };
	}

	// Если текста нет, извлекаем через операцию
	logger.info('Извлечение текста из файла для формирования аббревиатуры', { applicationId });
	try {
		const ocrResult = await extractText(applicationId, {
			buffer: fileInfo.buffer,
			mimeType: fileInfo.mimeType,
			fileType: fileInfo.fileType,
			pageCount: fileInfo.pageCount,
			filename: fileInfo.filename
		});

		if (ocrResult.type === 'processing') {
			// Асинхронная операция
			ocrOperationId = ocrResult.operationId;
			logger.info('OCR операция асинхронная', { applicationId, ocrOperationId });
			throw new ProcessingError(
				'OCR операция асинхронная. Используйте checkAndUpdateOperation для проверки статуса.'
			);
		} else if (ocrResult.type === 'text') {
			// Синхронная операция завершена
			extractedText = ocrResult.text;
			const ocrOperation = getOperationByApplicationAndType(applicationId, 'ocr');

			ocrOperationId = ocrOperation?.id;
			logger.info('Текст успешно извлечен для формирования аббревиатуры', {
				applicationId,
				ocrOperationId,
				textLength: extractedText.length
			});
			return { text: extractedText, ocrOperationId };
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

/**
 * Формирует промпт для LLM на основе текста и технических условий
 *
 * @param text - Текст заявки (уже ограниченный)
 * @param technicalSpec - Техническое условие
 * @returns Промпт для LLM
 */
function buildAbbreviationPrompt(text: string, technicalSpec: TechnicalSpec): string {
	// Формируем описание правил ТУ для промпта
	const rulesDescription = technicalSpec.rules
		.map((rule) => `- ${rule.parameter}: код "${rule.code}" - ${rule.description}`)
		.join('\n');

	// Формируем промпт для извлечения параметров
	return `Проанализируй следующий текст из технической заявки и извлеки параметры для формирования аббревиатуры продукции.

Текст заявки:
${text}

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
}

/**
 * Вызывает LLM для извлечения параметров аббревиатуры
 *
 * @param applicationId - GUID заявки
 * @param prompt - Промпт для LLM
 * @param systemPrompt - Системный промпт
 * @returns Параметры и ID операции LLM
 */
async function extractParametersWithLLM(
	applicationId: string,
	prompt: string,
	systemPrompt: string
): Promise<{ parameters: AbbreviationParameter[]; llmOperationId?: string }> {
	logger.info('Вызов LLM для извлечения параметров аббревиатуры', {
		applicationId,
		textLength: prompt.length
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

	// Получаем ID операции LLM с синхронизацией
	const llmOperation = getOperationByApplicationAndType(applicationId, 'llm_abbreviation');

	const llmOperationId = llmOperation?.id;

	logger.info('Параметры извлечены LLM', {
		applicationId,
		parametersCount: parametersResult.parameters.length,
		llmOperationId
	});

	return {
		parameters: parametersResult.parameters,
		llmOperationId
	};
}

/**
 * Валидирует параметры по правилам ТУ и формирует аббревиатуру
 *
 * @param parameters - Извлеченные параметры
 * @param technicalSpec - Техническое условие
 * @returns Валидированные параметры и сформированная аббревиатура
 */
function validateAndGenerateAbbreviation(
	parameters: AbbreviationParameter[],
	technicalSpec: TechnicalSpec
): { parameters: AbbreviationParameter[]; abbreviation: string } {
	// Валидируем параметры по правилам ТУ
	const validatedParameters = validateParametersAgainstTU(parameters, technicalSpec);

	logger.info('Параметры валидированы по ТУ', {
		validatedParametersCount: validatedParameters.length
	});

	// Формируем аббревиатуру по шаблону
	const abbreviation = generateAbbreviationFromSchema(
		validatedParameters,
		technicalSpec.abbreviationTemplate
	);

	logger.info('Аббревиатура сформирована', {
		abbreviation
	});

	return {
		parameters: validatedParameters,
		abbreviation
	};
}

/**
 * Сохраняет результат формирования аббревиатуры в БД
 *
 * @param applicationId - GUID заявки
 * @param result - Результат формирования аббревиатуры
 */
function saveAbbreviationResult(
	applicationId: string,
	result: {
		parameters: AbbreviationParameter[];
		abbreviation: string;
		technicalSpecId: string;
	}
): void {
	const dbResult = {
		parameters: result.parameters,
		abbreviation: result.abbreviation,
		technicalSpecId: result.technicalSpecId,
		generatedAt: new Date().toISOString()
	};

	const updateResult = updateApplication(applicationId, {
		abbreviation: dbResult
	});
	if (updateResult.isErr()) {
		logger.error('Ошибка при обновлении заявки', { applicationId, error: updateResult.error });
	}

	logger.info('Результат формирования аббревиатуры сохранен в БД', {
		applicationId,
		abbreviation: result.abbreviation
	});
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

	// Валидация: проверяем существование заявки
	const applicationResult = getApplication(applicationId);
	if (applicationResult.isErr()) {
		logger.error('Заявка не найдена при формировании аббревиатуры', { applicationId, error: applicationResult.error });
		throw new ProcessingError(`Заявка ${applicationId} не найдена`);
	}
	const application = applicationResult.value;

	// Валидация: проверяем существование ТУ
	const technicalSpec = getTechnicalSpec(technicalSpecId);
	if (!technicalSpec) {
		logger.error('Техническое условие не найдено', { applicationId, technicalSpecId });
		throw new ProcessingError(`Техническое условие ${technicalSpecId} не найдено`);
	}

	try {
		// 1. Получаем или извлекаем текст
		const { text, ocrOperationId } = await getOrExtractText(applicationId);

		// 2. Ограничиваем текст для LLM
		const limitedText = truncateText(text, config.maxTextLengthForLLM);

		// 3. Формируем промпт
		const prompt = buildAbbreviationPrompt(limitedText, technicalSpec);
		const systemPrompt =
			'Ты эксперт по анализу технических заявок. Твоя задача - извлечь параметры продукции из текста заявки с учетом технических условий.';

		// 4. Извлекаем параметры через LLM
		const { parameters, llmOperationId } = await extractParametersWithLLM(
			applicationId,
			prompt,
			systemPrompt
		);

		// 5. Валидируем параметры и формируем аббревиатуру
		const { parameters: validatedParameters, abbreviation } = validateAndGenerateAbbreviation(
			parameters,
			technicalSpec
		);

		// 6. Сохраняем результат
		saveAbbreviationResult(applicationId, {
			parameters: validatedParameters,
			abbreviation,
			technicalSpecId
		});

		return {
			parameters: validatedParameters,
			abbreviation,
			ocrOperationId,
			llmOperationId
		};
	} catch (error) {
		if (error instanceof ProcessingError) {
			throw error;
		}
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

	// Если операция уже завершена, возвращаем как есть
	if (operation.status === 'completed' || operation.status === 'failed') {
		return operation;
	}

	if (operation.status === 'running') {
		if (operation.type === 'ocr') {
			const updatedOperation = await checkOCROperation(operationId);
			return updatedOperation;
		}
	}



	// Для других типов операций просто возвращаем текущий статус
	return operation;
}
