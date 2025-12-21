import Database from 'better-sqlite3';
import { join } from 'path';
import { config } from '../config.js';
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
			abbreviation TEXT,
			upload_date TEXT NOT NULL,
			deleted INTEGER DEFAULT 0
		)
	`;

	const createOperationsTableSQL = `
		CREATE TABLE IF NOT EXISTS processing_operations (
			id TEXT PRIMARY KEY,
			application_id TEXT NOT NULL,
			task TEXT NOT NULL,
			status TEXT NOT NULL,
			data TEXT NOT NULL,
			start_date TEXT NOT NULL,
			finish_date TEXT,
			deleted INTEGER DEFAULT 0,
			FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
			UNIQUE(application_id, task)
		)
	`;

	db.exec(createApplicationsTableSQL);
	db.exec(createOperationsTableSQL);

	// Миграция: добавляем поле deleted к существующим таблицам, если его нет
	migrateDatabase(db);
}

/**
 * Выполняет миграции базы данных
 */
function migrateDatabase(db: Database.Database): void {
	// Проверяем наличие колонки deleted в таблице applications
	try {
		const appsInfo = db.prepare("PRAGMA table_info(applications)").all() as Array<{ name: string }>;
		const hasDeletedInApps = appsInfo.some((col) => col.name === 'deleted');
		if (!hasDeletedInApps) {
			db.exec('ALTER TABLE applications ADD COLUMN deleted INTEGER DEFAULT 0');
		}
	} catch (error) {
		// Игнорируем ошибки, если таблица не существует или колонка уже есть
	}

	// Проверяем наличие колонки deleted в таблице processing_operations
	try {
		const opsInfo = db.prepare("PRAGMA table_info(processing_operations)").all() as Array<{ name: string }>;
		const hasDeletedInOps = opsInfo.some((col) => col.name === 'deleted');
		if (!hasDeletedInOps) {
			db.exec('ALTER TABLE processing_operations ADD COLUMN deleted INTEGER DEFAULT 0');
		}
	} catch (error) {
		// Игнорируем ошибки, если таблица не существует или колонка уже есть
	}
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
