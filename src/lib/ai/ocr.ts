/**
 * Модуль OCR и извлечения текста из файлов
 *
 * Поддерживает:
 * - YandexOCR для изображений (PNG, JPG, JPEG) и PDF
 * - Извлечение текста из DOCX через mammoth
 * - Извлечение текста из XLSX через xlsx
 */

import { aiConfig } from './config.js';
import {
	createOrUpdateOperation,
	updateOperationStatus
} from '../storage/operationsRepository.js';
import { logger } from '../utils/logger.js';

export class OCRError extends Error {
	constructor(
		message: string,
		public cause?: Error
	) {
		super(message);
		this.name = 'OCRError';
	}
}

/**
 * Определяет тип файла по MIME типу
 */
function getFileType(mimeType: string): 'image' | 'pdf' | 'docx' | 'xlsx' | 'unknown' {
	if (mimeType.startsWith('image/')) {
		return 'image';
	}
	if (mimeType === 'application/pdf') {
		return 'pdf';
	}
	if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
		return 'docx';
	}
	if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
		return 'xlsx';
	}
	return 'unknown';
}

/**
 * Результат вызова YandexOCR
 */
export interface YandexOCRResult {
	text?: string;
	operationId?: string;
	isAsync: boolean;
}

function createYandexOCRRequestBody(fileBuffer: Buffer, mimeType: string): Record<string, unknown> {
	// https://yandex.cloud/ru/docs/vision/ocr/api-ref/TextRecognition/recognize
	const config = aiConfig.yandexOCR;
	// Конвертируем Buffer в base64
	const base64Content = fileBuffer.toString('base64');

	// Определяем тип контента для API
	let contentType: string;
	if (mimeType.startsWith('image/')) {
		contentType = mimeType;
	} else if (mimeType === 'application/pdf') {
		contentType = 'application/pdf';
	} else {
		throw new OCRError(`Неподдерживаемый тип файла для OCR: ${mimeType}`);
	}

	return {
		content: base64Content,
		mime_type: contentType,
		language_codes: ['ru', 'en'],
		model: config.model
	}
}

/**
 * Отправляет изображение или PDF в YandexOCR
 * Возвращает результат синхронно или Operation ID для асинхронных операций
 *
 * @param fileBuffer - Buffer с содержимым файла
 * @param mimeType - MIME тип файла
 * @param pageCount - Количество страниц (для PDF, если > 1, используется async endpoint)
 */
async function callYandexOCR(
	fileBuffer: Buffer,
	mimeType: string,
	pageCount?: number
): Promise<YandexOCRResult> {
	const config = aiConfig.yandexOCR;

	// Определяем, нужно ли использовать async endpoint
	const isMultiPagePDF = mimeType === 'application/pdf' && pageCount && pageCount > 1;
	const endpoint = isMultiPagePDF && config.asyncEndpoint ? config.asyncEndpoint : config.endpoint;

	logger.debug('Вызов YandexOCR', {
		mimeType,
		fileSize: fileBuffer.length,
		pageCount,
		isMultiPagePDF,
		endpoint
	});

	// Формируем запрос к YandexOCR API
	const requestBody = createYandexOCRRequestBody(fileBuffer, mimeType);

	try {
		logger.debug('Отправка запроса в YandexOCR', {
			endpoint,
			mimeType,
			pageCount
		});

		const response = await fetch(endpoint!, {
			method: 'POST',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('YandexOCR API вернул ошибку', {
				status: response.status,
				statusText: response.statusText,
				errorText
			});
			throw new OCRError(
				`YandexOCR API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();

		// Для async endpoint: всегда возвращает { done: false, id: "..." } при создании операции
		if (isMultiPagePDF) {
			if (result.done === false && result.id) {
				logger.info('YandexOCR async операция создана', {
					externalOperationId: result.id
				});
				return {
					operationId: result.id,
					isAsync: true
				};
			}
			// Если async endpoint вернул что-то неожиданное
			logger.error('Неожиданный ответ от async endpoint', {
				responseStructure: JSON.stringify(result).substring(0, 200)
			});
			throw new OCRError('Неожиданный ответ от async endpoint YandexOCR');
		}

		// Для синхронного endpoint: проверяем завершенные операции (для обратной совместимости)
		// Это может произойти, если синхронный endpoint вернул операцию
		if (result.done === true && result.response) {
			const response = result.response;
			let text: string | undefined;

			// Извлекаем текст из результата YandexOCR
			if (response.result?.textAnnotation?.fullText) {
				text = response.result.textAnnotation.fullText;
			} else if (response.textAnnotation?.fullText) {
				text = response.textAnnotation.fullText;
			} else if (response.result?.textAnnotation?.blocks) {
				const textBlocks: string[] = [];
				for (const block of response.result.textAnnotation.blocks) {
					if (block.lines) {
						for (const line of block.lines) {
							if (line.words) {
								const words = line.words.map((w: { text: string }) => w.text).join(' ');
								textBlocks.push(words);
							}
						}
					}
				}
				text = textBlocks.join('\n');
			}

			if (text) {
				logger.info('YandexOCR успешно извлек текст (синхронная операция завершена)', {
					textLength: text.length
				});
				return { text, isAsync: false };
			}
		}

		// Синхронный ответ (одностраничные PDF, изображения)
		// Структура ответа: { result: { textAnnotation: { fullText: string } } }
		if (result.result?.textAnnotation?.fullText) {
			logger.info('YandexOCR успешно извлек текст (синхронная операция)', {
				textLength: result.result.textAnnotation.fullText.length
			});
			return {
				text: result.result.textAnnotation.fullText,
				isAsync: false
			};
		}

		// Альтернативная структура ответа
		if (result.textAnnotation?.fullText) {
			logger.info('YandexOCR успешно извлек текст (альтернативная структура)', {
				textLength: result.textAnnotation.fullText.length
			});
			return {
				text: result.textAnnotation.fullText,
				isAsync: false
			};
		}

		// Если текст не найден, пытаемся извлечь из блоков
		if (result.result?.textAnnotation?.blocks) {
			const textBlocks: string[] = [];
			for (const block of result.result.textAnnotation.blocks) {
				if (block.lines) {
					for (const line of block.lines) {
						if (line.words) {
							const words = line.words.map((w: { text: string }) => w.text).join(' ');
							textBlocks.push(words);
						}
					}
				}
			}
			const extractedText = textBlocks.join('\n');
			logger.info('YandexOCR извлек текст из блоков', {
				textLength: extractedText.length
			});
			return {
				text: extractedText,
				isAsync: false
			};
		}

		logger.error('Не удалось извлечь текст из ответа YandexOCR', {
			responseStructure: JSON.stringify(result).substring(0, 200)
		});
		throw new OCRError('Не удалось извлечь текст из ответа YandexOCR');
	} catch (error) {
		if (error instanceof OCRError) {
			logger.error('Ошибка OCRError', {
				message: error.message,
				stack: error.stack
			});
			throw error;
		}
		logger.error('Неожиданная ошибка при вызове YandexOCR', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new OCRError('Ошибка при вызове YandexOCR API', error as Error);
	}
}

/**
 * Извлекает текст из DOCX файла
 */
async function extractTextFromDOCX(fileBuffer: Buffer): Promise<string> {
	try {
		// Динамический импорт для избежания проблем при отсутствии библиотеки
		const mammoth = await import('mammoth');
		const result = await mammoth.extractRawText({ buffer: fileBuffer });
		return result.value;
	} catch (error) {
		if ((error as Error).message?.includes('Cannot find module')) {
			throw new OCRError(
				'Библиотека mammoth не установлена. Установите: npm install mammoth',
				error as Error
			);
		}
		throw new OCRError('Ошибка при извлечении текста из DOCX', error as Error);
	}
}

/**
 * Извлекает текст из XLSX файла
 */
async function extractTextFromXLSX(fileBuffer: Buffer): Promise<string> {
	try {
		// Динамический импорт для избежания проблем при отсутствии библиотеки
		const XLSX = await import('xlsx');
		const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
		const textParts: string[] = [];

		// Извлекаем текст из всех листов
		for (const sheetName of workbook.SheetNames) {
			const sheet = workbook.Sheets[sheetName];
			const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

			// Преобразуем данные листа в текст
			for (const row of sheetData) {
				if (Array.isArray(row)) {
					const rowText = row.filter((cell) => cell !== '').join(' ');
					if (rowText.trim()) {
						textParts.push(rowText);
					}
				}
			}
		}

		return textParts.join('\n');
	} catch (error) {
		if ((error as Error).message?.includes('Cannot find module')) {
			throw new OCRError(
				'Библиотека xlsx не установлена. Установите: npm install xlsx',
				error as Error
			);
		}
		throw new OCRError('Ошибка при извлечении текста из XLSX', error as Error);
	}
}

/**
 * Получает результаты распознавания через GetRecognition endpoint
 *
 * @param operationId - ID операции у внешнего сервиса (Yandex)
 * @returns Извлеченный текст
 */
async function getYandexOCRRecognition(operationId: string): Promise<string> {
	const config = aiConfig.yandexOCR;
	const endpoint = config.getRecognitionEndpoint || 
		'https://ocr.api.cloud.yandex.net/ocr/v1/textRecognitionAsync/getRecognition';

	logger.debug('Получение результатов распознавания через GetRecognition', {
		externalOperationId: operationId,
		endpoint
	});

	try {
		const response = await fetch(`${endpoint}?operationId=${operationId}`, {
			method: 'GET',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('YandexOCR GetRecognition API вернул ошибку', {
				externalOperationId: operationId,
				status: response.status,
				statusText: response.statusText,
				errorText
			});
			throw new OCRError(
				`YandexOCR GetRecognition API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();
		let text: string | undefined;

		// Извлекаем текст из результата GetRecognition
		if (result.result?.textAnnotation?.fullText) {
			text = result.result.textAnnotation.fullText;
		} else if (result.textAnnotation?.fullText) {
			text = result.textAnnotation.fullText;
		} else if (result.result?.textAnnotation?.blocks) {
			const textBlocks: string[] = [];
			for (const block of result.result.textAnnotation.blocks) {
				if (block.lines) {
					for (const line of block.lines) {
						if (line.words) {
							const words = line.words.map((w: { text: string }) => w.text).join(' ');
							textBlocks.push(words);
						}
					}
				}
			}
			text = textBlocks.join('\n');
		}

		if (!text) {
			logger.error('Не удалось извлечь текст из ответа GetRecognition', {
				externalOperationId: operationId,
				responseStructure: JSON.stringify(result).substring(0, 200)
			});
			throw new OCRError('Не удалось извлечь текст из ответа GetRecognition');
		}

		logger.info('Текст успешно получен через GetRecognition', {
			externalOperationId: operationId,
			textLength: text.length
		});

		return text;
	} catch (error) {
		if (error instanceof OCRError) {
			logger.error('Ошибка OCRError при получении результатов', {
				externalOperationId: operationId,
				message: error.message,
				stack: error.stack
			});
			throw error;
		}
		logger.error('Неожиданная ошибка при получении результатов GetRecognition', {
			externalOperationId: operationId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new OCRError('Ошибка при получении результатов GetRecognition', error as Error);
	}
}

/**
 * Проверяет статус асинхронной операции YandexOCR
 */
export async function checkYandexOCROperation(operationId: string): Promise<{
	done: boolean;
	text?: string;
	error?: string;
}> {
	const config = aiConfig.yandexOCR;
	const baseEndpoint =
		config.operationEndpoint || 'https://operation.api.cloud.yandex.net/operations';
	const operationEndpoint = `${baseEndpoint}/${operationId}`;

	logger.debug('Проверка статуса YandexOCR операции', {
		externalOperationId: operationId,
		operationEndpoint
	});

	try {
		const response = await fetch(operationEndpoint, {
			method: 'GET',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error('YandexOCR Operation API вернул ошибку', {
				externalOperationId: operationId,
				status: response.status,
				statusText: response.statusText,
				errorText
			});
			throw new OCRError(
				`YandexOCR Operation API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();

		if (result.done === true) {
			// Операция завершена, получаем результаты через GetRecognition
			logger.debug('Операция завершена, получаем результаты через GetRecognition', {
				externalOperationId: operationId
			});

			try {
				const text = await getYandexOCRRecognition(operationId);
				logger.info('YandexOCR операция завершена успешно', {
					externalOperationId: operationId,
					textLength: text.length
				});

				return {
					done: true,
					text
				};
			} catch (error) {
				logger.error('Ошибка при получении результатов через GetRecognition', {
					externalOperationId: operationId,
					error: error instanceof Error ? error.message : String(error)
				});
				// Пробуем извлечь текст из response, если есть (fallback)
				if (result.response) {
					const response = result.response;
					let text: string | undefined;

					if (response.result?.textAnnotation?.fullText) {
						text = response.result.textAnnotation.fullText;
					} else if (response.textAnnotation?.fullText) {
						text = response.textAnnotation.fullText;
					} else if (response.result?.textAnnotation?.blocks) {
						const textBlocks: string[] = [];
						for (const block of response.result.textAnnotation.blocks) {
							if (block.lines) {
								for (const line of block.lines) {
									if (line.words) {
										const words = line.words.map((w: { text: string }) => w.text).join(' ');
										textBlocks.push(words);
									}
								}
							}
						}
						text = textBlocks.join('\n');
					}

					if (text) {
						logger.info('Использован fallback: текст извлечен из Operation.Get ответа', {
							externalOperationId: operationId,
							textLength: text.length
						});
						return {
							done: true,
							text
						};
					}
				}
				// Если не удалось получить текст, возвращаем ошибку
				return {
					done: true,
					error: error instanceof Error ? error.message : 'Ошибка при получении результатов'
				};
			}
		}

		if (result.error) {
			logger.error('YandexOCR операция завершена с ошибкой', {
				externalOperationId: operationId,
				error: result.error.message || 'Unknown error'
			});
			return {
				done: true,
				error: result.error.message || 'Unknown error'
			};
		}

		// Операция еще выполняется
		logger.debug('YandexOCR операция еще выполняется', {
			externalOperationId: operationId
		});
		return {
			done: false
		};
	} catch (error) {
		if (error instanceof OCRError) {
			logger.error('Ошибка OCRError при проверке статуса', {
				externalOperationId: operationId,
				message: error.message,
				stack: error.stack
			});
			throw error;
		}
		logger.error('Неожиданная ошибка при проверке статуса операции YandexOCR', {
			externalOperationId: operationId,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		});
		throw new OCRError('Ошибка при проверке статуса операции YandexOCR', error as Error);
	}
}

/**
 * Извлекает текст из файла с созданием операции обработки
 *
 * @param applicationId - ID заявки
 * @param fileInfo - Информация о файле (buffer, mimeType, fileType, pageCount, filename)
 * @returns Объект с текстом (если синхронно) или ID операции (если асинхронно)
 */
export async function extractTextFromFileWithOperation(
	applicationId: string,
	fileInfo: {
		buffer: Buffer;
		mimeType: string;
		fileType: 'image' | 'pdf' | 'docx' | 'xlsx' | 'unknown';
		pageCount: number;
		filename?: string;
	}
): Promise<{ text?: string; operationId?: string }> {
	const { buffer, mimeType, fileType, pageCount, filename } = fileInfo;
	const config = aiConfig.yandexOCR;

	// Для файлов, не требующих OCR, создаем синхронную операцию
	if (fileType === 'docx' || fileType === 'xlsx') {
		logger.info('Извлечение текста из файла (локальное)', {
			applicationId,
			fileType,
			filename
		});

		const operation = createOrUpdateOperation(
			applicationId,
			'ocr',
			'local', // Для локального извлечения текста
			{
				endpoint: 'local',
				method: 'POST'
			},
			'pending'
		);

		try {
			let text: string;
			if (fileType === 'docx') {
				text = await extractTextFromDOCX(buffer);
			} else {
				text = await extractTextFromXLSX(buffer);
			}

			logger.info('Текст успешно извлечен из файла (локальное)', {
				applicationId,
				operationId: operation.id,
				fileType,
				textLength: text.length
			});

			updateOperationStatus(operation.id, 'completed', {
				result: { text }
			});

			return { text };
		} catch (error) {
			logger.error('Ошибка при локальном извлечении текста', {
				applicationId,
				operationId: operation.id,
				fileType,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			updateOperationStatus(operation.id, 'failed', {
				error: {
					message: error instanceof Error ? error.message : 'Unknown error'
				}
			});
			throw error;
		}
	}

	// Для изображений и PDF используем YandexOCR
	if (fileType === 'image' || fileType === 'pdf') {
		logger.info('Извлечение текста через YandexOCR', {
			applicationId,
			fileType,
			filename,
			pageCount
		});

		// Определяем endpoint в зависимости от количества страниц
		const endpoint =
			fileType === 'pdf' && pageCount > 1 && config.asyncEndpoint
				? config.asyncEndpoint
				: config.endpoint;

		// Создаем операцию перед вызовом
		const operation = createOrUpdateOperation(
			applicationId,
			'ocr',
			'yandex',
			{
				endpoint: endpoint!,
				method: 'POST'
			},
			'running'
		);

		try {
			const ocrResult = await callYandexOCR(buffer, mimeType, pageCount);

			if (ocrResult.isAsync && ocrResult.operationId) {
				// Асинхронная операция
				logger.info('YandexOCR операция асинхронная', {
					applicationId,
					operationId: operation.id,
					externalOperationId: ocrResult.operationId
				});
				updateOperationStatus(operation.id, 'running', {
					externalOperationId: ocrResult.operationId
				});

				return { operationId: operation.id };
			} else if (ocrResult.text) {
				// Синхронная операция завершена
				logger.info('YandexOCR операция завершена синхронно', {
					applicationId,
					operationId: operation.id,
					textLength: ocrResult.text.length
				});
				updateOperationStatus(operation.id, 'completed', {
					result: { text: ocrResult.text }
				});

				return { text: ocrResult.text };
			} else {
				logger.error('Не удалось извлечь текст из ответа YandexOCR', {
					applicationId,
					operationId: operation.id
				});
				throw new OCRError('Не удалось извлечь текст из ответа YandexOCR');
			}
		} catch (error) {
			logger.error('Ошибка при извлечении текста через YandexOCR', {
				applicationId,
				operationId: operation.id,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			updateOperationStatus(operation.id, 'failed', {
				error: {
					message: error instanceof Error ? error.message : 'Unknown error',
					details: error
				}
			});
			throw error;
		}
	}

	logger.error('Неподдерживаемый тип файла', {
		applicationId,
		mimeType,
		filename: fileInfo.filename
	});
	throw new OCRError(
		`Неподдерживаемый тип файла: ${mimeType}. Поддерживаются: изображения (PNG, JPG), PDF, DOCX, XLSX.`
	);
}

/**
 * Извлекает текст из файла (старая функция для обратной совместимости)
 *
 * @param fileBuffer - Buffer с содержимым файла
 * @param mimeType - MIME тип файла
 * @param filename - Имя файла (для определения расширения, если MIME тип не указан)
 * @returns Извлеченный текст
 */
export async function extractTextFromFile(
	fileBuffer: Buffer,
	mimeType: string
): Promise<string> {
	const fileType = getFileType(mimeType);

	switch (fileType) {
		case 'image':
		case 'pdf': {
			// Используем YandexOCR для изображений и PDF
			const result = await callYandexOCR(fileBuffer, mimeType);
			if (result.text) {
				return result.text;
			}
			throw new OCRError(
				'Операция OCR асинхронная. Используйте extractTextFromFileWithOperation для работы с операциями.'
			);
		}

		case 'docx':
			// Извлекаем текст из DOCX
			return await extractTextFromDOCX(fileBuffer);

		case 'xlsx':
			// Извлекаем текст из XLSX
			return await extractTextFromXLSX(fileBuffer);

		case 'unknown':
			throw new OCRError(
				`Неподдерживаемый тип файла: ${mimeType}. Поддерживаются: изображения (PNG, JPG), PDF, DOCX, XLSX.`
			);

		default:
			throw new OCRError(`Неизвестный тип файла: ${fileType}`);
	}
}
