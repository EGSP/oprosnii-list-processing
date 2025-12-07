<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getApplications,
		uploadApplication,
		getApplicationStatusInfo
	} from '$lib/business/rest.js';
	import type { Application, ApplicationStatusInfo } from '$lib/business/types.js';
	import FileUpload from './FileUpload.svelte';
	import EmptyState from './EmptyState.svelte';
	import { createEventDispatcher } from 'svelte';
	import { Err, type Result } from 'neverthrow';

	const dispatch = createEventDispatcher<{
		select: { application: Application };
		upload: { application: Application };
		error: { message: string };
	}>();

	let applicationsStatusInfo: ApplicationStatusInfo[] = [];
	let selectedId: string | null = null;
	let isLoading = false;
	let error: string | null = null;

	onMount(() => {
		loadApplications();
	});

	function hasErr<T>(result: Result<T, Error>): result is Err<T, Error> {
		if (result.isErr()) {
			error = result.error instanceof Error ? result.error.message : 'Ошибка загрузки заявок';
			return true;
		}
		return false;
	}

	async function loadApplications() {
		isLoading = true;
		error = null;
		const applicationsResult = await getApplications();
		if (hasErr(applicationsResult)) {
			isLoading = false;
			return;
		}

		// Загружаем статус для каждой заявки параллельно
		const statusInfoResults = await Promise.all(
			applicationsResult.value.map((app) => 
				getApplicationStatusInfo(app.id).then(result => ({ result, app }))
			)
		);

		applicationsStatusInfo = statusInfoResults
			.map(({ result, app }) => {
				if (result.isErr()) {
					// Если не удалось загрузить статус, создаем базовую информацию
					return {
						application: app,
						status: 'nothing' as const,
						operations: []
					};
				}
				return result.value;
			})
			.filter((info): info is ApplicationStatusInfo => info !== null);

		// Сортируем по дате загрузки (сверху самая поздняя)
		applicationsStatusInfo.sort(
			(a, b) => new Date(b.application.uploadDate).getTime() - new Date(a.application.uploadDate).getTime()
		);
		isLoading = false;
	}

	function handleUpload(event: CustomEvent<{ file: File }>) {
		const file = event.detail.file;
		uploadFile(file);
	}

	async function uploadFile(file: File) {
		isLoading = true;
		error = null;
		const newApplicationResponse = await uploadApplication(file);
		if (hasErr(newApplicationResponse)) {
			isLoading = false;
			return;
		}
		// Обновляем список заявок
		await loadApplications();
		// Находим загруженную заявку в списке
		const uploadedStatusInfo = applicationsStatusInfo.find(
			(info) => info.application.id === newApplicationResponse.value.id
		);
		if (uploadedStatusInfo) {
			selectApplication(uploadedStatusInfo.application.id);
			dispatch('upload', { application: uploadedStatusInfo.application });
		}
		isLoading = false;
	}

	function handleError(event: CustomEvent<{ message: string }>) {
		error = event.detail.message;
		dispatch('error', { message: error });
	}

	function selectApplication(id: string) {
		selectedId = id;
		const statusInfo = applicationsStatusInfo.find((info) => info.application.id === id);
		if (statusInfo) {
			dispatch('select', { application: statusInfo.application });
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
		{:else if applicationsStatusInfo.length === 0}
			<EmptyState message="Нет загруженных заявок" />
		{:else}
			<div class="applications">
				{#each applicationsStatusInfo as statusInfo (statusInfo.application.id)}
					<button
						class="application-item"
						class:selected={selectedId === statusInfo.application.id}
						class:processed={statusInfo.status === 'completed'}
						class:failed={statusInfo.status === 'failed'}
						on:click={() => selectApplication(statusInfo.application.id)}
					>
						<div class="application-name">{statusInfo.application.originalFilename}</div>
						<div class="application-meta">
							<span class="date">{formatDate(statusInfo.application.uploadDate)}</span>
							<span class="status" class:processed={statusInfo.status === 'completed'} class:failed={statusInfo.status === 'failed'}>
								{getStatusText(statusInfo.status)}
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

	.status.failed {
		background: var(--color-error-bg);
		color: var(--color-error);
	}

	.application-item.failed {
		border-left-color: var(--color-error);
	}
</style>
