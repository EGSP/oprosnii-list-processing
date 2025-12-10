<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getApplicationStatusInfo, getTechnicalSpecs, processApplication, getFileInfo } from '$lib/business/rest.js';
	import type { ApplicationStatusInfo, ProcessingOperation } from '$lib/business/types.js';
	import EmptyState from './EmptyState.svelte';
	import OperationStatusBadge from './OperationStatusBadge.svelte';
	import { Err, type Result } from 'neverthrow';
	import type { FileInfo } from '$lib/storage/files.js';

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
	let isLoading = false;
	let error: string | null = null;
	let operationsUpdateInterval: ReturnType<typeof setInterval> | null = null;
	let fileInfo: FileInfo | null = null;
	let isLoadingFileInfo = false;

	$: if (applicationId) {
		loadApplication();
	} else {
		statusInfo = null;
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
		const result = await getTechnicalSpecs();
		if (result.isErr()) {
			error = result.error.message;
			return;
		}
		technicalSpecs = result.value as TechnicalSpec[];
		if (technicalSpecs.length > 0 && !selectedTechnicalSpecId) {
			selectedTechnicalSpecId = technicalSpecs[0].id;
		}
	}

	async function loadApplication() {
		if (!applicationId) return;

		isLoading = true;
		error = null;
		const statusInfoResult = await getApplicationStatusInfo(applicationId);
		if (statusInfoResult.isErr()) {
			error = statusInfoResult.error.message;
			statusInfo = null;
			fileInfo = null;
			isLoading = false;
			return;
		}

		statusInfo = statusInfoResult.value;
		// Загружаем информацию о файле
		await loadFileInfo();
		isLoading = false;
	}

	/**
	 * Обновляет заявку без показа индикатора загрузки (для фонового обновления)
	 */
	async function refreshApplication() {
		if (!applicationId) return;

		const statusInfoResult = await getApplicationStatusInfo(applicationId);
		if (statusInfoResult.isErr()) {
			// Игнорируем ошибки при фоновом обновлении
			console.warn('Не удалось обновить заявку:', statusInfoResult.error);
			return;
		}

		statusInfo = statusInfoResult.value;
	}

	async function loadFileInfo() {
		if (!applicationId) return;

		isLoadingFileInfo = true;
		const fileInfoResult = await getFileInfo(applicationId);
		if (fileInfoResult.isErr()) {
			// Игнорируем ошибки загрузки информации о файле, чтобы не блокировать отображение заявки
			console.warn('Не удалось загрузить информацию о файле:', fileInfoResult.error);
			fileInfo = null;
		} else {
			fileInfo = fileInfoResult.value;
		}
		isLoadingFileInfo = false;
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
		const processResult = await processApplication(applicationId, selectedTechnicalSpecId);
		if (processResult.isErr()) {
			error = processResult.error.message;
		}
		
		// Всегда обновляем данные после обработки, даже при ошибке
		// Это обеспечит отображение частичных результатов
		await loadApplication();
		// Запускаем периодическое обновление, если нужно
		startOperationsUpdate();
		isProcessing = false;
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
	{:else if isLoading}
		<div class="loading">Загрузка...</div>
	{:else if error && !statusInfo}
		<div class="error">{error}</div>
	{:else if statusInfo}
		<div class="details-content">
			<div class="header">
				<h2>Детали заявки</h2>
			</div>

			{#if error}
				<div class="error">{error}</div>
			{/if}

			<div class="section">
				<h3>Основная информация</h3>
				{#if statusInfo.application.productType}
					<div class="field">
						<label for="product-type-display">Тип продукции:</label>
						<span id="product-type-display">{statusInfo.application.productType.type}</span>
					</div>
				{/if}
				<div class="field">
					<label for="filename-display">Название файла:</label>
					<span id="filename-display">{statusInfo.application.originalFilename}</span>
				</div>
				<div class="field">
					<label for="arrival-date-display">Дата загрузки:</label>
					<span id="arrival-date-display">{formatDate(statusInfo.application.uploadDate)}</span>
				</div>
				<div class="field">
					<label for="status-display">Статус:</label>
					<span id="status-display" class="status" class:processed={statusInfo.status === 'completed'} class:failed={statusInfo.status === 'failed'}>
						{getStatusText(statusInfo.status)}
					</span>
				</div>
				<div class="field operations-status">
					<div class="field-label">Статусы операций:</div>
					<div class="operations-list">
						{#each getAllOperations() as operationOrPlaceholder}
							<OperationStatusBadge operation={operationOrPlaceholder} />
						{/each}
					</div>
				</div>
			</div>

			<div class="section">
				<h3>Информация о файле</h3>
				{#if isLoadingFileInfo}
					<div class="loading">Загрузка информации о файле...</div>
				{:else if fileInfo}
					<div class="field">
						<label>Имя файла:</label>
						<span>{fileInfo.name}</span>
					</div>
					<div class="field">
						<label>Тип файла:</label>
						<span>{fileInfo.type}</span>
					</div>
					<div class="field">
						<label>Количество страниц:</label>
						<span>{fileInfo.pageCount}</span>
					</div>
					{#if fileInfo.extractedText}
						<div class="field">
							<label>Извлеченный текст:</label>
							<div class="extracted-text-preview">
								{fileInfo.extractedText.substring(0, 200)}
								{#if fileInfo.extractedText.length > 200}
									<span class="text-more">... (еще {fileInfo.extractedText.length - 200} символов)</span>
								{/if}
							</div>
						</div>
					{/if}
				{:else}
					<div class="field">Информация о файле недоступна</div>
				{/if}
			</div>

			<div class="section">
				<h3>Обработка</h3>
				<div class="field">
					<label for="technical-spec-select">Технические условия:</label>
					<select
						id="technical-spec-select"
						bind:value={selectedTechnicalSpecId}
						disabled={isProcessing || statusInfo.status === 'completed'}
					>
						{#each technicalSpecs as spec}
							<option value={spec.id}>{spec.name}</option>
						{/each}
					</select>
				</div>
				<button
					class="process-button"
					on:click={handleProcess}
					disabled={isProcessing || !selectedTechnicalSpecId || statusInfo.status === 'completed'}
				>
					{isProcessing ? 'Обработка...' : 'Обработать заявку'}
				</button>
			</div>

			{#if statusInfo.status === 'completed' || statusInfo.status === 'processing'}
				<div class="section">
					<h3>Результаты обработки</h3>

					<div class="field-group final-abbreviation">
						<label for="final-abbreviation">Финальное обозначение продукции:</label>
						{#if getFinalAbbreviation()}
							<div id="final-abbreviation" class="abbreviation-value">{getFinalAbbreviation()}</div>
						{:else}
							<div id="final-abbreviation" class="abbreviation-empty">Аббревиатура не сформирована</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.application-details {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-background);
		overflow-y: auto;
	}

	.loading {
		padding: 2rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.error {
		padding: 0.75rem 1rem;
		background: var(--color-error-bg);
		color: var(--color-error);
		font-size: 0.875rem;
		margin: 1rem;
		border-radius: var(--border-radius);
	}

	.details-content {
		padding: 1.5rem;
	}

	.header {
		margin-bottom: 1.5rem;
	}

	.header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.section {
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.section:last-child {
		border-bottom: none;
	}

	.section h3 {
		margin: 0 0 1rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.field {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.75rem;
		gap: 1rem;
	}

	.field label {
		font-weight: 500;
		color: var(--color-text-secondary);
		min-width: 150px;
	}

	.field span {
		color: var(--color-text);
		text-align: right;
		flex: 1;
	}

	.field.operations-status {
		flex-direction: column;
		align-items: flex-start;
	}

	.field.operations-status .field-label {
		font-weight: 500;
		color: var(--color-text-secondary);
		margin-bottom: 0.75rem;
	}

	.operations-list {
		width: 100%;
	}

	.field select {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius);
		background: var(--color-background);
		color: var(--color-text);
		font-size: 1rem;
	}

	.field select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status {
		padding: 0.25rem 0.75rem;
		border-radius: var(--border-radius-sm);
		background: var(--color-status-new);
		color: var(--color-text);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.status.processed {
		background: var(--color-status-processed);
	}

	.process-button {
		padding: 0.75rem 1.5rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: var(--border-radius);
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s ease;
		margin-top: 1rem;
	}

	.process-button:hover:not(:disabled) {
		background: var(--color-primary-dark);
	}

	.process-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.field-group {
		margin-bottom: 1.5rem;
	}

	.field-group label {
		display: block;
		font-weight: 500;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
	}

	.final-abbreviation {
		background: var(--color-success-bg);
		padding: 1rem;
		border-radius: var(--border-radius);
		border: 2px solid var(--color-success);
	}

	.abbreviation-value {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-success);
		margin-top: 0.5rem;
	}

	.abbreviation-empty {
		font-size: 1rem;
		color: var(--color-text-secondary);
		margin-top: 0.5rem;
		font-style: italic;
	}

	.extracted-text-preview {
		background: var(--color-background-secondary);
		padding: 0.75rem;
		border-radius: var(--border-radius);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		font-size: 0.875rem;
		line-height: 1.5;
		max-height: 200px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.text-more {
		color: var(--color-text-secondary);
		font-style: italic;
		font-size: 0.8rem;
	}
</style>
