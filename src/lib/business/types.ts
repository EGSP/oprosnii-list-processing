import { z } from 'zod';

/**
 * Схема валидации для типа изделия (объект)
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

export type ProductType = z.infer<typeof ProductTypeSchema>;

/**
 * Схема валидации для аббревиатуры (объект)
 */
export const AbbreviationSchema = z.object({
	parameters: z
		.array(
			z.object({
				parameter: z.string().describe('Название параметра (например, material, climate)'),
				value: z.string().describe('Значение параметра, найденное в тексте'),
				code: z.string().optional().describe('Код параметра согласно ТУ (если найден)'),
				confidence: z
					.number()
					.min(0)
					.max(1)
					.optional()
					.describe('Уровень уверенности в извлечении параметра (0-1)')
			})
		)
		.describe('Список извлеченных параметров для формирования аббревиатуры'),
	abbreviation: z.string().describe('Сформированная аббревиатура'),
	technicalSpecId: z.string().optional().describe('ID технического условия, использованного для формирования'),
	generatedAt: z.string().datetime().optional().describe('Дата и время формирования аббревиатуры')
});

export type Abbreviation = z.infer<typeof AbbreviationSchema>;

/**
 * Схема валидации для заявки
 */
export const ApplicationSchema = z.object({
	id: z.string().uuid(),
	originalFilename: z.string(),
	productType: ProductTypeSchema.nullable().optional(),
	abbreviation: AbbreviationSchema.nullable().optional(),
	uploadDate: z.string().datetime()
});

export type Application = z.infer<typeof ApplicationSchema>;

/**
 * Фильтры для списка заявок
 */
export interface ApplicationFilters {
	startDate?: Date;
	endDate?: Date;
	productType?: string;
}

/**
 * Обновления для заявки
 */
export type ApplicationUpdate = Partial<
	Pick<Application, 'productType' | 'abbreviation'>
>;

/**
 * Типы операций обработки
 */
export type ProcessingOperationTask = z.infer<typeof ProcessingOperationTaskSchema>;
export const ProcessingOperationTaskSchema = z.enum(['extractText', 'generateProductType', 'generateAbbreviation']);
export type ProcessingOperationStatus = z.infer<typeof ProcessingOperationStatusSchema>;
export const ProcessingOperationStatusSchema = z.enum(['started', 'completed', 'failed']);

export type ProcessingOperation = z.infer<typeof ProcessingOperationSchema>;
/**
 * Схема валидации для операции обработки
 */
export const ProcessingOperationSchema = z.object({
	id: z.string().uuid(),
	applicationId: z.string().uuid(),
	task: ProcessingOperationTaskSchema,
	status: ProcessingOperationStatusSchema,
	data: z.object({
		result: z.unknown().optional(),
		service: z.string().optional()
	}).passthrough(),
	startDate: z.string().datetime().describe('Дата и время начала операции'),
	finishDate: z.string().datetime().nullable().optional().describe('Дата и время окончания операции')
}).describe('Операция обработки');

/**
 * Обновления для операции обработки
 */
export type ProcessingOperationUpdate = Partial<
	Pick<ProcessingOperation, 'status' | 'data' | 'finishDate'>
>;


/// META TYPES

export const ApplicationStatusInfoSchema = z.object({
	application: ApplicationSchema,
	status: z.enum(['nothing','processing', 'completed', 'failed']),
	operations: z.array(ProcessingOperationSchema).optional()
}).describe('Информация о статусе обработки заявки');
export type ApplicationStatusInfo = z.infer<typeof ApplicationStatusInfoSchema>;