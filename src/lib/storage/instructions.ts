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
import { Effect, pipe, Option } from 'effect';
import { parseZodSchema } from '$lib/utils/zod.js';

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
function readInstructionFile(filePath: string): Effect.Effect<unknown, Error> {
    return Effect.try({
        try: () => {
            const fileContent = readFileSync(filePath, 'utf-8');
            return JSON.parse(fileContent);
        },
        catch: (error) => error as Error
    });
}

/**
 * Валидирует данные инструкции через Zod схему
 */
function validateInstruction(data: unknown): Effect.Effect<Instruction, Error> {
    return parseZodSchema(data, InstructionSchema);
}

/**
 * Получает массив имен файлов инструкций по имени инструкции
 *
 * @param name - Название инструкции (поле name в JSON)
 * @returns Effect с массивом имен файлов (с расширением .json), содержащих инструкции с указанным именем
 */
export function getInstructionFileNames(name: string): Effect.Effect<string[], Error> {
    return Effect.gen(function* () {
        const instructionsDir = getInstructionsDirectory();

        const files = yield* Effect.sync(() => readdirSync(instructionsDir).filter((file) => file.endsWith('.json')));

        const matchingFiles: string[] = [];

        for (const file of files) {
            const filePath = join(instructionsDir, file);
            const dataOption = yield* readInstructionFile(filePath).pipe(
                Effect.option
            );

            if (Option.isNone(dataOption)) {
                continue; // Пропускаем файлы с ошибками чтения
            }

            const instructionOption = yield* validateInstruction(dataOption.value).pipe(
                Effect.option
            );

            if (Option.isNone(instructionOption)) {
                continue; // Пропускаем файлы с ошибками валидации
            }

            const instruction = instructionOption.value;

            if (instruction.name === name) {
                matchingFiles.push(file);
            }
        }

        return matchingFiles;
    });
}

/**
 * Получает массив имен файлов инструкций по имени инструкции и типу
 *
 * @param name - Название инструкции (поле name в JSON)
 * @param type - Тип инструкции (поле type в JSON)
 * @returns Effect с массивом имен файлов (с расширением .json), содержащих инструкции с указанным именем и типом
 */
export function getInstructionFileNamesByNameAndType(name: string, type: string): Effect.Effect<string[], Error> {
    return Effect.gen(function* () {
        const instructionsDir = getInstructionsDirectory();

        const files = yield* Effect.sync(() => readdirSync(instructionsDir).filter((file) => file.endsWith('.json')));

        const matchingFiles: string[] = [];

        for (const file of files) {
            const filePath = join(instructionsDir, file);
            const dataOption = yield* readInstructionFile(filePath).pipe(
                Effect.option
            );

            if (Option.isNone(dataOption)) {
                continue; // Пропускаем файлы с ошибками чтения
            }

            const instructionOption = yield* validateInstruction(dataOption.value).pipe(
                Effect.option
            );

            if (Option.isNone(instructionOption)) {
                continue; // Пропускаем файлы с ошибками валидации
            }

            const instruction = instructionOption.value;

            if (instruction.name === name && instruction.type === type) {
                matchingFiles.push(file);
            }
        }

        return matchingFiles;
    });
}

/**
 * Читает содержимое инструкции из файла и валидирует его через схему
 *
 * @param filename - Имя файла инструкции (с расширением .json или без)
 * @returns Effect с валидированной инструкцией
 */
export function readInstruction(filename: string): Effect.Effect<Instruction, Error> {
    return Effect.gen(function* () {
        const instructionsDir = getInstructionsDirectory();

        // Добавляем расширение .json, если его нет
        const normalizedFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
        const filePath = join(instructionsDir, normalizedFilename);

        const data = yield* readInstructionFile(filePath);
        const instruction = yield* validateInstruction(data);
        
        return instruction;
    });
}

export function readInstructionByNameAndType(name: string, type: string): Effect.Effect<Instruction, Error> {
    return Effect.gen(function* () {
        const instructionFileNames = yield* getInstructionFileNamesByNameAndType(name, type);
        if (instructionFileNames.length === 0) {
            return yield* Effect.fail(new Error(`Инструкция с именем ${name} и типом ${type} не найдена`));
        }
        const instruction = yield* readInstruction(instructionFileNames[0]);
        return instruction;
    });
}

