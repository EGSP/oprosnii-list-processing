<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getApplicationStatusInfo, getTechnicalSpecs, processApplication, getFileInfo, fetchApplication, extractText, resolveProductType, resolveAbbreviation } from '$lib/business/rest.js';
	import type { ApplicationStatusInfo, ProcessingOperation } from '$lib/business/types.js';
	import EmptyState from './EmptyState.svelte';
	import OperationStatusBadge from './OperationStatusBadge.svelte';
	import { Effect, Option } from 'effect';
	import type { FileInfo } from '$lib/storage/files.js';
	import { Button, Select, SelectItem, Form, FormGroup, TextInput, TextArea, Tile, Tag, InlineNotification } from 'carbon-components-svelte';
	import { Renew } from 'carbon-icons-svelte';

	interface TechnicalSpec {
		id: string;
		name: string;
		description?: string;
	}

	export let applicationId: string | null = null;

	let statusInfo: ApplicationStatusInfo | null = null;
	let technicalSpecs: TechnicalSpec[] = [];
	let selectedTechnicalSpecId: string = '';
	let isProcessing = false;
	let error: string | null = null;
	let operationsUpdateInterval: ReturnType<typeof setInterval> | null = null;
	let fileInfo: FileInfo | null = null;
	let isRefreshing = false;
	let runningOperations = new Set<ProcessingOperation['task']>();

	$: if (applicationId) {
		loadApplication();
	} else {
		statusInfo = null;
		fileInfo = null;
		stopOperationsUpdate();
	}

	onMount(() => {
		loadTechnicalSpecs();
		// Если заявка уже выбрана при монтировании, загружаем её
		if (applicationId) {
			loadApplication();
		}
	});

	onDestroy(() => {
		stopOperationsUpdate();
	});

	async function loadTechnicalSpecs() {
		const specs = await Effect.runPromise(getTechnicalSpecs()).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка загрузки технических условий';
			return null;
		});
		if (specs) {
			technicalSpecs = specs as TechnicalSpec[];
			if (technicalSpecs.length > 0 && !selectedTechnicalSpecId) {
				selectedTechnicalSpecId = technicalSpecs[0].id;
			}
		}
	}

	async function loadApplication() {
		if (!applicationId) return;

		// Не показываем индикатор загрузки, чтобы избежать моргания при быстром переключении
		// Предыдущие данные остаются видимыми до загрузки новых
		error = null;
		const currentApplicationId = applicationId; // Сохраняем ID для проверки актуальности
		
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const status = yield* getApplicationStatusInfo(applicationId);
				const file = yield* Effect.option(getFileInfo(applicationId));
				return { status, file };
			})
		).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка загрузки заявки';
			// Сбрасываем данные только если это все еще актуальная заявка
			if (currentApplicationId === applicationId) {
				statusInfo = null;
				fileInfo = null;
			}
			return null;
		});
		
		// Обновляем данные только если заявка не изменилась во время загрузки
		if (result && currentApplicationId === applicationId) {
			statusInfo = result.status;
			fileInfo = Option.isSome(result.file) ? result.file.value : null;
		}
	}

	/**
	 * Обновляет заявку без показа индикатора загрузки (для фонового обновления)
	 */
	async function refreshApplication() {
		if (!applicationId) return;

		const result = await Effect.runPromise(getApplicationStatusInfo(applicationId)).catch((err) => {
			// Игнорируем ошибки при фоновом обновлении
			console.warn('Не удалось обновить заявку:', err);
			return null;
		});
		
		if (result) {
			statusInfo = result;
		}
	}


	/**
	 * Проверяет, нужно ли обновлять данные заявки и операций
	 */
	function shouldUpdate(): boolean {
		// Если нет статуса - не обновляем
		if (!statusInfo) return false;

		// Если статус completed или failed - не обновляем
		if (statusInfo.status === 'completed' || statusInfo.status === 'failed') return false;

		// Если статус processing - обновляем
		return statusInfo.status === 'processing';
	}

	function startOperationsUpdate() {
		stopOperationsUpdate();

		// Проверяем, нужно ли обновление
		if (!shouldUpdate()) {
			return;
		}

		// Обновляем заявку и операции каждые 3 секунды
		operationsUpdateInterval = setInterval(async () => {
			if (!applicationId) {
				stopOperationsUpdate();
				return;
			}

			// Проверяем перед каждым обновлением
			if (!shouldUpdate()) {
				stopOperationsUpdate();
				return;
			}

			// Обновляем статус (без показа индикатора загрузки)
			await refreshApplication();
		}, 3000);
	}

	function stopOperationsUpdate() {
		if (operationsUpdateInterval) {
			clearInterval(operationsUpdateInterval);
			operationsUpdateInterval = null;
		}
	}

	async function handleProcess() {
		if (!applicationId || !selectedTechnicalSpecId) {
			error = 'Выберите технические условия';
			return;
		}

		isProcessing = true;
		error = null;
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				yield* processApplication(applicationId, selectedTechnicalSpecId);
				const status = yield* getApplicationStatusInfo(applicationId);
				const file = yield* Effect.option(getFileInfo(applicationId));
				return { status, file };
			})
		).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка обработки заявки';
			// Всегда обновляем данные после обработки, даже при ошибке
			// Это обеспечит отображение частичных результатов
			return null;
		});
		
		if (result) {
			statusInfo = result.status;
			fileInfo = Option.isSome(result.file) ? result.file.value : null;
		} else {
			// Всегда обновляем данные после обработки, даже при ошибке
			await loadApplication();
		}
		// Запускаем периодическое обновление, если нужно
		startOperationsUpdate();
		isProcessing = false;
	}

	async function handleRefresh() {
		if (!applicationId) return;

		isRefreshing = true;
		error = null;
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				yield* fetchApplication(applicationId);
				const status = yield* getApplicationStatusInfo(applicationId);
				const file = yield* Effect.option(getFileInfo(applicationId));
				return { status, file };
			})
		).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка обновления заявки';
			isRefreshing = false;
			return null;
		});
		
		if (result) {
			statusInfo = result.status;
			fileInfo = Option.isSome(result.file) ? result.file.value : null;
			// Запускаем периодическое обновление, если нужно
			startOperationsUpdate();
		}
		isRefreshing = false;
	}

	async function handleRunOperation(task: ProcessingOperation['task']) {
		if (!applicationId) return;

		// Для resolveAbbreviation нужен technicalSpecId
		if (task === 'resolveAbbreviation' && !selectedTechnicalSpecId) {
			error = 'Выберите технические условия для формирования аббревиатуры';
			return;
		}

		runningOperations.add(task);
		error = null;

		let operationEffect: Effect.Effect<void, Error>;
		if (task === 'extractText') {
			operationEffect = extractText(applicationId);
		} else if (task === 'resolveProductType') {
			operationEffect = resolveProductType(applicationId);
		} else if (task === 'resolveAbbreviation') {
			operationEffect = resolveAbbreviation(applicationId, selectedTechnicalSpecId);
		} else {
			error = 'Неизвестная операция';
			runningOperations.delete(task);
			return;
		}

		const result = await Effect.runPromise(
			Effect.gen(function* () {
				yield* operationEffect;
				const status = yield* getApplicationStatusInfo(applicationId);
				const file = yield* Effect.option(getFileInfo(applicationId));
				return { status, file };
			})
		).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка выполнения операции';
			runningOperations.delete(task);
			return null;
		});
		
		if (result) {
			statusInfo = result.status;
			fileInfo = Option.isSome(result.file) ? result.file.value : null;
			// Запускаем периодическое обновление, если нужно
			startOperationsUpdate();
		}
		runningOperations.delete(task);
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

	function getFinalAbbreviation(): string | null {
		if (!statusInfo?.application?.abbreviation) return null;
		return statusInfo.application.abbreviation.abbreviation || null;
	}

	// Получаем все операции, включая те, которых еще нет
	function getAllOperations(): Array<ProcessingOperation | { task: ProcessingOperation['task']; status: ProcessingOperation['status'] }> {
		const operationTasks: ProcessingOperation['task'][] = ['extractText', 'resolveProductType', 'resolveAbbreviation'];
		const operations = statusInfo?.operations || [];
		const operationsMap = new Map(operations.map((op) => [op.task, op]));
		
		return operationTasks.map((task) => {
			const existing = operationsMap.get(task);
			if (existing) {
				return existing;
			}
			// Возвращаем "пустую" операцию для отображения
			return { task, status: 'started' };
		});
	}
</script>

<div class="application-details">
	{#if !applicationId}
		<EmptyState message="Выберите заявку для просмотра" />
	{:else if error && !statusInfo}
		<div class="error-section">
			<InlineNotification
				kind="error"
				title="Ошибка"
				subtitle={error}
				hideCloseButton={false}
				on:close={() => error = null}
			/>
		</div>
	{:else if statusInfo}
		<div class="details-content">
			<div class="header">
				<h2>Детали заявки</h2>
				<Button
					kind="ghost"
					size="sm"
					on:click={handleRefresh}
					disabled={isRefreshing}
					title="Обновить данные заявки"
				>
					<Renew slot="icon" />
					{isRefreshing ? 'Обновление...' : 'Обновить'}
				</Button>
			</div>

			{#if error}
				<div class="error-section">
					<InlineNotification
						kind="error"
						title="Ошибка"
						subtitle={error}
						hideCloseButton={false}
						on:close={() => error = null}
					/>
				</div>
			{/if}

			<Tile class="section">
				<h3>Основная информация</h3>
				<Form>
					{#if statusInfo.application.productType}
						<FormGroup>
							<TextInput
								id="product-type-display"
								labelText="Тип продукции:"
								value={statusInfo.application.productType.type}
								readonly
							/>
						</FormGroup>
					{/if}
					<FormGroup>
						<TextInput
							id="filename-display"
							labelText="Название файла:"
							value={statusInfo.application.originalFilename}
							readonly
						/>
					</FormGroup>
					<FormGroup>
						<TextInput
							id="arrival-date-display"
							labelText="Дата загрузки:"
							value={formatDate(statusInfo.application.uploadDate)}
							readonly
						/>
					</FormGroup>
					<FormGroup>
						<label for="status-display" class="bx--label">Статус:</label>
						{@const statusType = statusInfo.status === 'completed' ? 'green' : statusInfo.status === 'failed' ? 'red' : statusInfo.status === 'processing' ? 'blue' : 'gray'}
						<Tag id="status-display" type={statusType} size="sm">
							{getStatusText(statusInfo.status)}
						</Tag>
					</FormGroup>
					<FormGroup>
						<label class="bx--label">Статусы операций:</label>
						<div class="operations-list">
							{#each getAllOperations() as operationOrPlaceholder}
								<OperationStatusBadge 
									operation={operationOrPlaceholder} 
									applicationId={applicationId}
									onRun={handleRunOperation}
									isRunning={runningOperations.has(operationOrPlaceholder.task)}
								/>
							{/each}
						</div>
					</FormGroup>
				</Form>
			</Tile>

			<Tile class="section">
				<h3>Информация о файле</h3>
				{#if fileInfo}
					<Form>
						<FormGroup>
							<TextInput
								labelText="Имя файла:"
								value={fileInfo.name}
								readonly
							/>
						</FormGroup>
						<FormGroup>
							<TextInput
								labelText="Тип файла:"
								value={fileInfo.type}
								readonly
							/>
						</FormGroup>
						<FormGroup>
							<TextInput
								labelText="Количество страниц:"
								value={fileInfo.pageCount.toString()}
								readonly
							/>
						</FormGroup>
						{#if fileInfo.extractedText}
							<FormGroup>
								<label class="bx--label">Извлеченный текст:</label>
								<TextArea
									value={fileInfo.extractedText.substring(0, 200) + (fileInfo.extractedText.length > 200 ? `... (еще ${fileInfo.extractedText.length - 200} символов)` : '')}
									readonly
									rows={5}
									class="extracted-text-preview"
								/>
							</FormGroup>
						{/if}
					</Form>
				{:else}
					<p>Информация о файле недоступна</p>
				{/if}
			</Tile>

			<Tile class="section">
				<h3>Обработка</h3>
				<Form>
					<FormGroup>
						<Select
							id="technical-spec-select"
							labelText="Технические условия:"
							selectedItem={technicalSpecs.find(s => s.id === selectedTechnicalSpecId)}
							disabled={isProcessing || statusInfo.status === 'completed'}
							on:select={(e) => {
								const selected = e.detail.selectedItem;
								if (selected) {
									selectedTechnicalSpecId = selected.id;
								}
							}}
						>
							{#each technicalSpecs as spec}
								<SelectItem value={spec} text={spec.name} />
							{/each}
						</Select>
					</FormGroup>
					<FormGroup>
						<Button
							on:click={handleProcess}
							disabled={isProcessing || !selectedTechnicalSpecId || statusInfo.status === 'completed'}
						>
							{isProcessing ? 'Обработка...' : 'Обработать заявку'}
						</Button>
					</FormGroup>
				</Form>
			</Tile>

			{#if statusInfo.status === 'completed' || statusInfo.status === 'processing'}
				<Tile class="section final-abbreviation">
					<h3>Результаты обработки</h3>
					<FormGroup>
						<label for="final-abbreviation" class="bx--label">Финальное обозначение продукции:</label>
						{#if getFinalAbbreviation()}
							<div id="final-abbreviation" class="abbreviation-value">{getFinalAbbreviation()}</div>
						{:else}
							<div id="final-abbreviation" class="abbreviation-empty">Аббревиатура не сформирована</div>
						{/if}
					</FormGroup>
				</Tile>
			{/if}
		</div>
	{/if}
</div>

<style>
	.application-details {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--cds-layer);
		overflow-y: auto;
	}

	.error-section {
		padding: 1rem;
	}

	.details-content {
		padding: 1.5rem;
	}

	.header {
		margin-bottom: 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--cds-text-primary);
	}

	:global(.section.bx--tile) {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--cds-border-subtle);
	}

	:global(.section.bx--tile:last-child) {
		border-bottom: none;
	}

	:global(.section.bx--tile h3) {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--cds-text-primary);
	}

	.operations-list {
		width: 100%;
		margin-top: 0.5rem;
	}

	.final-abbreviation {
		background: var(--cds-support-success-inverse);
		border: 2px solid var(--cds-support-success);
	}

	.abbreviation-value {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--cds-support-success);
		margin-top: 0.5rem;
	}

	.abbreviation-empty {
		font-size: 1rem;
		color: var(--cds-text-secondary);
		margin-top: 0.5rem;
		font-style: italic;
	}

	:global(.extracted-text-preview.bx--text-area) {
		background: var(--cds-field);
		border: 1px solid var(--cds-border-subtle);
		font-size: 0.875rem;
		line-height: 1.5;
		max-height: 12.5rem;
		overflow-y: auto;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
