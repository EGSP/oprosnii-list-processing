import { z } from "zod";
import { Effect } from "effect";

/**
 * Парсит объект с помощью Zod схемы и возвращает Effect с результатом
 * 
 * @param data - Объект для парсинга
 * @param schema - Zod схема для валидации
 * @returns Effect с распарсенным объектом или ошибкой
 */
export function parseZodSchema<T extends z.ZodTypeAny>(
	data: unknown,
	schema: T
): Effect.Effect<z.infer<T>, Error> {
	return Effect.try({
		try: () => schema.parse(data),
		catch: (error ) => {
			const message = `Не удалось валидировать данные по схеме`;
			return new Error(message + `: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	});
}

/**
 * Парсит Response объект в JSON и затем с помощью Zod схемы и возвращает Effect с результатом
 * 
 * @param response - Response объект
 * @param schema - Zod схема для валидации
 * @returns Effect с распарсенным объектом или ошибкой
 */
export function responseToZodSchema<T extends z.ZodTypeAny>(
	response: Response,
	schema: T
): Effect.Effect<z.infer<T>, Error> {
	return Effect.tryPromise({
		try: async () => {
			const data = await response.json();
			const result = schema.safeParse(data);
			if (result.success) {
				return result.data;
			} else {
				throw new Error(
					`Ошибка валидации ответа: ${JSON.stringify(data)}`
				);
			}
		},
		catch: (error) => {
			return error as Error;
		}
	});
}