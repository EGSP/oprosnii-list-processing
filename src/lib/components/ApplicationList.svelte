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
	import { Effect, Option } from 'effect';
	import { ClickableTile, Tag, Loading, InlineNotification } from 'carbon-components-svelte';

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

	async function loadApplications() {
		isLoading = true;
		error = null;
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const applications = yield* getApplications();
				const statusInfos = yield* Effect.all(
					applications.map((app) =>
						Effect.gen(function* () {
							const statusInfo = yield* Effect.option(getApplicationStatusInfo(app.id));
							if (Option.isSome(statusInfo)) {
								return statusInfo.value;
							}
							// Если не удалось загрузить статус, создаем базовую информацию
							return {
								application: app,
								status: 'nothing' as const,
								operations: []
							};
						})
					)
				);
				return statusInfos.filter((info): info is ApplicationStatusInfo => info !== null);
			})
		).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка загрузки заявок';
			isLoading = false;
			return null;
		});

		if (result) {
			applicationsStatusInfo = result;
			// Сортируем по дате загрузки (сверху самая поздняя)
			applicationsStatusInfo.sort(
				(a, b) => new Date(b.application.uploadDate).getTime() - new Date(a.application.uploadDate).getTime()
			);
		}
		isLoading = false;
	}

	function handleUpload(event: CustomEvent<{ file: File }>) {
		const file = event.detail.file;
		uploadFile(file);
	}

	async function uploadFile(file: File) {
		isLoading = true;
		error = null;
		const newApplication = await Effect.runPromise(uploadApplication(file)).catch((err) => {
			error = err instanceof Error ? err.message : 'Ошибка загрузки файла';
			isLoading = false;
			return null;
		});

		if (!newApplication) {
			return;
		}

		// Обновляем список заявок
		await loadApplications();
		// Находим загруженную заявку в списке
		const uploadedStatusInfo = applicationsStatusInfo.find(
			(info) => info.application.id === newApplication.id
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

	function getStatusType(status: ApplicationStatusInfo['status']): 'gray' | 'blue' | 'green' | 'red' {
		switch (status) {
			case 'completed':
				return 'green';
			case 'failed':
				return 'red';
			case 'processing':
				return 'blue';
			case 'nothing':
			default:
				return 'gray';
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

	<div class="list-content">
		{#if isLoading}
			<div class="loading-container">
				<Loading description="Загрузка заявок..." />
			</div>
		{:else if applicationsStatusInfo.length === 0}
			<EmptyState message="Нет загруженных заявок" />
		{:else}
			<div class="applications">
				{#each applicationsStatusInfo as statusInfo (statusInfo.application.id)}
					<div
						class="application-item"
						class:selected={selectedId === statusInfo.application.id}
					>
						<ClickableTile
							on:click={() => selectApplication(statusInfo.application.id)}
						>
							<div class="application-name">{statusInfo.application.originalFilename}</div>
							<div class="application-meta">
								<span class="date">{formatDate(statusInfo.application.uploadDate)}</span>
								<Tag type={getStatusType(statusInfo.status)} size="sm">
									{getStatusText(statusInfo.status)}
								</Tag>
							</div>
						</ClickableTile>
					</div>
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
		background: var(--cds-layer);
		border-right: 1px solid var(--cds-border-subtle);
	}

	.header {
		padding: 1rem;
		border-bottom: 1px solid var(--cds-border-subtle);
	}

	.header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--cds-text-primary);
	}

	.upload-section {
		padding: 1rem;
		border-bottom: 1px solid var(--cds-border-subtle);
	}

	.error-section {
		padding: 1rem;
	}

	.list-content {
		flex: 1;
		overflow-y: auto;
	}

	.loading-container {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 2rem;
	}

	.applications {
		display: flex;
		flex-direction: column;
	}

	.application-item {
		border-bottom: 1px solid var(--cds-border-subtle);
	}

	.application-item.selected {
		background: var(--cds-layer-selected);
		border-left: 3px solid var(--cds-link-primary);
	}

	:global(.application-item .bx--tile--clickable) {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 1rem;
		text-align: left;
		width: 100%;
	}

	.application-name {
		font-weight: 500;
		color: var(--cds-text-primary);
		margin-bottom: 0.5rem;
		word-break: break-word;
		width: 100%;
	}

	.application-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		font-size: 0.875rem;
		gap: 0.5rem;
	}

	.date {
		color: var(--cds-text-secondary);
	}
</style>
