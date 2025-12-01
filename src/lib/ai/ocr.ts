/**
 * Модуль OCR и извлечения текста из файлов
 *
 * Поддерживает:
 * - YandexOCR для изображений (PNG, JPG, JPEG) и PDF (через yandex/ocr.ts)
 * - Извлечение текста из DOCX через mammoth (локально)
 * - Извлечение текста из XLSX через xlsx (локально)
 */

import {
	createOrUpdateOperation,
	updateOperationStatus,
	getOperation
} from '../storage/operationsRepository.js';
import { logger } from '../utils/logger.js';
import { callYandexOCR, checkYandexOCROperation } from './yandex/ocr.js';
import type { ProcessingOperation } from '../storage/types.js';

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
			'local',
			{} // providerData пустой для локальных операций
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

		// Создаем операцию перед вызовом
		const operation = createOrUpdateOperation(
			applicationId,
			'ocr',
			'yandex',
			{} // providerData будет заполнено после вызова API
		);

		try {
			const ocrResult = await callYandexOCR(buffer, mimeType, pageCount);

			if (ocrResult.operationId) {
				// Асинхронная операция
				logger.info('YandexOCR операция асинхронная', {
					applicationId,
					operationId: operation.id,
					externalOperationId: ocrResult.operationId
				});
				updateOperationStatus(operation.id, 'running', {
					providerData: { operationId: ocrResult.operationId }
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
 * Проверяет статус асинхронной операции OCR
 * Для Yandex OCR проверяет статус у внешнего сервиса
 *
 * @param operationId - ID операции
 * @returns Обновленная операция или null, если не найдена
 */
export async function checkOCROperation(operationId: string): Promise<ProcessingOperation | null> {
	logger.debug('Проверка статуса OCR операции', { operationId });

	const operation = getOperation(operationId);
	if (!operation) {
		logger.warn('Операция не найдена', { operationId });
		return null;
	}

	// Если операция уже завершена, возвращаем как есть
	if (operation.status === 'completed' || operation.status === 'failed') {
		return operation;
	}

	// Проверяем статус в зависимости от провайдера
	switch (operation.provider) {
		case 'yandex': {
			try {
				logger.debug('Проверка статуса YandexOCR операции', {
					operationId,
					providerData: operation.providerData
				});

				const checkResult = await checkYandexOCROperation(operation);

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

		case 'local': {
			// Локальные операции всегда синхронные, не требуют проверки
			return operation;
		}

		default:
			logger.warn('Неизвестный провайдер OCR', {
				operationId,
				provider: operation.provider
			});
			return operation;
	}
}

/**
 * Извлекает текст из файла (старая функция для обратной совместимости)
 *
 * @param fileBuffer - Buffer с содержимым файла
 * @param mimeType - MIME тип файла
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
