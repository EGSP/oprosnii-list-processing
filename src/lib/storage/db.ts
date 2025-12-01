import Database from 'better-sqlite3';
import { join } from 'path';
import { config } from '../config.js';
import { type Application, type ProcessingOperation } from './types.js';
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
	const createApplicationsTableSQL = `
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

	const createOperationsTableSQL = `
		CREATE TABLE IF NOT EXISTS processing_operations (
			id TEXT PRIMARY KEY,
			application_id TEXT NOT NULL,
			type TEXT NOT NULL,
			provider TEXT NOT NULL,
			status TEXT NOT NULL,
			provider_data TEXT NOT NULL,
			result TEXT,
			created_at TEXT NOT NULL,
			completed_at TEXT,
			FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
			UNIQUE(application_id, type)
		)
	`;

	db.exec(createApplicationsTableSQL);
	db.exec(createOperationsTableSQL);
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
function safeJsonParse(jsonString: string | null): Record<string, unknown> | null {
	if (!jsonString) return null;
	try {
		return JSON.parse(jsonString) as Record<string, unknown>;
	} catch (error) {
		console.error('Error parsing JSON from database:', error);
		return null;
	}
}

/**
 * Интерфейс строки из БД для Application
 */
export interface ApplicationRow {
	id: string;
	original_filename: string;
	product_type: string | null;
	ocr_result: string | null;
	llm_product_type_result: string | null;
	llm_abbreviation_result: string | null;
	arrival_date: string;
	processing_start_date: string | null;
	processing_end_date: string | null;
}

/**
 * Преобразует строку из БД в объект Application
 */
export function rowToApplication(row: ApplicationRow): Application {
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
export function applicationToRow(application: Partial<Application>): Partial<ApplicationRow> {
	const row: Partial<ApplicationRow> = {};

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

/**
 * Интерфейс строки из БД для ProcessingOperation
 */
export interface ProcessingOperationRow {
	id: string;
	application_id: string;
	type: string;
	provider: string;
	status: string;
	provider_data: string;
	result: string | null;
	created_at: string;
	completed_at: string | null;
}

/**
 * Преобразует строку из БД в объект ProcessingOperation
 */
export function rowToProcessingOperation(row: ProcessingOperationRow): ProcessingOperation {
	return {
		id: row.id,
		applicationId: row.application_id,
		type: row.type as ProcessingOperation['type'],
		provider: row.provider,
		status: row.status as ProcessingOperation['status'],
		providerData: safeJsonParse(row.provider_data) || {},
		result: safeJsonParse(row.result),
		createdAt: row.created_at,
		completedAt: row.completed_at || null
	};
}

/**
 * Преобразует объект ProcessingOperation в формат для записи в БД
 */
export function processingOperationToRow(operation: Partial<ProcessingOperation>): Partial<ProcessingOperationRow> {
	const row: Partial<ProcessingOperationRow> = {};

	if (operation.id !== undefined) row.id = operation.id;
	if (operation.applicationId !== undefined) row.application_id = operation.applicationId;
	if (operation.type !== undefined) row.type = operation.type;
	if (operation.provider !== undefined) row.provider = operation.provider;
	if (operation.status !== undefined) row.status = operation.status;
	if (operation.providerData !== undefined)
		row.provider_data = JSON.stringify(operation.providerData);
	if (operation.result !== undefined)
		row.result = operation.result ? JSON.stringify(operation.result) : null;
	if (operation.createdAt !== undefined) row.created_at = operation.createdAt;
	if (operation.completedAt !== undefined) row.completed_at = operation.completedAt ?? null;

	return row;
}
