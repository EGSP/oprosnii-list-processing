import Database from 'better-sqlite3';
import { join } from 'path';
import { config } from '../config.js';
import { Application, ProcessingOperation } from './types.js';
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
			external_operation_id TEXT,
			request_data TEXT NOT NULL,
			result TEXT,
			error TEXT,
			created_at TEXT NOT NULL,
			started_at TEXT,
			completed_at TEXT,
			progress TEXT,
			retry_count INTEGER DEFAULT 0,
			max_retries INTEGER DEFAULT 3,
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

/**
 * Преобразует строку из БД в объект ProcessingOperation
 */
export function rowToProcessingOperation(row: any): ProcessingOperation {
	return {
		id: row.id,
		applicationId: row.application_id,
		type: row.type as ProcessingOperation['type'],
		provider: row.provider,
		status: row.status as ProcessingOperation['status'],
		externalOperationId: row.external_operation_id || null,
		requestData: safeJsonParse(row.request_data) || { endpoint: '', method: 'POST' },
		result: safeJsonParse(row.result),
		error: safeJsonParse(row.error),
		createdAt: row.created_at,
		startedAt: row.started_at || null,
		completedAt: row.completed_at || null,
		progress: safeJsonParse(row.progress),
		retryCount: row.retry_count ?? 0,
		maxRetries: row.max_retries ?? 3
	};
}

/**
 * Преобразует объект ProcessingOperation в формат для записи в БД
 */
export function processingOperationToRow(operation: Partial<ProcessingOperation>): any {
	const row: any = {};

	if (operation.id !== undefined) row.id = operation.id;
	if (operation.applicationId !== undefined) row.application_id = operation.applicationId;
	if (operation.type !== undefined) row.type = operation.type;
	if (operation.provider !== undefined) row.provider = operation.provider;
	if (operation.status !== undefined) row.status = operation.status;
	if (operation.externalOperationId !== undefined)
		row.external_operation_id = operation.externalOperationId ?? null;
	if (operation.requestData !== undefined) row.request_data = JSON.stringify(operation.requestData);
	if (operation.result !== undefined)
		row.result = operation.result ? JSON.stringify(operation.result) : null;
	if (operation.error !== undefined)
		row.error = operation.error ? JSON.stringify(operation.error) : null;
	if (operation.createdAt !== undefined) row.created_at = operation.createdAt;
	if (operation.startedAt !== undefined) row.started_at = operation.startedAt ?? null;
	if (operation.completedAt !== undefined) row.completed_at = operation.completedAt ?? null;
	if (operation.progress !== undefined)
		row.progress = operation.progress ? JSON.stringify(operation.progress) : null;
	if (operation.retryCount !== undefined) row.retry_count = operation.retryCount ?? 0;
	if (operation.maxRetries !== undefined) row.max_retries = operation.maxRetries ?? 3;

	return row;
}
