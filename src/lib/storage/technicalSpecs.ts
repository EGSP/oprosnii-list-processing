import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { TechnicalSpec, TechnicalSpecSchema } from './types.js';
import { TechnicalSpecNotFoundError, ValidationError, StorageError } from './errors.js';

/**
 * Получает список всех доступных технических условий
 */
export function listTechnicalSpecs(): TechnicalSpec[] {
	const tuDir = join(process.cwd(), config.tuDirectory);

	if (!existsSync(tuDir)) {
		return [];
	}

	const files = readdirSync(tuDir).filter((file) => file.endsWith('.json'));

	const specs: TechnicalSpec[] = [];

	for (const file of files) {
		try {
			const filePath = join(tuDir, file);
			const content = readFileSync(filePath, 'utf-8');
			const spec = JSON.parse(content);
			const validated = TechnicalSpecSchema.parse(spec);
			specs.push(validated);
		} catch (error) {
			// Пропускаем невалидные файлы, логируем ошибку
			console.error(`Error reading technical spec ${file}:`, error);
			// Можно также выбросить ошибку, если нужна строгая валидация
		}
	}

	return specs;
}

/**
 * Получает конкретное техническое условие по ID
 */
export function getTechnicalSpec(id: string): TechnicalSpec | null {
	const tuDir = join(process.cwd(), config.tuDirectory);
	const filePath = join(tuDir, `${id}.json`);

	if (!existsSync(filePath)) {
		return null;
	}

	try {
		const content = readFileSync(filePath, 'utf-8');
		const spec = JSON.parse(content);
		const validated = TechnicalSpecSchema.parse(spec);
		return validated;
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			return null;
		}
		console.error(`Error reading technical spec ${id}:`, error);
		return null;
	}
}

/**
 * Сохраняет техническое условие
 */
export function saveTechnicalSpec(spec: TechnicalSpec): boolean {
	const tuDir = join(process.cwd(), config.tuDirectory);

	// Создаем директорию, если её нет
	mkdirSync(tuDir, { recursive: true });

	// Валидация
	try {
		const validated = TechnicalSpecSchema.parse(spec);
		const filePath = join(tuDir, `${validated.id}.json`);
		writeFileSync(filePath, JSON.stringify(validated, null, '\t'), 'utf-8');
		return true;
	} catch (error) {
		if (error instanceof Error && error.name === 'ZodError') {
			throw new ValidationError(`Invalid technical spec data: ${error.message}`, error);
		}
		throw new StorageError(`Failed to save technical spec ${spec.id}`, error as Error);
	}
}

/**
 * Удаляет техническое условие
 */
export function deleteTechnicalSpec(id: string): boolean {
	const tuDir = join(process.cwd(), config.tuDirectory);
	const filePath = join(tuDir, `${id}.json`);

	if (!existsSync(filePath)) {
		return false;
	}

	try {
		unlinkSync(filePath);
		return true;
	} catch (error) {
		console.error(`Error deleting technical spec ${id}:`, error);
		return false;
	}
}
