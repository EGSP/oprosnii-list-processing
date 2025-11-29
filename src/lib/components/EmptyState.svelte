<script lang="ts">
	export let message: string;
	export let icon: string | undefined = undefined;
</script>

<div class="empty-state">
	{#if icon}
		<div class="icon">{icon}</div>
	{/if}
	<p class="message">{message}</p>
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.message {
		font-size: 1rem;
		margin: 0;
	}
</style>
