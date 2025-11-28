import Database from 'better-sqlite3';
import { join } from 'path';
import { config } from '../config.js';
import { Application } from './types.js';
import { mkdirSync } from 'fs';

let dbInstance: Database.Database | null = null;

/**
 * Получает экземпляр подключения к базе данных
 * Инициализирует БД и создает таблицы при первом вызове
 */
export function getDatabase(): Database.Database {
	if (dbInstance) {
		return dbInstance;
	}

	// Создаем директорию для БД, если её нет
	const dbDir = join(process.cwd(), 'data', 'db');
	mkdirSync(dbDir, { recursive: true });

	const dbPath = join(process.cwd(), config.dbPath);
	dbInstance = new Database(dbPath);

	// Включаем WAL режим для лучшей производительности
	dbInstance.pragma('journal_mode = WAL');

	// Инициализируем схему БД
	initializeDatabase(dbInstance);

	return dbInstance;
}

/**
 * Инициализирует схему базы данных
 */
function initializeDatabase(db: Database.Database): void {
	const createTableSQL = `
		CREATE TABLE IF NOT EXISTS applications (
			id TEXT PRIMARY KEY,
			original_filename TEXT NOT NULL,
			product_type TEXT,
			ocr_result TEXT,
			llm_product_type_result TEXT,
			llm_abbreviation_result TEXT,
			arrival_date TEXT NOT NULL,
			processing_start_date TEXT,
			processing_end_date TEXT
		)
	`;

	db.exec(createTableSQL);
}

/**
 * Закрывает подключение к базе данных
 */
export function closeDatabase(): void {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
}

/**
 * Безопасный парсинг JSON с обработкой ошибок
 */
function safeJsonParse(jsonString: string | null): any | null {
	if (!jsonString) return null;
	try {
		return JSON.parse(jsonString);
	} catch (error) {
		console.error('Error parsing JSON from database:', error);
		return null;
	}
}

/**
 * Преобразует строку из БД в объект Application
 */
export function rowToApplication(row: any): Application {
	return {
		id: row.id,
		originalFilename: row.original_filename,
		productType: row.product_type || null,
		ocrResult: safeJsonParse(row.ocr_result),
		llmProductTypeResult: safeJsonParse(row.llm_product_type_result),
		llmAbbreviationResult: safeJsonParse(row.llm_abbreviation_result),
		arrivalDate: row.arrival_date,
		processingStartDate: row.processing_start_date || null,
		processingEndDate: row.processing_end_date || null
	};
}

/**
 * Преобразует объект Application в формат для записи в БД
 */
export function applicationToRow(application: Partial<Application>): any {
	const row: any = {};

	if (application.id !== undefined) row.id = application.id;
	if (application.originalFilename !== undefined)
		row.original_filename = application.originalFilename;
	if (application.productType !== undefined) row.product_type = application.productType;
	if (application.ocrResult !== undefined)
		row.ocr_result = application.ocrResult ? JSON.stringify(application.ocrResult) : null;
	if (application.llmProductTypeResult !== undefined)
		row.llm_product_type_result = application.llmProductTypeResult
			? JSON.stringify(application.llmProductTypeResult)
			: null;
	if (application.llmAbbreviationResult !== undefined)
		row.llm_abbreviation_result = application.llmAbbreviationResult
			? JSON.stringify(application.llmAbbreviationResult)
			: null;
	if (application.arrivalDate !== undefined) row.arrival_date = application.arrivalDate;
	if (application.processingStartDate !== undefined)
		row.processing_start_date = application.processingStartDate;
	if (application.processingEndDate !== undefined)
		row.processing_end_date = application.processingEndDate;

	return row;
}

