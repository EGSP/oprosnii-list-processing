/**
 * Модуль извлечения текста из документов и таблиц
 *
 * Использует библиотеку textract для извлечения текста из различных форматов файлов.
 * Поддерживает форматы документов: docx, doc, rtf
 * Поддерживает форматы таблиц: xls, xlsx, xlsb, xlsm, xltx
 */

import { getFileNameWithExtension, getFilePath, readApplicationFile, type FileInfo } from '$lib/storage/files';
import { Effect } from 'effect';

// Ленивая загрузка textract через динамический импорт (для ESM совместимости)
// @ts-ignore - textract не имеет типов TypeScript
let textractCache: any = null;
async function getTextract() {
	if (!textractCache) {
		// @ts-ignore - textract не имеет типов TypeScript
		textractCache = await import('textract');
	}
	return textractCache;
}

/**
 * Поддерживаемые форматы документов
 */
const SUPPORTED_DOCUMENT_FORMATS = ['docx', 'doc', 'rtf'] as const;

/**
 * Поддерживаемые форматы таблиц
 */
const SUPPORTED_SPREADSHEET_FORMATS = ['xls', 'xlsx', 'xlsb', 'xlsm', 'xltx'] as const;

/**
 * Извлекает текст из документов (docx, doc, rtf)
 *
 * @param buffer - Буфер файла
 * @param filenameWithExtension - Имя файла с расширением (например, "document.docx")
 * @returns Effect с результатом извлечения текста
 */
export function extractTextFromDocuments(
	buffer: Buffer,
	filenameWithExtension: string
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		// Извлекаем расширение из имени файла
		const extension = filenameWithExtension.split('.').pop()?.toLowerCase() || '';
		const normalizedExtension = extension.replace(/^\./, '');
		
		if (!SUPPORTED_DOCUMENT_FORMATS.includes(normalizedExtension as typeof SUPPORTED_DOCUMENT_FORMATS[number])) {
			return yield* Effect.fail(
				new Error(
					`Неподдерживаемый формат документа: ${extension}. Поддерживаются: ${SUPPORTED_DOCUMENT_FORMATS.join(', ')}`
				)
			);
		}

		const textract = yield* Effect.tryPromise({
			try: () => getTextract(),
			catch: (error) => new Error(
				`Ошибка при загрузке textract: ${error instanceof Error ? error.message : String(error)}`
			)
		});

		return yield* Effect.async<string, Error>((resume) => {
			textract.fromBufferWithName(
				filenameWithExtension,
				buffer,
				(error: Error | null, text: string | undefined) => {
					if (error) {
						const errorMessage =
							error instanceof Error
								? error.message
								: `Ошибка при извлечении текста из документа: ${String(error)}`;
						resume(Effect.fail(new Error(errorMessage)));
					} else {
						resume(Effect.succeed(text || ''));
					}
				}
			);
		});
	});
}

/**
 * Извлекает текст из таблиц (xls, xlsx, xlsb, xlsm, xltx)
 *
 * @param buffer - Буфер файла
 * @param filenameWithExtension - Имя файла с расширением (например, "spreadsheet.xlsx")
 * @returns Effect с результатом извлечения текста
 */
export function extractTextFromSpreadsheets(
	buffer: Buffer,
	filenameWithExtension: string
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		// Извлекаем расширение из имени файла
		const extension = filenameWithExtension.split('.').pop()?.toLowerCase() || '';
		const normalizedExtension = extension.replace(/^\./, '');
		
		if (
			!SUPPORTED_SPREADSHEET_FORMATS.includes(
				normalizedExtension as typeof SUPPORTED_SPREADSHEET_FORMATS[number]
			)
		) {
			return yield* Effect.fail(
				new Error(
					`Неподдерживаемый формат таблицы: ${extension}. Поддерживаются: ${SUPPORTED_SPREADSHEET_FORMATS.join(', ')}`
				)
			);
		}

		const textract = yield* Effect.tryPromise({
			try: () => getTextract(),
			catch: (error) => new Error(
				`Ошибка при загрузке textract: ${error instanceof Error ? error.message : String(error)}`
			)
		});

		return yield* Effect.async<string, Error>((resume) => {
			textract.fromBufferWithName(
				filenameWithExtension,
				buffer,
				(error: Error | null, text: string | undefined) => {
					if (error) {
						const errorMessage =
							error instanceof Error
								? error.message
								: `Ошибка при извлечении текста из таблицы: ${String(error)}`;
						resume(Effect.fail(new Error(errorMessage)));
					} else {
						resume(Effect.succeed(text || ''));
					}
				}
			);
		});
	});
}

/**
 * Извлекает текст из файла заявки
 * @param applicationId - GUID заявки
 * @param fileInfo - Информация о файле
 * @returns Effect с результатом извлечения текста
 */
export function extractTextFromApplicationFile(applicationId: string, fileInfo: FileInfo): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const fileBuffer = yield* readApplicationFile(applicationId);
		const filePath = yield* getFilePath(applicationId);
		const filenameWithExtension = getFileNameWithExtension(filePath);
		
		if (fileInfo.type === 'document') {
			return yield* extractTextFromDocuments(fileBuffer, filenameWithExtension);
		} else if (fileInfo.type === 'spreadsheet') {
			return yield* extractTextFromSpreadsheets(fileBuffer, filenameWithExtension);
		}
		return yield* Effect.fail(new Error('Неподдерживаемый тип файла'));
	});
}

