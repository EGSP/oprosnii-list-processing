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

