<script lang="ts">
	import ApplicationList from '$lib/components/ApplicationList.svelte';
	import ApplicationDetails from '$lib/components/ApplicationDetails.svelte';
	import type { Application } from '$lib/business/types.js';

	let selectedApplication: Application | null = null;

	function handleSelect(event: CustomEvent<{ application: Application }>) {
		selectedApplication = event.detail.application;
	}

	function handleUpload(event: CustomEvent<{ application: Application }>) {
		selectedApplication = event.detail.application;
	}
</script>

<div class="main-layout">
	<div class="left-panel">
		<ApplicationList on:select={handleSelect} on:upload={handleUpload} />
	</div>
	<div class="right-panel">
		<ApplicationDetails applicationId={selectedApplication?.id || null} />
	</div>
</div>

<style>
	.main-layout {
		display: flex;
		height: 100vh;
		overflow: hidden;
		background: var(--cds-background);
	}

	.left-panel {
		width: 21.875rem;
		min-width: 18.75rem;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--cds-border-subtle);
	}

	.right-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	@media (max-width: 48rem) {
		.main-layout {
			flex-direction: column;
		}

		.left-panel {
			width: 100%;
			height: 40vh;
			border-right: none;
			border-bottom: 1px solid var(--cds-border-subtle);
		}

		.right-panel {
			height: 60vh;
		}
	}
</style>
