/**
 * Модуль централизованного логирования
 *
 * Использует winston для серверной части (логирование в консоль + файл)
 * Использует console для клиентской части (логирование в консоль браузера)
 *
 * Уровни логирования: error, warn, info, debug
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Определяем формат логов
const logFormat = winston.format.combine(
	winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
	winston.format.errors({ stack: true }),
	winston.format.splat(),
	winston.format.json()
);

// Формат для консоли (более читаемый)
const consoleFormat = winston.format.combine(
	winston.format.colorize(),
	winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
	winston.format.printf(({ timestamp, level, message, ...meta }) => {
		let msg = `${timestamp} [${level}]: ${message}`;
		if (Object.keys(meta).length > 0) {
			msg += ` ${JSON.stringify(meta, null, 2)}`;
		}
		return msg;
	})
);

// Создаем logger для серверной части
let serverLogger: winston.Logger | null = null;

function createServerLogger(): winston.Logger {
	if (serverLogger) {
		return serverLogger;
	}

	// Создаем директорию для логов, если её нет
	const logsDir = path.join(process.cwd(), 'logs');
	if (!existsSync(logsDir)) {
		mkdirSync(logsDir, { recursive: true });
	}

	serverLogger = winston.createLogger({
		level: process.env.LOG_LEVEL || 'info',
		format: logFormat,
		defaultMeta: { service: 'oprosnii-list-processing' },
		transports: [
			// Логирование в файл
			new winston.transports.File({
				filename: path.join(logsDir, 'error.log'),
				level: 'error',
				maxsize: 5242880, // 5MB
				maxFiles: 5
			}),
			new winston.transports.File({
				filename: path.join(logsDir, 'app.log'),
				maxsize: 5242880, // 5MB
				maxFiles: 5
			}),
			// Логирование в консоль
			new winston.transports.Console({
				format: consoleFormat
			})
		]
	});

	return serverLogger;
}

// Простой logger для клиентской части (браузер)
const clientLogger = {
	error: (message: string, meta?: Record<string, unknown>) => {
		console.error(`[ERROR] ${message}`, meta || '');
	},
	warn: (message: string, meta?: Record<string, unknown>) => {
		console.warn(`[WARN] ${message}`, meta || '');
	},
	info: (message: string, meta?: Record<string, unknown>) => {
		console.info(`[INFO] ${message}`, meta || '');
	},
	debug: (message: string, meta?: Record<string, unknown>) => {
		console.debug(`[DEBUG] ${message}`, meta || '');
	}
};

// Определяем, находимся ли мы в браузере
const isBrowser = typeof window !== 'undefined';

// Экспортируем универсальный logger
export const logger = isBrowser
	? clientLogger
	: {
			error: (message: string, meta?: Record<string, unknown>) => {
				createServerLogger().error(message, meta);
			},
			warn: (message: string, meta?: Record<string, unknown>) => {
				createServerLogger().warn(message, meta);
			},
			info: (message: string, meta?: Record<string, unknown>) => {
				createServerLogger().info(message, meta);
			},
			debug: (message: string, meta?: Record<string, unknown>) => {
				createServerLogger().debug(message, meta);
			}
	  };

