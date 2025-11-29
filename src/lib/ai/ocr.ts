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
	updateOperationStatus,
	getOperation
} from '../storage/operationsRepository.js';
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
 * Результат вызова YandexOCR
 */
export interface YandexOCRResult {
	text?: string;
	operationId?: string;
	isAsync: boolean;
}

/**
 * Отправляет изображение или PDF в YandexOCR
 * Возвращает результат синхронно или Operation ID для асинхронных операций
 */
async function callYandexOCR(fileBuffer: Buffer, mimeType: string): Promise<YandexOCRResult> {
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

	// Формируем запрос к YandexOCR API
	const requestBody = {
		folderId: config.folderId,
		analyze_specs: [
			{
				features: [
					{
						type: 'TEXT_DETECTION',
						text_detection_config: {
							language_codes: ['ru', 'en'] // Поддержка русского и английского
						}
					}
				],
				mime_type: contentType
			}
		],
		content: base64Content
	};

	try {
		const response = await fetch(config.endpoint!, {
			method: 'POST',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new OCRError(
				`YandexOCR API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();

		// Проверяем, является ли операция асинхронной (многостраничный PDF)
		// YandexOCR для асинхронных операций возвращает { done: false, id: "..." }
		if (result.done === false && result.id) {
			return {
				operationId: result.id,
				isAsync: true
			};
		}

		// Если операция завершена (done: true), извлекаем результат
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
				return { text, isAsync: false };
			}
		}

		// Синхронный ответ (одностраничные PDF, изображения)
		// Структура ответа: { result: { textAnnotation: { fullText: string } } }
		if (result.result?.textAnnotation?.fullText) {
			return {
				text: result.result.textAnnotation.fullText,
				isAsync: false
			};
		}

		// Альтернативная структура ответа
		if (result.textAnnotation?.fullText) {
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
			return {
				text: textBlocks.join('\n'),
				isAsync: false
			};
		}

		throw new OCRError('Не удалось извлечь текст из ответа YandexOCR');
	} catch (error) {
		if (error instanceof OCRError) {
			throw error;
		}
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
 * Проверяет статус асинхронной операции YandexOCR
 */
export async function checkYandexOCROperation(operationId: string): Promise<{
	done: boolean;
	text?: string;
	error?: string;
}> {
	const config = aiConfig.yandexOCR;
	const operationEndpoint = `https://operation.api.cloud.yandex.net/operations/${operationId}`;

	try {
		const response = await fetch(operationEndpoint, {
			method: 'GET',
			headers: {
				Authorization: `Api-Key ${config.apiKey}`
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new OCRError(
				`YandexOCR Operation API вернул ошибку: ${response.status} ${response.statusText}. ${errorText}`
			);
		}

		const result = await response.json();

		if (result.done === true && result.response) {
			// Операция завершена, извлекаем текст
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

			return {
				done: true,
				text: text || ''
			};
		}

		if (result.error) {
			return {
				done: true,
				error: result.error.message || 'Unknown error'
			};
		}

		// Операция еще выполняется
		return {
			done: false
		};
	} catch (error) {
		if (error instanceof OCRError) {
			throw error;
		}
		throw new OCRError('Ошибка при проверке статуса операции YandexOCR', error as Error);
	}
}

/**
 * Извлекает текст из файла с созданием операции обработки
 *
 * @param applicationId - ID заявки
 * @param fileBuffer - Buffer с содержимым файла
 * @param mimeType - MIME тип файла
 * @param filename - Имя файла
 * @returns Объект с текстом (если синхронно) или ID операции (если асинхронно)
 */
export async function extractTextFromFileWithOperation(
	applicationId: string,
	fileBuffer: Buffer,
	mimeType: string,
	filename?: string
): Promise<{ text?: string; operationId?: string }> {
	const fileType = getFileType(mimeType);
	const config = aiConfig.yandexOCR;

	// Для файлов, не требующих OCR, создаем синхронную операцию
	if (fileType === 'docx' || fileType === 'xlsx') {
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
				text = await extractTextFromDOCX(fileBuffer);
			} else {
				text = await extractTextFromXLSX(fileBuffer);
			}

			updateOperationStatus(operation.id, 'completed', {
				result: { text }
			});

			return { text };
		} catch (error) {
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
		// Создаем операцию перед вызовом
		const operation = createOrUpdateOperation(
			applicationId,
			'ocr',
			'yandex',
			{
				endpoint: config.endpoint!,
				method: 'POST'
			},
			'running'
		);

		try {
			const ocrResult = await callYandexOCR(fileBuffer, mimeType);

			if (ocrResult.isAsync && ocrResult.operationId) {
				// Асинхронная операция
				updateOperationStatus(operation.id, 'running', {
					externalOperationId: ocrResult.operationId
				});

				return { operationId: operation.id };
			} else if (ocrResult.text) {
				// Синхронная операция завершена
				updateOperationStatus(operation.id, 'completed', {
					result: { text: ocrResult.text }
				});

				return { text: ocrResult.text };
			} else {
				throw new OCRError('Не удалось извлечь текст из ответа YandexOCR');
			}
		} catch (error) {
			updateOperationStatus(operation.id, 'failed', {
				error: {
					message: error instanceof Error ? error.message : 'Unknown error',
					details: error
				}
			});
			throw error;
		}
	}

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
	mimeType: string,
	filename?: string
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
