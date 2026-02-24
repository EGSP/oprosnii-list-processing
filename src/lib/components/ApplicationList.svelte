<script lang="ts">
	import { onMount } from 'svelte';

	import type { Application } from '$lib/business/types.js';
	import FileUpload from './FileUpload.svelte';
	import { Effect } from 'effect';

	import { Applications } from '$lib/api/rest';
	import type { CreateApplicationResponse } from '$lib/api/types';
	import Button from './ui/button.svelte';
	import ApplicationBadge from './objects/ApplicationBadge.svelte';

	let {
		select,
		upload
	}: {
		select: (application: Application) => void;
		upload: (application: Application) => void;
	} = $props();

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

	<div class="px-1 py-1 border-b border-border overflow-x-auto">
		{#each applications as application}
			<ApplicationBadge {application} select={select} format="small" />
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
