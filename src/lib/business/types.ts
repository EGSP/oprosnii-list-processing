import { z } from 'zod';

/**
 * Схема валидации для типа изделия (объект)
 */
export const ProductTypeSchema = z.object({
	type: z.string().describe('Тип изделия, извлеченный из текста заявки'),
	reasoning: z
		.string()
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
 * Типы операций обработки
 */
export const ProcessingOperationTaskSchema = z.enum(['extractText', 'resolveProductType', 'resolveAbbreviation']);
export type ProcessingOperationTask = z.infer<typeof ProcessingOperationTaskSchema>;
export const ProcessingOperationStatusSchema = z.object({
	name: z.enum(['started', 'completed', 'failed']),
	date: z.iso.datetime()
});
export type ProcessingOperationStatus = z.infer<typeof ProcessingOperationStatusSchema>;

export const ProcessingOperationTagsSchema = z.enum(['deleted']);
export type ProcessingOperationTags = z.infer<typeof ProcessingOperationTagsSchema>;

export type ProcessingOperation = z.infer<typeof ProcessingOperationSchema>;
export const ProcessingOperationSchema = z.looseObject({
	id: z.uuid(),
	applicationId: z.uuid(),

	task: ProcessingOperationTaskSchema,
	status: ProcessingOperationStatusSchema,

	tags: z.array(ProcessingOperationTagsSchema).optional()
});


export const ApplicationTagsSchema = z.enum(['deleted']);
export type ApplicationTags = z.infer<typeof ApplicationTagsSchema>;
export const ApplicationSchema = z.looseObject({
	id: z.uuid(),
	originalFilename: z.string(),
	uploadDate: z.iso.datetime(),

	operations: z.array(ProcessingOperationSchema),

	productType: ProductTypeSchema.nullable().optional(),
	abbreviation: AbbreviationSchema.nullable().optional(),

	tags: z.array(ApplicationTagsSchema).optional()
});
export type Application = z.infer<typeof ApplicationSchema>;


/// META TYPES
export const ApplicationStatusInfoSchema = z.object({
	application: ApplicationSchema,
	status: z.enum(['nothing', 'processing', 'completed', 'failed']),
	operations: z.array(ProcessingOperationSchema).optional()
}).describe('Информация о статусе обработки заявки');
export type ApplicationStatusInfo = z.infer<typeof ApplicationStatusInfoSchema>;