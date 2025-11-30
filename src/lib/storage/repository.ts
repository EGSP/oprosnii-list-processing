import { getDatabase, rowToApplication, applicationToRow, type ApplicationRow } from './db.js';
import { type Application, type ApplicationFilters, type ApplicationUpdate, ApplicationSchema } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { StorageError, ValidationError } from './errors.js';

/**
 * Создает новую заявку в БД
 */
export function createApplication(originalFilename: string, guid?: string): Application {
	const db = getDatabase();
	const id = guid || uuidv4();
	const now = new Date().toISOString();

	const application: Application = {
		id,
		originalFilename,
		productType: null,
		ocrResult: null,
		llmProductTypeResult: null,
		llmAbbreviationResult: null,
		arrivalDate: now,
		processingStartDate: null,
		processingEndDate: null
	};

	// Валидация через Zod
	let validated: Application;
	try {
		validated = ApplicationSchema.parse(application);
	} catch (error) {
		throw new ValidationError('Invalid application data', error);
	}

	const row = applicationToRow(validated);

	try {
		const stmt = db.prepare(`
			INSERT INTO applications (
				id, original_filename, product_type, ocr_result,
				llm_product_type_result, llm_abbreviation_result,
				arrival_date, processing_start_date, processing_end_date
			) VALUES (
				:id, :original_filename, :product_type, :ocr_result,
				:llm_product_type_result, :llm_abbreviation_result,
				:arrival_date, :processing_start_date, :processing_end_date
			)
		`);

		stmt.run(row);
	} catch (error) {
		throw new StorageError('Failed to create application', error as Error);
	}

	return validated;
}

/**
 * Получает заявку по GUID
 */
export function getApplication(guid: string): Application | null {
	try {
		const db = getDatabase();
		const stmt = db.prepare('SELECT * FROM applications WHERE id = ?');
		const row = stmt.get(guid) as ApplicationRow | undefined;

		if (!row) {
			return null;
		}

		return rowToApplication(row);
	} catch (error) {
		throw new StorageError('Failed to get application', error as Error);
	}
}

/**
 * Обновляет заявку
 */
export function updateApplication(guid: string, updates: ApplicationUpdate): Application | null {
	const db = getDatabase();

	// Получаем текущую заявку
	const current = getApplication(guid);
	if (!current) {
		return null;
	}

	// Объединяем обновления с текущими данными
	const updated = { ...current, ...updates };

	// Валидация
	let validated: Application;
	try {
		validated = ApplicationSchema.parse(updated);
	} catch (error) {
		throw new ValidationError('Invalid application update data', error);
	}

	const row = applicationToRow(validated);

	try {
		const stmt = db.prepare(`
			UPDATE applications SET
				product_type = :product_type,
				ocr_result = :ocr_result,
				llm_product_type_result = :llm_product_type_result,
				llm_abbreviation_result = :llm_abbreviation_result,
				processing_start_date = :processing_start_date,
				processing_end_date = :processing_end_date
			WHERE id = :id
		`);

		stmt.run(row);
	} catch (error) {
		throw new StorageError('Failed to update application', error as Error);
	}

	return validated;
}

/**
 * Получает список заявок с опциональной фильтрацией
 */
export function listApplications(filters?: ApplicationFilters): Application[] {
	const db = getDatabase();

	let query = 'SELECT * FROM applications WHERE 1=1';
	const params: (string | Date)[] = [];

	if (filters?.startDate) {
		query += ' AND arrival_date >= ?';
		params.push(filters.startDate.toISOString());
	}

	if (filters?.endDate) {
		query += ' AND arrival_date <= ?';
		params.push(filters.endDate.toISOString());
	}

	if (filters?.productType) {
		query += ' AND product_type = ?';
		params.push(filters.productType);
	}

	query += ' ORDER BY arrival_date DESC';

	try {
		const stmt = db.prepare(query);
		const rows = stmt.all(...params) as ApplicationRow[];

		return rows.map(rowToApplication);
	} catch (error) {
		throw new StorageError('Failed to list applications', error as Error);
	}
}

/**
 * Удаляет заявку (опционально, для административных задач)
 */
export function deleteApplication(guid: string): boolean {
	try {
		const db = getDatabase();
		const stmt = db.prepare('DELETE FROM applications WHERE id = ?');
		const result = stmt.run(guid);

		return result.changes > 0;
	} catch (error) {
		throw new StorageError('Failed to delete application', error as Error);
	}
}
