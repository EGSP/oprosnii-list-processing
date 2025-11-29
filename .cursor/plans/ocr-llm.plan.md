<!-- 8c6066c6-ec0f-40b5-953d-c60ec30e10fe 7f2a2efe-bec3-4ee0-b5ab-921ce7e65476 -->

# План: Внедрение системы ProcessingOperation

## Цель

Реализовать систему операций обработки для универсальной работы с внешними сервисами (OCR, LLM), поддержка синхронных и асинхронных операций, хранение в БД с возможностью отслеживания статуса.

## Архитектура

### Структура ProcessingOperation

```typescript
interface ProcessingOperation {
	id: string;
	applicationId: string;
	type: 'ocr' | 'llm_product_type' | 'llm_abbreviation';
	provider: string; // 'yandex', и т.д.
	status: 'pending' | 'running' | 'completed' | 'failed';
	externalOperationId?: string | null;
	requestData: {
		endpoint: string;
		method: 'GET' | 'POST' | 'PUT' | 'DELETE';
		headers?: Record<string, string>;
		body?: unknown;
	};
	result?: Record<string, unknown> | null;
	error?: { message: string; code?: string; details?: unknown } | null;
	createdAt: string;
	startedAt?: string | null;
	completedAt?: string | null;
	progress?: { current: number; total: number; message?: string } | null;
	retryCount?: number;
	maxRetries?: number;
}
```

## Этапы реализации

### Этап 1: Storage модуль - База данных и репозиторий

**Файлы:**

- `src/lib/storage/types.ts` - Добавить типы ProcessingOperation
- `src/lib/storage/db.ts` - Добавить создание таблицы processing_operations
- `src/lib/storage/operationsRepository.ts` - Новый репозиторий для операций
- `src/lib/storage/index.ts` - Экспорт нового репозитория

**Задачи:**

1. Добавить Zod схему `ProcessingOperationSchema` в types.ts
2. Добавить TypeScript типы `ProcessingOperation`, `ProcessingOperationType`, `ProcessingOperationStatus`
3. Создать таблицу `processing_operations` в БД с уникальным индексом на (application_id, type)
4. Реализовать CRUD операции:
   - `createOperation()` - создание операции
   - `getOperation(id)` - получение по ID
   - `getOperationByApplicationAndType(applicationId, type)` - получение операции заявки
   - `getOperationsByApplication(applicationId)` - список операций заявки
   - `updateOperation(id, updates)` - обновление операции (перезапись)
   - `updateOperationStatus(id, status, data?)` - обновление статуса с автоматическим заполнением временных меток

5. Добавить обработку ошибок `OperationNotFoundError`

### Этап 2: AI модуль - Обновление OCR для поддержки операций

**Файлы:**

- `src/lib/ai/ocr.ts` - Обновить функции для работы с операциями
- `src/lib/ai/types.ts` - Добавить типы для операций OCR

**Задачи:**

1. Добавить функцию `createOCROperation()` - создание операции OCR
2. Обновить `callYandexOCR()` для поддержки:
   - Синхронных операций (одностраничные PDF, изображения)
   - Асинхронных операций (многостраничные PDF) с возвратом Operation ID

3. Добавить функцию `checkYandexOCROperation(operationId)` - проверка статуса асинхронной операции
4. Добавить функцию `extractTextFromFileWithOperation()` - обертка, которая создает операцию и выполняет OCR
5. Сохранять минимальные requestData (endpoint, method, без тела запроса с изображением)

### Этап 3: AI модуль - Обновление LLM для поддержки операций

**Файлы:**

- `src/lib/ai/llm.ts` - Обновить функции для работы с операциями
- `src/lib/ai/types.ts` - Добавить типы для операций LLM

**Задачи:**

1. Добавить функцию `createLLMOperation()` - создание операции LLM
2. Обновить `callYandexGPT()` и `callYandexGPTStructured()` для:
   - Создания операции перед вызовом
   - Обновления статуса операции
   - Сохранения результата в операцию

3. Сохранять минимальные requestData (endpoint, method, без полного промпта)
4. LLM операции всегда синхронные (YandexGPT возвращает результат сразу)

### Этап 4: Business модуль - Интеграция операций в бизнес-логику

**Файлы:**

- `src/lib/business/processing.ts` - Обновить функции обработки
- `src/lib/business/schemas.ts` - Без изменений

**Задачи:**

1. Обновить `detectProductType()`:
   - Использовать операции для OCR (через `extractTextFromFileWithOperation()`)
   - Создавать операцию типа 'llm_product_type' для LLM вызова
   - Сохранять результаты в операции
   - Возвращать ID операции вместе с результатом

2. Обновить `generateAbbreviation()`:
   - Использовать существующую OCR операцию или создавать новую
   - Создавать операцию типа 'llm_abbreviation' для LLM вызова
   - Сохранять результаты в операции

3. Добавить функцию `getOperationStatus(operationId)` - получение статуса операции
4. Добавить функцию `checkAndUpdateOperation(operationId)` - проверка и обновление статуса асинхронной операции

### Этап 5: REST API - Эндпоинты для операций

**Файлы:**

- `src/routes/api/applications/[id]/operations/+server.ts` - Список операций заявки
- `src/routes/api/applications/[id]/operations/[operationId]/+server.ts` - Получение/проверка операции
- `src/lib/api/types.ts` - Добавить типы для API ответов

**Задачи:**

1. `GET /api/applications/:id/operations`:
   - Возвращает список всех операций для заявки
   - Фильтрация по типу (query параметр `?type=ocr`)
   - Сортировка по дате создания

2. `GET /api/applications/:id/operations/:operationId`:
   - Возвращает детальную информацию об операции
   - Включает статус, результат, ошибки

3. `POST /api/applications/:id/operations/:operationId/check`:
   - Проверяет статус асинхронной операции у внешнего сервиса
   - Обновляет статус в БД
   - Возвращает обновленный статус

4. Обновить существующие эндпоинты:
   - `POST /api/applications/:id/detect-product-type` - возвращать ID созданных операций
   - `POST /api/applications/:id/generate-abbreviation` - возвращать ID созданных операций

### Этап 6: Обновление документации

**Файлы:**

- `src/lib/storage/STORAGE.md` - Добавить описание операций
- `src/lib/ai/AI.md` - Обновить описание работы с операциями
- `src/lib/business/BUSINESS.md` - Обновить описание функций
- `src/lib/business/API.md` - Добавить описание новых эндпоинтов

**Задачи:**

1. Описать структуру ProcessingOperation
2. Описать работу с синхронными и асинхронными операциями
3. Добавить примеры использования
4. Обновить схемы БД в документации

## Ключевые моменты реализации

1. **Уникальность операций**: Одна операция каждого типа на заявку (UNIQUE constraint)
2. **Синхронные операции**: Сразу status='completed', externalOperationId=null
3. **Асинхронные операции**: status='pending' → 'running' → 'completed', с externalOperationId
4. **Минимальные requestData**: Только endpoint, method, без больших данных (изображения, текст)
5. **Перезапись**: При создании операции с существующим типом - обновление, а не создание новой
6. **Хранение истории**: Завершенные операции не удаляются

## Последовательность выполнения

1. Storage модуль (Этап 1) - основа для всех остальных
2. AI модуль OCR (Этап 2) - для поддержки асинхронных операций
3. AI модуль LLM (Этап 3) - для унификации подхода
4. Business модуль (Этап 4) - интеграция операций в бизнес-логику
5. REST API (Этап 5) - предоставление доступа к операциям
6. Документация (Этап 6) - описание новой функциональности

### To-dos

- [x] Создать модуль конфигурации AI сервисов (src/lib/ai/config.ts) с явным определением моделей YandexOCR и YandexGPT, переменными окружения для API ключей
- [x] Реализовать модуль OCR (src/lib/ai/ocr.ts) с поддержкой YandexOCR для изображений/PDF и извлечением текста из DOCX/XLSX
- [x] Реализовать модуль LLM (src/lib/ai/llm.ts) для работы с YandexGPT через REST API
- [x] Создать Zod схемы для structured output (src/lib/business/schemas.ts): ProductTypeSchema и AbbreviationParametersSchema
- [x] Реализовать бизнес-логику обработки заявок (src/lib/business/processing.ts): detectProductType и generateAbbreviation с кешированием OCR результатов
- [x] Обновить REST API эндпоинты detect-product-type и generate-abbreviation для использования новой бизнес-логики
- [x] Установить необходимые зависимости: mammoth, xlsx, и опционально @langchain/core для structured output
- [x] Создать документацию AI.md и обновить BUSINESS.md с описанием новых функций
- [x] Создать модуль конфигурации AI сервисов (src/lib/ai/config.ts) с явным определением моделей YandexOCR и YandexGPT, переменными окружения для API ключей
- [x] Реализовать модуль OCR (src/lib/ai/ocr.ts) с поддержкой YandexOCR для изображений/PDF и извлечением текста из DOCX/XLSX
- [ ] Добавить типы и Zod схемы для ProcessingOperation в src/lib/storage/types.ts
- [ ] Создать таблицу processing_operations в БД с уникальным индексом (application_id, type)
- [ ] Создать репозиторий operationsRepository.ts с CRUD операциями для ProcessingOperation
- [ ] Обновить OCR модуль для поддержки синхронных и асинхронных операций YandexOCR
- [ ] Обновить LLM модуль для создания и обновления операций при вызовах YandexGPT
- [ ] Интегрировать операции в бизнес-логику: обновить detectProductType и generateAbbreviation
- [ ] Создать REST API эндпоинты: GET /operations, GET /operations/:id, POST /operations/:id/check
- [ ] Обновить существующие эндпоинты для возврата ID созданных операций
- [ ] Обновить документацию: STORAGE.md, AI.md, BUSINESS.md, API.md с описанием операций
