<script lang="ts">
	import type { Application } from '$lib/business/types';

	type Format = 'small';

	let {
		application,
		select,
		format = 'small'
	}: {
		application: Application;
		select: (application: Application) => void;
		format?: Format;
	} = $props();
</script>

<div
	onclick={() => {
		console.log(`click ${application.originalFilename}`);
		select(application);
	}}
	class="gap-0.5 p-1 border border-border rounded-none application-badge {format}"
>
	<p>{application.originalFilename}</p>
	<p>{application.uploadDate}</p>
</div>

<style>
	.application-badge.small {
		flex-direction: row;
		gap: 0.5rem;
	}
	.application-badge:hover {
		cursor: pointer;
		background: hsl(var(--accent));
	}
</style>
