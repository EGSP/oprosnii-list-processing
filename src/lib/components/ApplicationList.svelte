<script lang="ts">
	import { onMount } from 'svelte';

	import type { Application } from '$lib/business/types.js';
	import FileUpload from './FileUpload.svelte';
	import { Effect } from 'effect';

	import { Applications } from '$lib/api/rest';
	import type { CreateApplicationResponse } from '$lib/api/types';
	import Button from './ui/button.svelte';

	let { select, upload } = $props<{
		select: (application: Application) => void;
		upload: (application: Application) => void;
	}>();

	let selectedApplicationId: string | undefined = $state(undefined);
	let isLoadingApplications = $state(false);
	let errors: string[] | undefined = $state(undefined);

	let applications: Application[] = $state([]);

	onMount(() => {
		loadApplications();
	});

	async function loadApplications() {
		applications = await Effect.runPromise(
			Effect.gen(function* () {
				const applications = yield* Applications.get({ options: { simplify: true } });

				return applications.sort(
					(a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
				);
			})
		);
	}

	async function uploadApplicationFile(file: File) {
		const newApplication: CreateApplicationResponse = await Effect.runPromise(
			Applications.upload(file)
		);
		if (!newApplication) {
			console.log(newApplication);
			return;
		}

		loadApplications();
	}
</script>

<div class="application-list">
	<div class="px-1 py-1 border-b border-border">
		<h2 class="m-0 text-base font-semibold text-foreground">Заявки</h2>
		<Button onclick={loadApplications}>Загрузить заявки</Button>
	</div>

	<div class="px-1 py-1 border-b border-border">
		<FileUpload upload={uploadApplicationFile} />
	</div>

	<div class="px-1 py-1 border-b border-border">
		{#each applications as application}
			<div class="application-item">
				<div class="application-item-name">{application.originalFilename}</div>
				<div class="application-item-date">{application.uploadDate}</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.application-list {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background));
	}
</style>
