# Модули провайдера Yandex

Модули для работы с AI сервисами Yandex: Yandex OCR и YandexGPT.

## Структура

- **`ocr.ts`** - Функции для работы с Yandex OCR API
- **`llm.ts`** - Функции для работы с YandexGPT API

## Yandex OCR (`ocr.ts`)

### Функции

#### `callYandexOCR(fileBuffer: Buffer, mimeType: string, pageCount?: number): Promise<{ text?: string; operationId?: string }>`

Отправляет изображение или PDF в YandexOCR API.

**Параметры:**
- `fileBuffer` - Buffer с содержимым файла
- `mimeType` - MIME тип файла
- `pageCount` - Количество страниц (для PDF, если > 1, используется async endpoint)

**Возвращает:**
- `{ text: string }` - для синхронных операций
- `{ operationId: string }` - для асинхронных операций (многостраничные PDF)

#### `getYandexOCRRecognition(operationId: string): Promise<string>`

Получает результаты распознавания через GetRecognition endpoint.

**Параметры:**
- `operationId` - ID операции у внешнего сервиса (Yandex)

**Возвращает:** Извлеченный текст

#### `checkYandexOCROperation(operation: ProcessingOperation): Promise<{ done: boolean; text?: string; error?: string }>`

Проверяет статус асинхронной операции YandexOCR.

**Параметры:**
- `operation` - Операция обработки с `providerData.operationId`

**Возвращает:**
- `{ done: false }` - операция еще выполняется
- `{ done: true, text: string }` - операция завершена успешно
- `{ done: true, error: string }` - операция завершена с ошибкой

### Ошибки

- `YandexOCRError` - Ошибка при работе с Yandex OCR API

## Yandex LLM (`llm.ts`)

### Функции

#### `callYandexGPT(prompt: string, systemPrompt?: string, options?: LLMOptions): Promise<string>`

Вызывает YandexGPT API и возвращает текстовый ответ.

**Параметры:**
- `prompt` - Промпт для LLM
- `systemPrompt` - Системный промпт (опционально)
- `options` - Параметры модели (temperature, maxTokens и т.д.)

**Возвращает:** Текстовый ответ от LLM

#### `callYandexGPTStructured<T>(prompt: string, schema: T, systemPrompt?: string, options?: LLMOptions, maxRetries?: number): Promise<z.infer<T>>`

Вызывает YandexGPT с structured output через Zod схему.

**Параметры:**
- `prompt` - Промпт для LLM (должен содержать инструкцию возвращать JSON)
- `schema` - Zod схема для валидации ответа
- `systemPrompt` - Системный промпт (опционально)
- `options` - Параметры модели
- `maxRetries` - Максимальное количество попыток (по умолчанию 2)

**Возвращает:** Валидированный объект, соответствующий схеме

### Ошибки

- `YandexLLMError` - Ошибка при работе с YandexGPT API

