/**
 * Конфигурация приложения
 *
 * В SvelteKit переменные окружения для клиента должны иметь префикс VITE_
 * Для серверной части используйте $env/static/private
 */

export const config = {
	// Лимиты для файлов
	maxFileSizeMB: Number(import.meta.env.VITE_MAX_FILE_SIZE_MB || 10),
	maxFileSizeBytes: Number(import.meta.env.VITE_MAX_FILE_SIZE_MB || 10) * 1024 * 1024,

	// Лимиты для LLM
	maxTextLengthForLLM: Number(import.meta.env.VITE_MAX_TEXT_LENGTH_FOR_LLM || 6000),

	// Поддерживаемые форматы файлов
	supportedFileTypes: {
		documents: [
			'application/pdf',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		],
		spreadsheets: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
		images: ['image/png', 'image/jpeg', 'image/jpg']
	},

	// Путь к файлам ТУ
	tuDirectory: 'data/tu',
	instructionsDirectory: 'data/instructions',

	// Путь к базе данных
	dbPath: 'data/db/applications.db',

	// Путь к хранилищу файлов заявок
	uploadsDirectory: 'data/uploads'
} as const;
