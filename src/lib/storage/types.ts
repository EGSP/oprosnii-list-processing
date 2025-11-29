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
export type ProcessingOperationStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Схема валидации для requestData операции
 */
export const ProcessingOperationRequestDataSchema = z.object({
	endpoint: z.string().url(),
	method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
	headers: z.record(z.string()).optional(),
	body: z.unknown().optional()
});

/**
 * Схема валидации для ошибки операции
 */
export const ProcessingOperationErrorSchema = z.object({
	message: z.string(),
	code: z.string().optional(),
	details: z.unknown().optional()
});

/**
 * Схема валидации для прогресса операции
 */
export const ProcessingOperationProgressSchema = z.object({
	current: z.number(),
	total: z.number(),
	message: z.string().optional()
});

/**
 * Схема валидации для операции обработки
 */
export const ProcessingOperationSchema = z.object({
	id: z.string().uuid(),
	applicationId: z.string().uuid(),
	type: z.enum(['ocr', 'llm_product_type', 'llm_abbreviation']),
	provider: z.string(),
	status: z.enum(['pending', 'running', 'completed', 'failed']),
	externalOperationId: z.string().nullable().optional(),
	requestData: ProcessingOperationRequestDataSchema,
	result: z.record(z.unknown()).nullable().optional(),
	error: ProcessingOperationErrorSchema.nullable().optional(),
	createdAt: z.string().datetime(),
	startedAt: z.string().datetime().nullable().optional(),
	completedAt: z.string().datetime().nullable().optional(),
	progress: ProcessingOperationProgressSchema.nullable().optional(),
	retryCount: z.number().int().min(0).optional(),
	maxRetries: z.number().int().min(0).optional()
});

export type ProcessingOperation = z.infer<typeof ProcessingOperationSchema>;
export type ProcessingOperationRequestData = z.infer<typeof ProcessingOperationRequestDataSchema>;
export type ProcessingOperationError = z.infer<typeof ProcessingOperationErrorSchema>;
export type ProcessingOperationProgress = z.infer<typeof ProcessingOperationProgressSchema>;

/**
 * Обновления для операции обработки
 */
export type ProcessingOperationUpdate = Partial<
	Pick<
		ProcessingOperation,
		| 'status'
		| 'externalOperationId'
		| 'result'
		| 'error'
		| 'startedAt'
		| 'completedAt'
		| 'progress'
		| 'retryCount'
		| 'maxRetries'
	>
>;
