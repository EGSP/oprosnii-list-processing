---
name: Добавление soft delete для заявок и процессов
overview: Добавление функциональности мягкого удаления (soft delete) для заявок и процессов обработки с полем `deleted` (bool), разделение удаления на delete (soft) и purge (hard), обновление методов поиска для фильтрации удаленных объектов, добавление REST endpoints и UI кнопок для удаления.
todos:
  - id: db-migration
    content: Добавить поле deleted в таблицы applications и processing_operations, создать функцию миграции
    status: completed
  - id: update-types
    content: Обновить ApplicationSchema и ProcessingOperationSchema, добавить поле deleted
    status: completed
  - id: update-storage-interfaces
    content: Обновить ApplicationRow и ProcessingOperationRow, функции преобразования rowToApplication/operationToRow
    status: completed
    dependencies:
      - update-types
  - id: update-search-applications
    content: Обновить getApplication и getApplications с параметром includeDeleted, фильтрация по deleted
    status: completed
    dependencies:
      - update-storage-interfaces
  - id: update-search-operations
    content: Обновить методы поиска операций с параметром includeDeleted, фильтрация по deleted
    status: completed
    dependencies:
      - update-storage-interfaces
  - id: split-delete-applications
    content: Разделить deleteApplication на delete (soft) и purge (hard), добавить удаление файлов в purge
    status: completed
    dependencies:
      - update-search-applications
  - id: split-delete-operations
    content: Разделить deleteOperation на delete (soft) и purge (hard)
    status: completed
    dependencies:
      - update-search-operations
  - id: rest-delete-application
    content: Добавить DELETE endpoint для заявки (soft delete)
    status: completed
    dependencies:
      - split-delete-applications
  - id: rest-purge-application
    content: Создать POST /purge endpoint для заявки (hard delete)
    status: completed
    dependencies:
      - split-delete-applications
  - id: rest-delete-operation
    content: Добавить DELETE endpoint для операции (soft delete)
    status: completed
    dependencies:
      - split-delete-operations
  - id: rest-purge-operation
    content: Создать POST /purge endpoint для операции (hard delete)
    status: completed
    dependencies:
      - split-delete-operations
  - id: ui-delete-application
    content: Добавить кнопку удаления в ApplicationDetails.svelte
    status: completed
    dependencies:
      - rest-delete-application
  - id: ui-delete-operation
    content: Добавить кнопку удаления в OperationStatusBadge.svelte
    status: completed
    dependencies:
      - rest-delete-operation
---

# План: Добавлени

е soft delete для заявок и процессов

## Обзор изменений

Добавление функциональности мягкого удаления (soft delete) для заявок и процессов обработки:

- Поле `deleted` (bool, по умолчанию false) в таблицах `applications` и `processing_operations`
- Разделение удаления на `delete` (soft) и `purge` (hard)
- Фильтрация удаленных объектов в методах поиска (по умолчанию скрыты)
- REST endpoints для delete и purge
- UI кнопки удаления в деталях заявки и бейдже операции

## Изменения в базе данных

### 1. Миграция схемы БД

**Файл:** `src/lib/storage/db.ts`

- Добавить поле `deleted INTEGER DEFAULT 0` в таблицу `applications`
- Добавить поле `deleted INTEGER DEFAULT 0` в таблицу `processing_operations`
- Создать функцию миграции для добавления колонок к существующим таблицам (ALTER TABLE)

## Изменения в типах и схемах

### 2. Обновление типов

**Файл:** `src/lib/business/types.ts`

- Добавить поле `deleted?: boolean` в `ApplicationSchema` (опциональное, по умолчанию false)
- Добавить поле `deleted?: boolean` в `ProcessingOperationSchema` (опциональное, по умолчанию false)

### 3. Обновление интерфейсов строк БД

**Файлы:**

- `src/lib/storage/applications.ts`
- `src/lib/storage/processingOperations.ts`
- Добавить поле `deleted: number` (0 или 1) в `ApplicationRow` и `ProcessingOperationRow`
- Обновить функции `rowToApplication` и `rowToOperation` для преобразования `deleted` (0/1 ↔ true/false)
- Обновить функции `applicationToRow` и `operationToRow` для преобразования `deleted` (true/false ↔ 0/1)

## Изменения в методах storage

### 4. Обновление методов поиска заявок

**Файл:** `src/lib/storage/applications.ts`

- Обновить `getApplication`: добавить параметр `includeDeleted = false`, фильтровать по `deleted = 0` если `includeDeleted = false`
- Обновить `getApplications`: добавить параметр `includeDeleted = false` в `ApplicationFilters`, добавить условие `AND deleted = 0` если `includeDeleted = false`
- Обновить `createApplication`: устанавливать `deleted = 0` при создании

### 5. Обновление методов поиска операций

**Файл:** `src/lib/storage/processingOperations.ts`

- Обновить `getOperation`: добавить параметр `includeDeleted = false`, фильтровать по `deleted = 0` если `includeDeleted = false`
- Обновить `getOperationsByFilter`: добавить параметр `includeDeleted = false`, добавить условие `AND deleted = 0` если `includeDeleted = false`
- Обновить `findOperations`: добавить параметр `includeDeleted = false`, добавить условие `AND deleted = 0` если `includeDeleted = false`
- Обновить `findOperationsByFilter`: добавить параметр `includeDeleted = false`, добавить условие `AND deleted = 0` если `includeDeleted = false`
- Обновить `createOperation`: устанавливать `deleted = 0` при создании

### 6. Разделение методов удаления заявок

**Файл:** `src/lib/storage/applications.ts`

- Переименовать текущий `deleteApplication` в `purgeApplication` (hard delete)
- Создать новый `deleteApplication`: устанавливает `deleted = 1` (soft delete)
- Обновить `updateApplication`: добавить возможность обновления поля `deleted`

### 7. Разделение методов удаления операций

**Файл:** `src/lib/storage/processingOperations.ts`

- Переименовать `deleteOperation` в `purgeOperation` (hard delete)
- Переименовать `deleteOperations` в `purgeOperations` (hard delete)
- Создать новый `deleteOperation`: устанавливает `deleted = 1` (soft delete)
- Создать новый `deleteOperations`: устанавливает `deleted = 1` для массива операций (soft delete)
- Обновить `updateOperation`: добавить возможность обновления поля `deleted`

### 8. Удаление файлов при purge заявки

**Файл:** `src/lib/storage/applications.ts`

- В `purgeApplication`: после удаления записи из БД удалять директорию с файлами заявки
- Использовать функцию удаления директории из `fs` (rmSync с опцией `recursive: true`)
- Путь к директории: `data/uploads/{applicationId}`

## REST API endpoints

### 9. Endpoint DELETE для заявки (soft delete)

**Файл:** `src/routes/api/applications/[id]/+server.ts`

- Добавить метод `DELETE`: вызывает `deleteApplication` (soft delete)
- Возвращает 200 OK при успехе

### 10. Endpoint PURGE для заявки (hard delete)

**Файл:** `src/routes/api/applications/[id]/purge/+server.ts` (новый файл)

- Создать новый endpoint `POST /api/applications/[id]/purge`
- Вызывает `purgeApplication` (hard delete + удаление файлов)
- Возвращает 200 OK при успехе

### 11. Endpoint DELETE для операции (soft delete)

**Файл:** `src/routes/api/applications/[id]/operations/[operationId]/+server.ts`

- Добавить метод `DELETE`: вызывает `deleteOperation` (soft delete)
- Возвращает 200 OK при успехе

### 12. Endpoint PURGE для операции (hard delete)

**Файл:** `src/routes/api/applications/[id]/operations/[operationId]/purge/+server.ts` (новый файл)

- Создать новый endpoint `POST /api/applications/[id]/operations/[operationId]/purge`
- Вызывает `purgeOperation` (hard delete)
- Возвращает 200 OK при успехе

## Изменения в UI

### 13. Кнопка удаления в деталях заявки

**Файл:** `src/lib/components/ApplicationDetails.svelte`

- Добавить кнопку "Удалить" рядом с кнопкой "Обновить" в заголовке
- При клике: вызывать DELETE `/api/applications/{id}`
- После успешного удаления: обновить список заявок или скрыть детали

### 14. Кнопка удаления в бейдже операции

**Файл:** `src/lib/components/OperationStatusBadge.svelte`

- Добавить кнопку "Удалить" в `badge-actions`
- При клике: вызывать DELETE `/api/applications/{applicationId}/operations/{operationId}`
- После успешного удаления: обновить отображение операций

## Дополнительные изменения

### 15. Обновление бизнес-логики

**Файл:** `src/lib/business/processing.ts` (если используется)

- Проверить, используются ли методы поиска, и обновить вызовы при необходимости
- Убедиться, что методы обработки не работают с удаленными заявками

### 16. Обновление экспорта

**Файл:** `src/lib/storage/index.ts`

- Убедиться, что новые методы экспортируются

## Порядок выполнения

1. Миграция БД и обновление типов (пункты 1-3)
2. Обновление методов storage (пункты 4-8)
3. REST API endpoints (пункты 9-12)
4. UI компоненты (пункты 13-14)
5. Тестирование и проверка

## Важные замечания

- При отсутствии поля `deleted` в БД считать его как `false` (0)