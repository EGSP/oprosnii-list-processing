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
import { Effect, pipe } from 'effect';
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
 * @returns Effect с путем к сохраненному файлу
 */
export function storeFile(
	fileBuffer: Buffer,
	applicationId: string,
	originalFilename: string
): Effect.Effect<string, FileStorageError> {
	return Effect.try({
		try: () => {
			// Создаем директорию для заявки
			const applicationDir = join(process.cwd(), config.uploadsDirectory, applicationId);
			mkdirSync(applicationDir, { recursive: true });

			// Сохраняем оригинальное расширение
			const extension = originalFilename.split('.').pop() || '';
			const filename = `${applicationId}.${extension}`;
			const filePath = join(applicationDir, filename);

			writeFileSync(filePath, fileBuffer);

			return filePath;
		},
		catch: (error) => new FileStorageError(`Failed to save file for application ${applicationId}`, error as Error)
	});
}

/**
 * Получает путь к файлу заявки. Файл должен иметь GUID в имени. GUID - это ID заявки.
 */
export function getFilePath(applicationId: string): Effect.Effect<string, FileStorageError> {
	return Effect.gen(function* () {
		const applicationDir = join(process.cwd(), config.uploadsDirectory, applicationId);

		const dirExists = yield* Effect.sync(() => existsSync(applicationDir));
		if (!dirExists) {
			return yield* Effect.fail(new FileStorageError(`Application directory not found for application ${applicationId}`));
		}

		// Ищем файл в директории заявки
		// Файл может иметь GUID как имя, с любым расширением
		const files = yield* Effect.try({
			try: () => readdirSync(applicationDir),
			catch: (error) => new FileStorageError(`Failed to read directory for application ${applicationId}`, error as Error)
		});
		
		const file = files.find((f: string) => f.startsWith(applicationId));

		if (!file) {
			return yield* Effect.fail(new FileStorageError(`File not found for application ${applicationId}. Files: ${files.join(', ')}`));
		}

		return join(applicationDir, file);
	});
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
export function getFileNameWithoutExtension(path: string): string {
	return path.split('.').slice(0, -1).join('.');
}


function getFileType(path: string): Effect.Effect<FileType, FileStorageError> {
	return Effect.gen(function* () {
		const extension = path.split('.').pop()?.toLowerCase();
		if (!extension) {
			return yield* Effect.fail(new FileStorageError('Не удалось определить расширение файла'));
		}
		
		switch (extension) {
			case 'pdf':
				return 'pdf' as FileType;
			case 'docx':
			case 'doc':
				return 'document' as FileType;
			case 'xlsx':
			case 'xls':
				return 'spreadsheet' as FileType;
			case 'jpeg':
			case 'jpg':
			case 'png':
				return 'image' as FileType;
			default:
				return yield* Effect.fail(new FileStorageError(`Неизвестное расширение файла: ${extension}`));
		}
	});
}

function getFileExtension(path: string): Effect.Effect<string, FileStorageError> {
	return Effect.gen(function* () {
		const extension = path.split('.').pop()?.toLowerCase();
		if (!extension) {
			return yield* Effect.fail(new FileStorageError('Не удалось определить расширение файла'));
		}
		return extension;
	});
}

/**
 * Читает файл
 */
export function readFile(path: string): Effect.Effect<Buffer, FileStorageError> {
	return Effect.gen(function* () {
		if (!path) {
			return yield* Effect.fail(new FileStorageError(`Invalid file path: ${path}`));
		}

		const exists = yield* Effect.sync(() => existsSync(path));
		if (!exists) {
			return yield* Effect.fail(new FileStorageError(`File not found for path ${path}`));
		}

		const buffer = yield* Effect.try({
			try: () => readFileSync(path),
			catch: (error) => new FileStorageError(`Failed to read file at path ${path}`, error as Error)
		});

		return buffer;
	});
}

/**
 * Читает файл заявки
 * @param applicationId - GUID заявки
 * @returns Effect с Buffer с содержимым файла
 */
export function readApplicationFile(applicationId: string): Effect.Effect<Buffer, FileStorageError> {
	return Effect.gen(function* () {
		const filePath = yield* getFilePath(applicationId);
		const buffer = yield* readFile(filePath);
		return buffer;
	});
}

/**
 * Определяет количество страниц в PDF файле
 */
function getPDFPageCount(buffer: Buffer): Effect.Effect<number, FileStorageError> {
	const uint8Array = new Uint8Array(buffer);
	return Effect.tryPromise({
		try: async () => {
			const pdfDoc = await PDFDocument.load(uint8Array);
			const pages = pdfDoc.getPages();
			return pages.length;
		},
		catch: (error) => {
			logger.warn('Не удалось определить количество страниц PDF', {
				error: error instanceof Error ? error.message : String(error)
			});
			return new FileStorageError('Не удалось определить количество страниц PDF', error as Error);
		}
	});
}

function getPageCount(fileType: FileType, buffer: Buffer): Effect.Effect<number, FileStorageError> {
	if (fileType === 'pdf') {
		return getPDFPageCount(buffer);
	}
	return Effect.succeed(1);
}

/**
 * Получает полную информацию о файле заявки
 *
 * Возвращает все необходимые данные о файле в одном месте:
 * - buffer, filename, mimeType, fileType, pageCount, size
 * - extractedText формируется из операций
 *
 * @param applicationId - GUID заявки
 * @returns Effect с информацией о файле
 */
export function getFileInfo(applicationId: string): Effect.Effect<FileInfo, FileStorageError | Error> {
	return Effect.gen(function* () {
		const filePath = yield* getFilePath(applicationId);
		const buffer = yield* readFile(filePath);
		const type = yield* getFileType(filePath);
		const extension = yield* getFileExtension(filePath);
		const pageCount = yield* getPageCount(type, buffer);
		
		let extractedText: string | undefined;
		const textExtractionOperationIds = yield* findOperations(applicationId, 'extractText');

		if (textExtractionOperationIds.length > 0) {
			const texts = yield* Effect.all(
				textExtractionOperationIds.map((operationId) =>
					Effect.gen(function* () {
						const operation = yield* getOperation(operationId);
						if (operation.status !== 'completed') return '';
						
						if (operation.data.service) {
							// Конвертируем Result в Effect для getOCRData
							const ocrDataResult = getOCRData(operation);
							if (ocrDataResult.isOk()) {
								return ocrDataResult.value;
							}
							return '';
						} else {
							return operation.data?.result as string || '';
						}
					})
				),
				{ concurrency: 'unbounded' }
			);
			
			extractedText = texts.filter((text) => text).join('\n');
		}

		return {
			name: getFileNameWithoutExtension(filePath),
			extension,
			type,
			pageCount,
			extractedText
		} as FileInfo;
	});
}
