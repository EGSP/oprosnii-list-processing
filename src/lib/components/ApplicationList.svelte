<script lang="ts">
	import { onMount } from 'svelte';
	import { getApplications, uploadApplication, getApplication } from '$lib/api/client.js';
	import type { Application } from '$lib/storage/types.js';
	import FileUpload from './FileUpload.svelte';
	import EmptyState from './EmptyState.svelte';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher<{
		select: { application: Application };
		upload: { application: Application };
		error: { message: string };
	}>();

	let applications: Application[] = [];
	let selectedId: string | null = null;
	let isLoading = false;
	let error: string | null = null;

	onMount(() => {
		loadApplications();
	});

	async function loadApplications() {
		isLoading = true;
		error = null;
		try {
			applications = await getApplications();
			// Сортируем по дате загрузки (сверху самая поздняя)
			applications.sort(
				(a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime()
			);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка загрузки заявок';
		} finally {
			isLoading = false;
		}
	}

	function handleUpload(event: CustomEvent<{ file: File }>) {
		const file = event.detail.file;
		uploadFile(file);
	}

	async function uploadFile(file: File) {
		isLoading = true;
		error = null;
		try {
			const newApplicationResponse = await uploadApplication(file);
			// Обновляем список заявок
			await loadApplications();
			// Загружаем полную заявку
			const fullApplication = await getApplication(newApplicationResponse.id);
			selectApplication(fullApplication.id);
			dispatch('upload', { application: fullApplication });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Ошибка загрузки файла';
			dispatch('error', { message: error });
		} finally {
			isLoading = false;
		}
	}

	function handleError(event: CustomEvent<{ message: string }>) {
		error = event.detail.message;
		dispatch('error', { message: error });
	}

	function selectApplication(id: string) {
		selectedId = id;
		const application = applications.find((app) => app.id === id);
		if (application) {
			dispatch('select', { application });
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

	function getStatus(application: Application): string {
		if (application.processingEndDate) {
			return 'Обработана';
		}
		if (application.processingStartDate) {
			return 'Обрабатывается';
		}
		return 'Новая';
	}
</script>

<div class="application-list">
	<div class="header">
		<h2>Заявки</h2>
	</div>

	<div class="upload-section">
		<FileUpload on:upload={handleUpload} on:error={handleError} />
	</div>

	{#if error}
		<div class="error">{error}</div>
	{/if}

	<div class="list-content">
		{#if isLoading}
			<div class="loading">Загрузка...</div>
		{:else if applications.length === 0}
			<EmptyState message="Нет загруженных заявок" />
		{:else}
			<div class="applications">
				{#each applications as application (application.id)}
					<button
						class="application-item"
						class:selected={selectedId === application.id}
						on:click={() => selectApplication(application.id)}
					>
						<div class="application-name">{application.originalFilename}</div>
						<div class="application-meta">
							<span class="date">{formatDate(application.arrivalDate)}</span>
							<span class="status" class:processed={application.processingEndDate}>
								{getStatus(application)}
							</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.application-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-background);
		border-right: 1px solid var(--color-border);
	}

	.header {
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.upload-section {
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.error {
		padding: 0.75rem 1rem;
		background: var(--color-error-bg);
		color: var(--color-error);
		font-size: 0.875rem;
		margin: 0 1rem;
		border-radius: var(--border-radius);
	}

	.list-content {
		flex: 1;
		overflow-y: auto;
	}

	.loading {
		padding: 2rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.applications {
		display: flex;
		flex-direction: column;
	}

	.application-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 1rem;
		border: none;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-background);
		cursor: pointer;
		text-align: left;
		transition: background 0.2s ease;
	}

	.application-item:hover {
		background: var(--color-background-hover);
	}

	.application-item.selected {
		background: var(--color-primary-light);
		border-left: 3px solid var(--color-primary);
	}

	.application-name {
		font-weight: 500;
		color: var(--color-text);
		margin-bottom: 0.5rem;
		word-break: break-word;
	}

	.application-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		font-size: 0.875rem;
	}

	.date {
		color: var(--color-text-secondary);
	}

	.status {
		padding: 0.25rem 0.5rem;
		border-radius: var(--border-radius-sm);
		background: var(--color-status-new);
		color: var(--color-text);
		font-size: 0.75rem;
	}

	.status.processed {
		background: var(--color-status-processed);
	}
</style>
