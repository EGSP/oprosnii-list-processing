import { join } from 'path';
import {
	mkdirSync,
	writeFileSync,
	readFileSync,
	existsSync,
	readdirSync
} from 'fs';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { PDFDocument } from 'pdf-lib';
import { Effect, pipe } from 'effect';
import { getOCRData } from '$lib/ai/ocr.js';
import { getFileCategory } from './filesUtils.js';



export type FileCategory = 'pdf' | 'document' | 'spreadsheet' | 'image';
/**
 * Тип информации о файле (без buffer)
 */
export type FileInfo = {
	name: string;
	category: FileCategory;
	extension: string;
	pageCount: number;
	extractedText?: string;
}


export const ApplicationFiles = {
	/**
	  * Сохраняет файл заявки в хранилище
	  * @param fileBuffer - Buffer с содержимым файла
	  * @param applicationId - GUID заявки
	  * @param originalFilename - Оригинальное имя файла (для сохранения расширения)
	  * @returns Effect с путем к сохраненному файлу
	  */
	save: (fileBuffer: Buffer, applicationId: string, originalFilename: string): Effect.Effect<string, Error> => {
		return Effect.gen(function* () {
			const applicationDir = join(process.cwd(), config.uploadsDirectory, applicationId);
			mkdirSync(applicationDir, { recursive: true });

			const extension = originalFilename.split('.').pop() || '';
			const filename = `${applicationId}.${extension}`;
			const filePath = join(applicationDir, filename);

			writeFileSync(filePath, fileBuffer);

			return filePath;
		});
	},
	/**
	  * Получает путь к файлу заявки. Файл должен иметь GUID в имени. GUID - это ID заявки.
	  * @param applicationId - GUID заявки
	  * @returns Effect с путем к файлу заявки
	  */
	path: (applicationId: string): Effect.Effect<string, Error> => {
		return Effect.gen(function* () {
			const applicationDir = join(process.cwd(), config.uploadsDirectory, applicationId);

			const dirExists = yield* Effect.sync(() => existsSync(applicationDir));
			if (!dirExists) {
				return yield* Effect.fail(new Error(`Application directory not found for application ${applicationId}`));
			}

			// Ищем файл в директории заявки
			// Файл может иметь GUID как имя, с любым расширением
			const files = yield* Effect.try({
				try: () => readdirSync(applicationDir),
				catch: () => new Error(`Failed to read directory for application ${applicationId}`)
			});

			const file = files.find((f: string) => f.startsWith(applicationId));

			if (!file) {
				return yield* Effect.fail(new Error(`File not found for application ${applicationId}. Files: ${files.join(', ')}`));
			}

			return join(applicationDir, file);
		});
	},
	read: (applicationId: string): Effect.Effect<Buffer, Error> => {
		return Effect.gen(function* () {
			const filePath = yield* ApplicationFiles.path(applicationId);
			return readFileSync(filePath);
		});
	},
	category: (applicationId: string): Effect.Effect<FileCategory, Error> => {
		return Effect.gen(function* () {
			const path = yield* ApplicationFiles.path(applicationId);

			const category = getFileCategory(path);
			if (!category) {
				return yield* Effect.fail(new Error('Не удалось определить категорию файла'));
			}
			return category;
		});
	},
}

