/**
 * Модуль OCR и извлечения текста из файлов
 *
 * Поддерживает:
 * - YandexOCR для изображений (PNG, JPG, JPEG) и PDF (через yandex/ocr.ts)
 * - Извлечение текста из DOCX через mammoth (локально)
 * - Извлечение текста из XLSX через xlsx (локально)
 */

import {
	getOperation
} from '../storage/operationsRepository.js';
import { logger } from '../utils/logger.js';
import { callYandexOCR, checkYandexOCROperation } from './yandex/api-ocr.js';
import type { ProcessingOperation } from '../storage/types.js';
import { ok, Result, err } from 'neverthrow';

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
): Promise<Result<ExtractTextResult, Error>> {
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

			return ok({ type: 'text', text });
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

		const result = await callYandexOCR(applicationId, buffer, mimeType, pageCount);
		if (result.isErr()) {
			return err(new OCRError('Не удалось извлечь текст через YandexOCR', result.error));
		}
		return ok({ type: 'text', text: result.value.result?.text as string });

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
 * @returns Обновленная операция или ошибка, если не найдена
 */
export async function checkOCROperation(operationId: string): Promise<Result<ProcessingOperation, OCRError>> {
	logger.debug('Проверка статуса OCR операции', { operationId });

	const operation = getOperation(operationId);
	if (operation.isErr()) {
		logger.warn('Операция не найдена', { operationId });
		return err(new OCRError('Операция не найдена', operation.error));
	}

	// Если операция уже завершена, возвращаем как есть
	if (operation.value.status === 'completed' || operation.value.status === 'failed') {
		return ok(operation.value);
	}

	// Проверяем статус в зависимости от провайдера
	switch (operation.value.provider) {
		case 'yandex': {
			const updatedOperation = await checkYandexOCROperation(operation.value.id);
			if (updatedOperation.isErr()) {
				return err(new OCRError('Не удалось проверить статус асинхронной операции', updatedOperation.error));
			}
			return ok(updatedOperation.value);
		}

		case 'local': {
			// Локальные операции всегда синхронные, не требуют проверки
			return operation;
		}

		default:
			logger.warn('Неизвестный провайдер OCR', {
				operationId,
				provider: operation.value.provider
			});
			return operation;
	}
}
