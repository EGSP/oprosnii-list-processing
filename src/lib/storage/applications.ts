import { getDatabase } from './db.js';
import { type Application, type ApplicationFilters, type ApplicationUpdate, ApplicationSchema, type ProductType, type Abbreviation } from '../business/types.js';
import { v4 as uuidv4 } from 'uuid';
import { StorageError, ValidationError } from './errors.js';
import { err, ok, Result } from 'neverthrow';
import { safeJsonParse } from '$lib/utils/json.js';

/**
 * Интерфейс строки из БД для Application
 */
export interface ApplicationRow {
	id: string;
	original_filename: string;
	product_type: string | null;
	abbreviation: string | null;
	upload_date: string;
}

/**
 * Преобразует строку из БД в объект Application
 */
export function rowToApplication(row: ApplicationRow): Application {
	return {
		id: row.id,
		originalFilename: row.original_filename,
		productType: safeJsonParse<ProductType>(row.product_type),
		abbreviation: safeJsonParse<Abbreviation>(row.abbreviation),
		uploadDate: row.upload_date
	};
}

/**
 * Преобразует объект Application в формат для записи в БД
 */
export function applicationToRow(application: Application): ApplicationRow {
	return {
		id: application.id,
		original_filename: application.originalFilename,
		product_type: application.productType ? JSON.stringify(application.productType) : null,
		abbreviation: application.abbreviation ? JSON.stringify(application.abbreviation) : null,
		upload_date: application.uploadDate
	};
}

/**
 * Получает заявку по GUID
 */
export function getApplication(guid: string): Result<Application, Error> {
	try {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM applications WHERE id = ?');
		const row = stmt.get(guid) as ApplicationRow | undefined;

		if (!row) {
			return err(new StorageError(`Application not found: ${guid}`));
		}

		return ok(rowToApplication(row));
	} catch (error) {
		return err(new StorageError('Failed to get application', error as Error));
	}
}

/**
 * Создает новую заявку в БД
 */
export function createApplication(originalFilename: string, guid?: string): Result<Application, Error> {
	const db = getDatabase();
	const id = guid || uuidv4();
	const now = new Date().toISOString();

	const application: Application = {
		id,
		originalFilename,
		productType: null,
		abbreviation: null,
		uploadDate: now
	};

	// Валидация через Zod
	let validated: Application;
	try {
		validated = ApplicationSchema.parse(application);
	} catch (error) {
		return err(new ValidationError('Invalid application data', error));
	}

	const row = applicationToRow(validated);

	try {
		const stmt = db.prepare(`
			INSERT INTO applications (
				id, original_filename, product_type, abbreviation, upload_date
			) VALUES (
				:id, :original_filename, :product_type, :abbreviation, :upload_date
			)
		`);

		stmt.run(row);
		return ok(validated);
	} catch (error) {
		return err(new StorageError('Failed to create application', error as Error));
	}
}

/**
 * Обновляет заявку
 */
export function updateApplication(guid: string, updates: ApplicationUpdate): Result<Application, Error> {
	const db = getDatabase();

	// Получаем текущую заявку
	const currentResult = getApplication(guid);
	if (currentResult.isErr()) {
		return currentResult;
	}

	const current = currentResult.value;

	// Объединяем обновления с текущими данными
	const updated = { ...current, ...updates };

	// Валидация
	let validated: Application;
	try {
		validated = ApplicationSchema.parse(updated);
	} catch (error) {
		return err(new ValidationError('Invalid application update data', error));
	}

	const row = applicationToRow(validated);

	try {
		const stmt = db.prepare(`
			UPDATE applications SET
				product_type = :product_type,
				abbreviation = :abbreviation
			WHERE id = :id
		`);

		stmt.run({ product_type: row.product_type, abbreviation: row.abbreviation, id: row.id });
		return ok(validated);
	} catch (error) {
		return err(new StorageError('Failed to update application', error as Error));
	}
}

/**
 * Удаляет заявку (опционально, для административных задач)
 */
export function deleteApplication(applicationId: string): Result<boolean, Error> {
	try {
		const db = getDatabase();
		const stmt = db.prepare('DELETE FROM applications WHERE id = ?');
		const result = stmt.run(applicationId);

		return ok(result.changes > 0);
	} catch (error) {
		return err(new StorageError('Failed to delete application', error as Error));
	}
}

/**
 * Получает список заявок с опциональной фильтрацией
 */
export function getApplications(filters?: ApplicationFilters): Result<Application[], Error> {
	const db = getDatabase();

	let query = 'SELECT * FROM applications WHERE 1=1';
	const params: (string | Date)[] = [];

	if (filters?.endDate) {
		query += ' AND upload_date <= ?';
		params.push(filters.endDate.toISOString());
	}

	if (filters?.productType) {
		// Фильтрация по типу изделия требует поиска в JSON
		query += ' AND product_type LIKE ?';
		params.push(`%"type":"${filters.productType}"%`);
	}

	query += ' ORDER BY upload_date DESC';

	try {
		const stmt = db.prepare(query);
		const rows = stmt.all(...params) as ApplicationRow[];

		return ok(rows.map(rowToApplication));
	} catch (error) {
		return err(new StorageError(`Failed to get applications ${error instanceof Error ? error.message : 'Unknown error'}`, error as Error));
	}
}



