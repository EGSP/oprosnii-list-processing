<script lang="ts">
	import { Tile } from 'carbon-components-svelte';
	import { DocumentBlank } from 'carbon-icons-svelte';
	
	export let message: string;
	export let icon: string | undefined = undefined;
</script>

<div class="empty-state">
	<Tile>
		<div class="empty-state-content">
			{#if icon}
				<div class="icon">
					<DocumentBlank size={32} />
				</div>
			{/if}
			<p class="message">{message}</p>
		</div>
	</Tile>
</div>

<style>
	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 12.5rem;
	}

	.empty-state-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 1rem;
	}

	.icon {
		opacity: 0.5;
		color: var(--cds-text-secondary);
	}

	.message {
		margin: 0;
		color: var(--cds-text-secondary);
	}
</style>
