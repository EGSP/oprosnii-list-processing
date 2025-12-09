/**
 * Модуль для работы с файлами инструкций
 *
 * Инструкции хранятся в директории data/instructions в формате JSON.
 * Каждая инструкция должна содержать обязательные поля: name (string) и type (string),
 * а также может содержать любые другие параметры.
 */

import { join } from 'path';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { z } from 'zod';
import { config } from '../config.js';
import { err, ok, type Result } from 'neverthrow';
import { StorageError } from './errors.js';

/**
 * Схема валидации для инструкции
 * Обязательные поля: name и type (оба string)
 * Дополнительные поля разрешены через passthrough
 */
export const InstructionSchema = z
    .object({
        name: z.string().describe('Название инструкции'),
        type: z.string().describe('Тип инструкции')
    })
    .loose();

export type Instruction = z.infer<typeof InstructionSchema>;

/**
 * Получает путь к директории с инструкциями
 */
function getInstructionsDirectory(): string {
    return join(process.cwd(), config.instructionsDirectory);
}

/**
 * Читает и парсит JSON файл инструкции
 */
function readInstructionFile(filePath: string): Result<unknown, Error> {
    try {
        if (!existsSync(filePath)) {
            return err(new StorageError(`Файл инструкции не найден: ${filePath}`));
        }

        const fileContent = readFileSync(filePath, 'utf-8');
        const jsonData = JSON.parse(fileContent);
        return ok(jsonData);
    } catch (error) {
        if (error instanceof SyntaxError) {
            return err(new StorageError(`Ошибка парсинга JSON в файле ${filePath}: ${error.message}`, error));
        }
        return err(
            new StorageError(`Ошибка чтения файла инструкции ${filePath}: ${error instanceof Error ? error.message : String(error)}`, error as Error)
        );
    }
}

/**
 * Валидирует данные инструкции через Zod схему
 */
function validateInstruction(data: unknown): Result<Instruction, Error> {
    const result = InstructionSchema.safeParse(data);
    if (!result.success) {
        return err(
            new StorageError(
                `Ошибка валидации инструкции: ${result.error.message}`,
                result.error
            )
        );
    }
    return ok(result.data);
}

/**
 * Получает массив имен файлов инструкций по имени инструкции
 *
 * @param name - Название инструкции (поле name в JSON)
 * @returns Массив имен файлов (с расширением .json), содержащих инструкции с указанным именем
 */
export function getInstructionFileNames(name: string): Result<string[], Error> {
    const instructionsDir = getInstructionsDirectory();

    if (!existsSync(instructionsDir))
        return err(new StorageError(`Директория инструкций не найдена: ${instructionsDir}`));

    const files = readdirSync(instructionsDir).filter((file) => file.endsWith('.json'));

    const matchingFiles: string[] = [];

    for (const file of files) {
        const filePath = join(instructionsDir, file);
        const readResult = readInstructionFile(filePath);

        if (readResult.isErr()) {
            continue; // Пропускаем файлы с ошибками чтения
        }

        const validateResult = validateInstruction(readResult.value);

        if (validateResult.isErr()) {
            continue; // Пропускаем файлы с ошибками валидации
        }

        const instruction = validateResult.value;

        if (instruction.name === name) {
            matchingFiles.push(file);
        }
    }

    return ok(matchingFiles);
}

/**
 * Получает массив имен файлов инструкций по имени инструкции и типу
 *
 * @param name - Название инструкции (поле name в JSON)
 * @param type - Тип инструкции (поле type в JSON)
 * @returns Массив имен файлов (с расширением .json), содержащих инструкции с указанным именем и типом
 */
export function getInstructionFileNamesByNameAndType(name: string, type: string): Result<string[], Error> {
    const instructionsDir = getInstructionsDirectory();

    if (!existsSync(instructionsDir))
        return err(new StorageError(`Директория инструкций не найдена: ${instructionsDir}`));

    const files = readdirSync(instructionsDir).filter((file) => file.endsWith('.json'));

    const matchingFiles: string[] = [];

    for (const file of files) {
        const filePath = join(instructionsDir, file);
        const readResult = readInstructionFile(filePath);

        if (readResult.isErr()) {
            continue; // Пропускаем файлы с ошибками чтения
        }

        const validateResult = validateInstruction(readResult.value);

        if (validateResult.isErr()) {
            continue; // Пропускаем файлы с ошибками валидации
        }

        const instruction = validateResult.value;

        if (instruction.name === name && instruction.type === type) {
            matchingFiles.push(file);
        }
    }

    return ok(matchingFiles);
}

/**
 * Читает содержимое инструкции из файла и валидирует его через схему
 *
 * @param filename - Имя файла инструкции (с расширением .json или без)
 * @returns Валидированная инструкция
 */
export function readInstruction(filename: string): Result<Instruction, Error> {
    const instructionsDir = getInstructionsDirectory();

    // Добавляем расширение .json, если его нет
    const normalizedFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
    const filePath = join(instructionsDir, normalizedFilename);

    const readResult = readInstructionFile(filePath);

    if (readResult.isErr()) {
        return err(readResult.error);
    }

    return validateInstruction(readResult.value);
}

export function readInstructionByNameAndType(name: string, type: string): Result<Instruction, Error> {
    const instructionFileNames = getInstructionFileNamesByNameAndType(name, type);
    if (instructionFileNames.isErr()) {
        return err(instructionFileNames.error);
    }
    return readInstruction(instructionFileNames.value[0]);
}

