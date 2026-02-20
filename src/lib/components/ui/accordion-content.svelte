<script lang="ts">
	import { getContext } from "svelte";
	import { cn } from "$lib/utils/cn";
	import type { Snippet } from "svelte";

	interface $$Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className = "", children }: $$Props = $props();

	const accordion = getContext<{
		openValues: import("svelte/store").Writable<string[]>;
	}>("accordion");
	const { value } = getContext<{ value: string }>("accordion-item");
	const openValues = accordion.openValues;

	const isOpen = $derived($openValues.includes(value));
</script>

{#if isOpen}
	<div
		class={cn("overflow-hidden text-sm", className)}
	>
		<div class="pb-4 pt-0">
			{@render children?.()}
		</div>
	</div>
{/if}
