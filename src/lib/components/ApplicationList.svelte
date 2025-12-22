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
	import Card from '$lib/components/ui/card.svelte';
	import Badge from '$lib/components/ui/badge.svelte';
	import Skeleton from '$lib/components/ui/skeleton.svelte';
	import Alert from '$lib/components/ui/alert.svelte';
	import AlertTitle from '$lib/components/ui/alert-title.svelte';
	import AlertDescription from '$lib/components/ui/alert-description.svelte';
	import { X } from 'lucide-svelte';

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
</script>

<div class="application-list">
	<div class="px-3 py-2 border-b border-border">
		<h2 class="m-0 text-base font-semibold text-foreground">Заявки</h2>
	</div>

	<div class="px-3 py-2 border-b border-border">
		<FileUpload on:upload={handleUpload} on:error={handleError} />
	</div>

	{#if error}
		<div class="px-3 py-2">
			<Alert variant="destructive">
				<AlertTitle>Ошибка</AlertTitle>
				<AlertDescription>
					<div class="flex items-center justify-between">
						<span>{error}</span>
						<button
							onclick={() => error = null}
							class="ml-4 rounded-none opacity-70 focus:outline-none focus:ring-2 focus:ring-ring"
							aria-label="Закрыть"
						>
							<X class="h-4 w-4" />
						</button>
					</div>
				</AlertDescription>
			</Alert>
		</div>
	{/if}

	<div class="flex-1 overflow-y-auto">
		{#if isLoading}
			<div class="flex justify-center items-center p-4">
				<div class="flex flex-col gap-2 w-full px-3">
					<Skeleton class="h-12 w-full" />
					<Skeleton class="h-12 w-full" />
					<Skeleton class="h-12 w-full" />
				</div>
			</div>
		{:else if applicationsStatusInfo.length === 0}
			<EmptyState message="Нет загруженных заявок" />
		{:else}
			<div class="flex flex-col">
				{#each applicationsStatusInfo as statusInfo (statusInfo.application.id)}
					<button
						type="button"
						class="application-item"
						class:selected={selectedId === statusInfo.application.id}
						onclick={() => selectApplication(statusInfo.application.id)}
					>
						<div class="flex flex-col items-start px-3 py-2 text-left w-full">
							<div class="font-medium text-sm text-foreground mb-1 break-words w-full">{statusInfo.application.originalFilename}</div>
							<div class="flex justify-between items-center w-full text-xs gap-2">
								<span class="text-muted-foreground">{formatDate(statusInfo.application.uploadDate)}</span>
								<Badge variant={getStatusVariant(statusInfo.status)}>
									{getStatusText(statusInfo.status)}
								</Badge>
							</div>
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
		background: hsl(var(--background));
	}

	.application-item {
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		cursor: pointer;
		padding: 0;
		margin: 0;
	}

	.application-item:hover {
		background: hsl(var(--accent));
	}

	.application-item.selected {
		background: hsl(var(--accent));
		border-left: 2px solid hsl(var(--primary));
	}
</style>
