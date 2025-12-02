import { z } from 'zod';

/**
 * Схема валидации для заявки
 */
export const ApplicationSchema = z.object({
	id: z.string().uuid(),
	originalFilename: z.string(),
	productType: z.string().nullable().optional(),
	ocrResult: z.record(z.unknown()).nullable().optional(),
	llmProductTypeResult: z.record(z.unknown()).nullable().optional(),
	llmAbbreviationResult: z.record(z.unknown()).nullable().optional(),
	arrivalDate: z.string().datetime(),
	processingStartDate: z.string().datetime().nullable().optional(),
	processingEndDate: z.string().datetime().nullable().optional()
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
	Pick<
		Application,
		| 'productType'
		| 'ocrResult'
		| 'llmProductTypeResult'
		| 'llmAbbreviationResult'
		| 'processingStartDate'
		| 'processingEndDate'
	>
>;

/**
 * Схема валидации для технических условий
 */
export const TechnicalSpecRuleSchema = z.object({
	parameter: z.string(),
	code: z.string(),
	description: z.string()
});

export const TechnicalSpecSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	rules: z.array(TechnicalSpecRuleSchema),
	abbreviationTemplate: z.string()
});

export type TechnicalSpecRule = z.infer<typeof TechnicalSpecRuleSchema>;
export type TechnicalSpec = z.infer<typeof TechnicalSpecSchema>;

/**
 * Типы операций обработки
 */
export type ProcessingOperationType = 'ocr' | 'llm_product_type' | 'llm_abbreviation';
export type ProcessingOperationStatus = 'running' | 'completed' | 'failed';

/**
 * Схема валидации для операции обработки
 */
export const ProcessingOperationSchema = z.object({
	id: z.string().uuid(),
	applicationId: z.string().uuid(),
	type: z.enum(['file','ocr', 'llm_product_type', 'llm_abbreviation']),
	provider: z.string(),
	status: z.enum(['running', 'completed', 'failed']),
	providerData: z.record(z.unknown()),
	result: z.record(z.unknown()).nullable().optional(),
	createdAt: z.string().datetime(),
	completedAt: z.string().datetime().nullable().optional()
});

export type ProcessingOperation = z.infer<typeof ProcessingOperationSchema>;

/**
 * Обновления для операции обработки
 */
export type ProcessingOperationUpdate = Partial<
	Pick<ProcessingOperation, 'status' | 'providerData' | 'result' | 'completedAt'>
>;
