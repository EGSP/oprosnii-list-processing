import { join } from 'path';
import {
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	readdirSync
} from 'fs';
import { config } from '../config.js';
import { FileStorageError } from './errors.js';
import { logger } from '../utils/logger.js';
import { PDFDocument } from 'pdf-lib';
import { findOperations, getOperation } from './processingOperations.js';
import { err, Ok, ok, okAsync, ResultAsync, type Result } from 'neverthrow';
import { getOCRData } from '$lib/ai/ocr.js';



export type FileType = 'pdf' | 'document' | 'spreadsheet' | 'image';
/**
 * Тип информации о файле (без buffer)
 */
export type FileInfo = {
	name: string;
	type: FileType;
	extension: string;
	pageCount: number;
	extractedText?: string;
}

/**
 * Сохраняет файл заявки в хранилище
 * @param fileBuffer - Buffer с содержимым файла
 * @param applicationId - GUID заявки
 * @param originalFilename - Оригинальное имя файла (для сохранения расширения)
 * @returns Путь к сохраненному файлу
 */
export function storeFile(
	fileBuffer: Buffer,
	applicationId: string,
	originalFilename: string
): string {
	try {
		// Создаем директорию для заявки
		const applicationDir = join(process.cwd(), config.uploadsDirectory, applicationId);
		mkdirSync(applicationDir, { recursive: true });

		// Сохраняем оригинальное расширение
		const extension = originalFilename.split('.').pop() || '';
		const filename = `${applicationId}.${extension}`;
		const filePath = join(applicationDir, filename);

		writeFileSync(filePath, fileBuffer);

		return filePath;
	} catch (error) {
		throw new FileStorageError(`Failed to save file for application ${applicationId}`, error as Error);
	}
}

/**
 * Получает путь к файлу заявки. Файл должен иметь GUID в имени. GUID - это ID заявки.
 */
export function getFilePath(applicationId: string): Result<string, Error> {
	const applicationDir = join(process.cwd(), config.uploadsDirectory, applicationId);

	if (!existsSync(applicationDir)) {
		return err(new Error(`Application directory not found for application ${applicationId}`));
	}

	// Ищем файл в директории заявки
	// Файл может иметь GUID как имя, с любым расширением
	const files = readdirSync(applicationDir);
	const file = files.find((f: string) => f.startsWith(applicationId));

	if (!file) {
		return err(new Error(`File not found for application ${applicationId}. Files: ${files.join(', ')}`));
	}

	return ok(join(applicationDir, file));
}

/**
 * Возвращает имя файла с расширением из полного пути
 * @param path - Полный путь к файлу
 * @returns Имя файла с расширением
 */
export function getFileNameWithExtension(path: string): string {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1];
}

/**
 * Возвращает имя файла без расширения из полного пути
 * @param path - Полный путь к файлу
 * @returns Имя файла без расширения
 */
export function getFileNameWithoutExtension(path: string): Ok<string, Error> {
	return ok(path.split('.').slice(0, -1).join('.'));
}


function getFileType(path: string): Result<FileType, Error> {
	const extension = path.split('.').pop()?.toLowerCase();
	if (!extension) {
		return err(new Error('Не удалось определить расширение файла'));
	}
	switch (extension) {
		case 'pdf':
			return ok('pdf');
		case 'docx':
		case 'doc':
			return ok('document');
		case 'xlsx':
		case 'xls':
			return ok('spreadsheet');
		case 'jpeg':
		case 'jpg':
		case 'png':
			return ok('image');
		default:
			return err(new Error(`Неизвестное расширение файла: ${extension}`));
	}
}

function getFileExtension(path: string): Result<string, Error> {
	const extension = path.split('.').pop()?.toLowerCase();
	if (!extension) {
		return err(new Error('Не удалось определить расширение файла'));
	}
	return ok(extension);
}

/**
 * Читает файл
 */
export function readFile(path: string): Result<Buffer, Error> {
	if (!path || !existsSync(path)) {
		return err(new Error(`File not found for path ${path}`));
	}

	const buffer = readFileSync(path);
	return ok(buffer);
}

/**
 * Читает файл заявки
 * @param applicationId - GUID заявки
 * @returns Buffer с содержимым файла
 */
export function readApplicationFile(applicationId: string): Result<Buffer, Error> {
	return getFilePath(applicationId).andThen(readFile);
}

/**
 * Определяет количество страниц в PDF файле
 */
function getPDFPageCount(buffer: Buffer): ResultAsync<number, Error> {
	const uint8Array = new Uint8Array(buffer);
	return ResultAsync.fromPromise(PDFDocument.load(uint8Array)
		.then((pdfDoc) => {
			const pages = pdfDoc.getPages();
			return pages.length;
		}),
		(error) => {
			logger.warn('Не удалось определить количество страниц PDF', {
				error: error instanceof Error ? error.message : String(error)
			});
			return error instanceof Error ? error : new Error(String(error));
		}
	);
}

function getPageCount(fileType: FileType, buffer: Buffer): ResultAsync<number, Error> {
	if (fileType === 'pdf') {
		return getPDFPageCount(buffer);
	}
	return okAsync(1);
}

/**
 * Получает полную информацию о файле заявки
 *
 * Возвращает все необходимые данные о файле в одном месте:
 * - buffer, filename, mimeType, fileType, pageCount, size
 * - extractedText формируется из операций
 *
 * @param applicationId - GUID заявки
 * @returns Информация о файле или null, если файл не найден
 */
export function getFileInfo(applicationId: string): ResultAsync<FileInfo, Error> {
	return getFilePath(applicationId).asyncAndThen((filePath) => {
		return readFile(filePath).asyncAndThen((buffer) => {
			return getFileType(filePath).asyncAndThen((type) => {
				return getFileExtension(filePath).asyncAndThen((extension) => {
					return getPageCount(type, buffer).andThen((pageCount) => {
						let extractedText: string | undefined;
						const textExtractionOperations = findOperations(applicationId, 'extractText');
				
						if (textExtractionOperations.isOk() && textExtractionOperations.value.length > 0) {
							extractedText = textExtractionOperations.value.map((operationId) => {
								const operationResult = getOperation(operationId);
								if (operationResult.isOk()) {
									const operation = operationResult.value;
									if (operation.status !== 'completed') return '';
									if (operation.data.service) {
										const ocrDataResult = getOCRData(operation);
										if (ocrDataResult.isOk()) {
											return ocrDataResult.value as string;
										}
									} else {
										return operation.data?.result as string;
									}
								}
								return '';
							}).join('\n');
						}

						
						return okAsync({
							name: getFileNameWithoutExtension(filePath).value,
							extension,
							type,
							pageCount,
							extractedText
						} as FileInfo);
					});
				});
			});
		});
	});
}
