<script lang="ts">
	import { onMount } from 'svelte';
	import { getApplication, getTechnicalSpecs, processApplication } from '$lib/api/client.js';
	import type { Application, TechnicalSpec } from '$lib/storage/types.js';
	import EmptyState from './EmptyState.svelte';

	export let applicationId: string | null = null;

	let application: Application | null = null;
	let technicalSpecs: TechnicalSpec[] = [];
	let selectedTechnicalSpecId: string = '';
	let isProcessing = false;
	let isLoading = false;
	let error: string | null = null;

	$: if (applicationId) {
		loadApplication();
	} else {
		application = null;
	}

	onMount(() => {
		loadTechnicalSpecs();
	});

	async function loadTechnicalSpecs() {
		try {
			technicalSpecs = await getTechnicalSpecs();
			if (technicalSpecs.length > 0 && !selectedTechnicalSpecId) {
				selectedTechnicalSpecId = technicalSpecs[0].id;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка загрузки ТУ';
		}
	}

	async function loadApplication() {
		if (!applicationId) return;

		isLoading = true;
		error = null;
		try {
			application = await getApplication(applicationId);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка загрузки заявки';
			application = null;
		} finally {
			isLoading = false;
		}
	}

	async function handleProcess() {
		if (!applicationId || !selectedTechnicalSpecId) {
			error = 'Выберите технические условия';
			return;
		}

		isProcessing = true;
		error = null;
		try {
			await processApplication(applicationId, selectedTechnicalSpecId);
			// Обновляем данные заявки после обработки
			await loadApplication();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка обработки заявки';
		} finally {
			isProcessing = false;
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

	function getStatus(): string {
		if (!application) return '';
		if (application.processingEndDate) {
			return 'Обработана';
		}
		if (application.processingStartDate) {
			return 'Обрабатывается';
		}
		return 'Новая';
	}

	function getFinalAbbreviation(): string | null {
		if (!application?.llmAbbreviationResult) return null;
		const result = application.llmAbbreviationResult;
		return (result as { abbreviation?: string })?.abbreviation || null;
	}
</script>

<div class="application-details">
	{#if !applicationId}
		<EmptyState message="Выберите заявку для просмотра" />
	{:else if isLoading}
		<div class="loading">Загрузка...</div>
	{:else if error && !application}
		<div class="error">{error}</div>
	{:else if application}
		<div class="details-content">
			<div class="header">
				<h2>Детали заявки</h2>
			</div>

			{#if error}
				<div class="error">{error}</div>
			{/if}

			<div class="section">
				<h3>Основная информация</h3>
				<div class="field">
					<label for="filename-display">Название файла:</label>
					<span id="filename-display">{application.originalFilename}</span>
				</div>
				<div class="field">
					<label for="arrival-date-display">Дата загрузки:</label>
					<span id="arrival-date-display">{formatDate(application.arrivalDate)}</span>
				</div>
				<div class="field">
					<label for="status-display">Статус:</label>
					<span id="status-display" class="status" class:processed={application.processingEndDate}>
						{getStatus()}
					</span>
				</div>
				{#if application.productType}
					<div class="field">
						<label for="product-type-display">Тип продукции:</label>
						<span id="product-type-display">{application.productType}</span>
					</div>
				{/if}
			</div>

			<div class="section">
				<h3>Обработка</h3>
				<div class="field">
					<label for="technical-spec-select">Технические условия:</label>
					<select
						id="technical-spec-select"
						bind:value={selectedTechnicalSpecId}
						disabled={isProcessing || !!application.processingEndDate}
					>
						{#each technicalSpecs as spec}
							<option value={spec.id}>{spec.name}</option>
						{/each}
					</select>
				</div>
				<button
					class="process-button"
					on:click={handleProcess}
					disabled={isProcessing || !selectedTechnicalSpecId || !!application.processingEndDate}
				>
					{isProcessing ? 'Обработка...' : 'Обработать заявку'}
				</button>
			</div>

			{#if application.processingStartDate || application.processingEndDate}
				<div class="section">
					<h3>Результаты обработки</h3>

					{#if application.ocrResult}
						<div class="field-group">
							<label for="ocr-result">OCR результат:</label>
							<pre id="ocr-result" class="result-data">{JSON.stringify(application.ocrResult, null, 2)}</pre>
						</div>
					{/if}

					{#if application.llmProductTypeResult}
						<div class="field-group">
							<label for="product-type-result">Результат определения типа:</label>
							<pre id="product-type-result" class="result-data">
								{JSON.stringify(application.llmProductTypeResult, null, 2)}
							</pre>
						</div>
					{/if}

					{#if application.llmAbbreviationResult}
						<div class="field-group">
							<label for="abbreviation-result">Результат формирования аббревиатуры:</label>
							<pre id="abbreviation-result" class="result-data">
								{JSON.stringify(application.llmAbbreviationResult, null, 2)}
							</pre>
						</div>
					{/if}

					{#if getFinalAbbreviation()}
						<div class="field-group final-abbreviation">
							<label for="final-abbreviation">Финальное обозначение продукции:</label>
							<div id="final-abbreviation" class="abbreviation-value">{getFinalAbbreviation()}</div>
						</div>
					{/if}
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

	.result-data {
		background: var(--color-code-bg);
		padding: 1rem;
		border-radius: var(--border-radius);
		font-size: 0.875rem;
		overflow-x: auto;
		color: var(--color-text);
		margin: 0;
		font-family: 'Courier New', monospace;
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
</style>
