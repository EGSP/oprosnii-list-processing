<script lang="ts">
	import { getApplicationStatusInfo, getFileInfo, fetchApplication, extractText, resolveProductType, resolveAbbreviation } from '$lib/business/rest.js';
	import type { ApplicationStatusInfo, ProcessingOperation } from '$lib/business/types.js';
	import EmptyState from './EmptyState.svelte';
	import OperationStatusBadge from './OperationStatusBadge.svelte';
	import { Effect, Option } from 'effect';
	import type { FileInfo } from '$lib/storage/files.js';
	import Button from '$lib/components/ui/button.svelte';
	import Input from '$lib/components/ui/input.svelte';
	import Textarea from '$lib/components/ui/textarea.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import CardContent from '$lib/components/ui/card-content.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Alert from '$lib/components/ui/alert.svelte';
	import AlertTitle from '$lib/components/ui/alert-title.svelte';
	import AlertDescription from '$lib/components/ui/alert-description.svelte';
	import Dialog from '$lib/components/ui/dialog.svelte';
	import DialogContent from '$lib/components/ui/dialog-content.svelte';
	import DialogHeader from '$lib/components/ui/dialog-header.svelte';
	import DialogTitle from '$lib/components/ui/dialog-title.svelte';
	import DialogDescription from '$lib/components/ui/dialog-description.svelte';
	import DialogFooter from '$lib/components/ui/dialog-footer.svelte';
	import { RefreshCw, Trash2, Undo2, Archive, X } from 'lucide-svelte';

	export let applicationId: string | null = null;

	let statusInfo: ApplicationStatusInfo | null = null;
	let error: string | null = null;
	let fileInfo: FileInfo | null = null;
	let isRefreshing = false;
	let isPurging = false;
	let isTogglingDelete = false;
	let purgeModalOpen = false;
	let runningOperations = new Set<ProcessingOperation['task']>();
	let currentApplicationId: string | null = null;

	$: if (applicationId !== currentApplicationId) {
		// При смене заявки сразу очищаем старые данные
		currentApplicationId = applicationId;
		statusInfo = null;
		fileInfo = null;
		error = null;
		runningOperations.clear();
		
		// Загружаем новую заявку с операциями
		if (applicationId) {
			loadApplication();
		}
	}


	async function loadApplication() {
		if (!applicationId) return;
		
		// Проверяем, что applicationId не изменился во время загрузки
		const loadingId = applicationId;

		error = null;
		
		// Загружаем данные заявки, ВСЕГДА включая операции
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				// getApplicationStatusInfo загружает заявку и ВСЕ операции
				const status = yield* getApplicationStatusInfo(loadingId);
				const file = yield* Effect.option(getFileInfo(loadingId));
				return { status, file };
			})
		).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка загрузки заявки';
			// Очищаем данные только если это та же заявка
			if (applicationId === loadingId) {
				statusInfo = null;
				fileInfo = null;
			}
			return null;
		});
		
		if (result) {
			// Сохраняем данные заявки с операциями
			// result.status.operations содержит все загруженные операции (может быть пустым массивом)
			statusInfo = {
				...result.status,
				operations: result.status.operations || [] // Гарантируем, что operations всегда массив
			};
			fileInfo = Option.isSome(result.file) ? result.file.value : null;
		}
	}



	async function handleRefresh() {
		if (!applicationId) return;

		isRefreshing = true;
		error = null;
		
		// Обновляем операции через fetchApplication
		await Effect.runPromise(
			fetchApplication(applicationId)
		).catch((err) => {
			console.warn('Ошибка при обновлении операций:', err);
		});
		
		// Загружаем обновленные данные
		await loadApplication();
		isRefreshing = false;
	}

	async function handleToggleDelete(checked: boolean) {
		if (!applicationId || !statusInfo) return;

		isTogglingDelete = true;
		error = null;

		try {
			const response = await fetch(`/api/applications/${applicationId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ deleted: checked })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Ошибка при изменении статуса удаления');
			}

			// Обновляем локальное состояние
			if (statusInfo) {
				statusInfo = {
					...statusInfo,
					application: {
						...statusInfo.application,
						deleted: checked
					}
				};
			}

			// Обновляем данные после изменения
			await loadApplication();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка при изменении статуса удаления';
			// Откатываем изменение в UI
			await loadApplication();
		} finally {
			isTogglingDelete = false;
		}
	}

	function handleOpenPurgeModal() {
		purgeModalOpen = true;
	}

	function handleClosePurgeModal() {
		purgeModalOpen = false;
	}

	async function handlePurge() {
		if (!applicationId) return;

		isPurging = true;
		error = null;

		try {
			const response = await fetch(`/api/applications/${applicationId}/purge`, {
				method: 'POST'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Ошибка при очистке заявки');
			}

			// Очищаем данные и сбрасываем applicationId
			statusInfo = null;
			fileInfo = null;
			applicationId = null;
			purgeModalOpen = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка при очистке заявки';
		} finally {
			isPurging = false;
		}
	}

	async function handleRunOperation(task: ProcessingOperation['task']) {
		if (!applicationId) return;

		runningOperations.add(task);
		error = null;

		let operationEffect: Effect.Effect<void, Error>;
		if (task === 'extractText') {
			operationEffect = extractText(applicationId);
		} else if (task === 'resolveProductType') {
			operationEffect = resolveProductType(applicationId);
		} else if (task === 'resolveAbbreviation') {
			// Для resolveAbbreviation нужен technicalSpecId, но пока используем пустую строку
			// TODO: нужно будет передавать technicalSpecId как-то иначе
			error = 'Для формирования аббревиатуры требуется техническое условие';
			runningOperations.delete(task);
			return;
		} else {
			error = 'Неизвестная операция';
			runningOperations.delete(task);
			return;
		}

		await Effect.runPromise(operationEffect).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка выполнения операции';
		});
		
		// Обновляем данные после операции
		await loadApplication();
		runningOperations.delete(task);
	}

	async function handleToggleOperationDelete(operationId: string, deleted: boolean) {
		if (!applicationId) return;

		try {
			const response = await fetch(`/api/applications/${applicationId}/operations/${operationId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ deleted })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Ошибка при изменении статуса удаления операции');
			}

			// Обновляем данные после изменения
			await loadApplication();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка при изменении статуса удаления операции';
			// Откатываем изменение в UI
			await loadApplication();
		}
	}

	async function handlePurgeOperation(operationId: string) {
		if (!applicationId) return;

		try {
			const response = await fetch(`/api/applications/${applicationId}/operations/${operationId}/purge`, {
				method: 'POST'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Ошибка при очистке операции');
			}

			// Обновляем данные после очистки
			await loadApplication();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка при очистке операции';
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('ru-RU', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Б';
		const k = 1024;
		const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	function getStatusText(status: ApplicationStatusInfo['status']): string {
		switch (status) {
			case 'completed':
				return 'Обработана';
			case 'processing':
				return 'Обрабатывается';
			case 'failed':
				return 'Ошибка';
			case 'nothing':
			default:
				return 'Новая';
		}
	}

	function getStatusVariant(status: ApplicationStatusInfo['status']): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'completed':
				return 'default';
			case 'failed':
				return 'destructive';
			case 'processing':
				return 'secondary';
			case 'nothing':
			default:
				return 'outline';
		}
	}

	function getFinalAbbreviation(): string | null {
		if (!statusInfo?.application?.abbreviation) return null;
		return statusInfo.application.abbreviation.abbreviation || null;
	}

	function isRealOperation(
		operation: ProcessingOperation | { task: ProcessingOperation['task']; status: ProcessingOperation['status'] }
	): operation is ProcessingOperation {
		return 'id' in operation;
	}

	// Получаем все операции, включая те, которых еще нет
	// Реактивная переменная, которая обновляется при изменении statusInfo
	$: allOperations = (() => {
		const operationTasks: ProcessingOperation['task'][] = ['extractText', 'resolveProductType', 'resolveAbbreviation'];
		const operations = statusInfo?.operations || [];
		const operationsMap = new Map(operations.map((op) => [op.task, op]));
		
		return operationTasks.map((task) => {
			const existing = operationsMap.get(task);
			if (existing) {
				return existing;
			}
			// Возвращаем "пустую" операцию для отображения
			return { task, status: 'started' as ProcessingOperation['status'] };
		});
	})();
</script>

<div class="application-details">
	{#if !applicationId}
		<EmptyState message="Выберите заявку для просмотра" />
	{:else if error && !statusInfo}
		<div class="p-4">
			<Alert variant="destructive">
				<AlertTitle>Ошибка</AlertTitle>
				<AlertDescription>
					<div class="flex items-center justify-between">
						<span>{error}</span>
						<button
							onclick={() => error = null}
							class="ml-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
							aria-label="Закрыть"
						>
							<X class="h-4 w-4" />
						</button>
					</div>
				</AlertDescription>
			</Alert>
		</div>
	{:else if statusInfo}
		<div class="p-6">
			<div class="mb-6 flex justify-between items-center">
				<h2 class="m-0 text-2xl font-semibold text-foreground">Детали заявки</h2>
				<div class="flex gap-2 items-center flex-nowrap">
					<Button
						variant="ghost"
						size="sm"
						onclick={handleRefresh}
						disabled={isRefreshing || isPurging || isTogglingDelete}
						title="Обновить данные заявки и статусы операций"
						aria-label="Обновить данные заявки и статусы операций"
					>
						<RefreshCw class="mr-2 h-4 w-4" />
						{isRefreshing ? 'Обновление...' : 'Обновить'}
					</Button>
					{#if statusInfo.application.deleted || false}
						<Button
							variant="secondary"
							size="sm"
							onclick={() => handleToggleDelete(false)}
							disabled={isRefreshing || isPurging || isTogglingDelete}
							title="Вернуть заявку из удаленных. Заявка снова появится в списке."
							aria-label="Вернуть заявку из удаленных"
						>
							<Undo2 class="mr-2 h-4 w-4" />
							Вернуть
						</Button>
					{:else}
						<Button
							variant="secondary"
							size="sm"
							onclick={() => handleToggleDelete(true)}
							disabled={isRefreshing || isPurging || isTogglingDelete}
							title="Пометить заявку как удаленную. Заявка скроется из списка, но останется в базе данных."
							aria-label="Пометить заявку как удаленную"
						>
							<Archive class="mr-2 h-4 w-4" />
							Архив
						</Button>
					{/if}
					<Button
						variant="destructive"
						size="sm"
						onclick={handleOpenPurgeModal}
						disabled={isRefreshing || isPurging || isTogglingDelete}
						title="Полностью удалить заявку и все связанные файлы из системы. Это действие необратимо."
						aria-label="Полностью удалить заявку"
					>
						<Trash2 class="h-4 w-4" />
					</Button>
				</div>
			</div>

			{#if error}
				<div class="p-4">
					<Alert variant="destructive">
						<AlertTitle>Ошибка</AlertTitle>
						<AlertDescription>
							<div class="flex items-center justify-between">
								<span>{error}</span>
								<button
									onclick={() => error = null}
									class="ml-4 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
									aria-label="Закрыть"
								>
									<X class="h-4 w-4" />
								</button>
							</div>
						</AlertDescription>
					</Alert>
				</div>
			{/if}

			<Card class="mb-8 last:mb-0">
				<CardContent>
					<h3 class="m-0 mb-4 text-lg font-semibold text-foreground">Основная информация</h3>
					<form class="space-y-4 mt-4">
						{#if statusInfo.application.productType}
							<div class="mb-4">
								<label for="product-type-display" class="block text-sm font-medium mb-2">Тип продукции:</label>
								<Input
									id="product-type-display"
									value={statusInfo.application.productType.type}
									readonly
								/>
							</div>
						{/if}
						<div class="mb-4">
							<label for="filename-display" class="block text-sm font-medium mb-2">Название файла:</label>
							<Input
								id="filename-display"
								value={statusInfo.application.originalFilename}
								readonly
							/>
						</div>
						<div class="mb-4">
							<label for="arrival-date-display" class="block text-sm font-medium mb-2">Дата загрузки:</label>
							<Input
								id="arrival-date-display"
								value={formatDate(statusInfo.application.uploadDate)}
								readonly
							/>
						</div>
						<div class="mb-4">
							<label for="status-display" class="block text-sm font-medium mb-2">Статус:</label>
							<Badge id="status-display" variant={getStatusVariant(statusInfo.status)}>
								{getStatusText(statusInfo.status)}
							</Badge>
						</div>
						<div class="mb-4">
							<div class="block text-sm font-medium mb-2">Статусы операций:</div>
							<div class="w-full mt-2">
								{#each allOperations as operationOrPlaceholder}
									<OperationStatusBadge 
										operation={operationOrPlaceholder} 
										applicationId={applicationId}
										onRun={handleRunOperation}
										isRunning={runningOperations.has(operationOrPlaceholder.task)}
										onToggleDelete={isRealOperation(operationOrPlaceholder) ? (id, deleted) => handleToggleOperationDelete(id, deleted) : null}
										onPurge={isRealOperation(operationOrPlaceholder) ? (id) => handlePurgeOperation(id) : null}
									/>
								{/each}
							</div>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card class="mb-8 last:mb-0">
				<CardContent>
					<h3 class="m-0 mb-4 text-lg font-semibold text-foreground">Информация о файле</h3>
					{#if fileInfo}
						<form class="space-y-4 mt-4">
							<div class="mb-4">
								<label for="file-name-display" class="block text-sm font-medium mb-2">Имя файла:</label>
								<Input
									id="file-name-display"
									value={fileInfo.name}
									readonly
								/>
							</div>
							<div class="mb-4">
								<label for="file-type-display" class="block text-sm font-medium mb-2">Тип файла:</label>
								<Input
									id="file-type-display"
									value={fileInfo.type}
									readonly
								/>
							</div>
							<div class="mb-4">
								<label for="file-page-count-display" class="block text-sm font-medium mb-2">Количество страниц:</label>
								<Input
									id="file-page-count-display"
									value={fileInfo.pageCount.toString()}
									readonly
								/>
							</div>
							{#if fileInfo.extractedText}
								<div class="mb-4">
									<label for="extracted-text-display" class="block text-sm font-medium mb-2">Извлеченный текст:</label>
									<Textarea
										id="extracted-text-display"
										value={fileInfo.extractedText.substring(0, 200) + (fileInfo.extractedText.length > 200 ? `... (еще ${fileInfo.extractedText.length - 200} символов)` : '')}
										readonly
										rows={5}
										class="bg-muted border border-border text-sm leading-relaxed max-h-[12.5rem] overflow-y-auto whitespace-pre-wrap break-words"
									/>
								</div>
							{/if}
						</form>
					{:else}
						<p class="mt-4">Информация о файле недоступна</p>
					{/if}
				</CardContent>
			</Card>

			{#if statusInfo.status === 'completed' || statusInfo.status === 'processing'}
				<Card class="mb-8 last:mb-0 bg-primary/10 border-2 border-primary">
					<CardContent>
						<h3 class="m-0 mb-4 text-lg font-semibold text-foreground">Результаты обработки</h3>
						<div class="mb-4 mt-4">
							<label for="final-abbreviation" class="block text-sm font-medium mb-2">Финальное обозначение продукции:</label>
							{#if getFinalAbbreviation()}
								<div id="final-abbreviation" class="text-xl font-semibold text-primary mt-2">{getFinalAbbreviation()}</div>
							{:else}
								<div id="final-abbreviation" class="text-base text-muted-foreground mt-2 italic">Аббревиатура не сформирована</div>
							{/if}
						</div>
					</CardContent>
				</Card>
			{/if}
		</div>
	{/if}

	<Dialog bind:open={purgeModalOpen}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Подтверждение очистки заявки</DialogTitle>
				<DialogDescription>
					Вы уверены, что хотите полностью удалить эту заявку? Это действие удалит заявку из базы данных и все связанные файлы. Это действие необратимо.
				</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button variant="outline" onclick={handleClosePurgeModal}>
					Отмена
				</Button>
				<Button variant="destructive" onclick={handlePurge}>
					Очистить
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</div>

<style>
	.application-details {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background));
		overflow-y: auto;
	}

	:global(.header-actions button) {
		flex-shrink: 0;
		white-space: nowrap;
	}
</style>
