/**
 * Zod схемы для structured output от LLM
 *
 * Используются для валидации ответов от YandexGPT при обработке заявок.
 */

import { z } from 'zod';
import type { TechnicalSpec } from '../storage/types.js';

/**
 * Схема для результата определения типа изделия
 */
export const ProductTypeSchema = z.object({
	type: z.string().describe('Тип изделия, извлеченный из текста заявки'),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe('Уровень уверенности в определении типа (0-1)'),
	reasoning: z
		.string()
		.optional()
		.describe('Обоснование выбора типа изделия на основе текста заявки')
});

export type ProductTypeResult = z.infer<typeof ProductTypeSchema>;

/**
 * Схема для параметра аббревиатуры
 */
export const AbbreviationParameterSchema = z.object({
	parameter: z.string().describe('Название параметра (например, material, climate)'),
	value: z.string().describe('Значение параметра, найденное в тексте'),
	code: z.string().optional().describe('Код параметра согласно ТУ (если найден)'),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe('Уровень уверенности в извлечении параметра (0-1)')
});

/**
 * Схема для списка параметров аббревиатуры
 */
export const AbbreviationParametersSchema = z.object({
	parameters: z
		.array(AbbreviationParameterSchema)
		.describe('Список извлеченных параметров для формирования аббревиатуры')
});

export type AbbreviationParameter = z.infer<typeof AbbreviationParameterSchema>;
export type AbbreviationParametersResult = z.infer<typeof AbbreviationParametersSchema>;

/**
 * Валидирует параметры аббревиатуры по правилам ТУ
 *
 * Проверяет, что коды параметров соответствуют правилам из технических условий.
 * Если код не найден в ТУ, пытается найти его по описанию или значению.
 *
 * @param parameters - Извлеченные параметры
 * @param technicalSpec - Техническое условие с правилами
 * @returns Валидированные параметры с кодами из ТУ
 */
export function validateParametersAgainstTU(
	parameters: AbbreviationParameter[],
	technicalSpec: TechnicalSpec
): AbbreviationParameter[] {
	const validated: AbbreviationParameter[] = [];

	for (const param of parameters) {
		// Ищем правило в ТУ по названию параметра
		const rule = technicalSpec.rules.find((r) => r.parameter === param.parameter);

		if (rule) {
			// Если правило найдено, проверяем код
			if (param.code && param.code === rule.code) {
				// Код совпадает с ТУ - все хорошо
				validated.push({
					...param,
					code: rule.code
				});
			} else if (param.value) {
				// Пытаемся найти код по значению или описанию
				// Если значение совпадает с описанием правила, используем код из ТУ
				const valueLower = param.value.toLowerCase();
				const descriptionLower = rule.description.toLowerCase();

				if (valueLower.includes(descriptionLower) || descriptionLower.includes(valueLower)) {
					validated.push({
						...param,
						code: rule.code
					});
				} else {
					// Используем код из ТУ по умолчанию, если параметр найден
					validated.push({
						...param,
						code: rule.code
					});
				}
			} else {
				// Параметр найден, но значение не указано - используем код из ТУ
				validated.push({
					...param,
					code: rule.code
				});
			}
		} else {
			// Правило не найдено в ТУ - оставляем параметр как есть
			// (возможно, это дополнительный параметр, не описанный в ТУ)
			validated.push(param);
		}
	}

	return validated;
}

/**
 * Формирует аббревиатуру по шаблону из ТУ
 *
 * @param parameters - Валидированные параметры с кодами
 * @param template - Шаблон аббревиатуры из ТУ (например, "{material}-{climate}-{size}")
 * @returns Сформированная аббревиатура
 */
export function generateAbbreviation(
	parameters: AbbreviationParameter[],
	template: string
): string {
	let abbreviation = template;

	// Заменяем плейсхолдеры в шаблоне на коды параметров
	for (const param of parameters) {
		if (param.code) {
			abbreviation = abbreviation.replace(`{${param.parameter}}`, param.code);
		} else if (param.value) {
			// Если кода нет, используем значение
			abbreviation = abbreviation.replace(`{${param.parameter}}`, param.value);
		}
	}

	// Удаляем оставшиеся плейсхолдеры, для которых не нашлось значений
	abbreviation = abbreviation.replace(/\{[^}]+\}/g, '');

	// Удаляем двойные дефисы и дефисы в начале/конце
	abbreviation = abbreviation.replace(/--+/g, '-').replace(/^-|-$/g, '');

	return abbreviation;
}
