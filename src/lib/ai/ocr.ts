/**
 * Модуль OCR и извлечения текста из файлов
 *
 * Поддерживает:
 * - YandexOCR для изображений (PNG, JPG, JPEG) и PDF (через yandex/ocr.ts)
 * - Извлечение текста из DOCX через mammoth (локально)
 * - Извлечение текста из XLSX через xlsx (локально)
 */

import {
	getOperation,
	updateOperationStatus
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
 * Результат извлечения текста из файла
 */
export type ExtractTextResult =
	| { type: 'text'; text: string } // Текст извлечен синхронно
	| { type: 'processing'; operationId: string }; // Текст обрабатывается асинхронно



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
 * Извлекает текст из файла
 * Возвращает явный тип результата: либо текст, либо флаг обработки
 *
 * @param applicationId - ID заявки
 * @param fileInfo - Информация о файле (buffer, mimeType, fileType, pageCount, filename)
 * @returns Результат извлечения текста с явным типом
 */
export async function extractText(
	applicationId: string,
	fileInfo: {
		buffer: Buffer;
		mimeType: string;
		fileType: 'image' | 'pdf' | 'docx' | 'xlsx' | 'unknown';
		pageCount: number;
		filename?: string;
	}
): Promise<ExtractTextResult> {
	const { buffer, mimeType, fileType, pageCount, filename } = fileInfo;

	// Для локальных файлов (DOCX, XLSX) - извлекаем текст напрямую, операции не создаем
	if (fileType === 'docx' || fileType === 'xlsx') {
		logger.info('Извлечение текста из файла (локальное)', {
			applicationId,
			fileType,
			filename
		});

		try {
			let text: string;
			if (fileType === 'docx') {
				text = await extractTextFromDOCX(buffer);
			} else {
				text = await extractTextFromXLSX(buffer);
			}

			logger.info('Текст успешно извлечен из файла (локальное)', {
				applicationId,
				fileType,
				textLength: text.length
			});

			return { type: 'text', text };
		} catch (error) {
			logger.error('Ошибка при локальном извлечении текста', {
				applicationId,
				fileType,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
			});
			throw error;
		}
	}

	// Для изображений и PDF используем YandexOCR (операция создается внутри callYandexOCR)
	if (fileType === 'image' || fileType === 'pdf') {
		logger.info('Извлечение текста через YandexOCR', {
			applicationId,
			fileType,
			filename,
			pageCount
		});

		try {
			const result = await callYandexOCR(applicationId, buffer, mimeType, pageCount);
			// callYandexOCR возвращает ExtractTextResult и сам создает/обновляет операцию
			return result;
		} catch (error) {
			logger.error('Ошибка при извлечении текста через YandexOCR', {
				applicationId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined
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
