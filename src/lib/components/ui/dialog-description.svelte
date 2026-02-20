<script lang="ts">
	import { getContext } from "svelte";
	import { cn } from "$lib/utils/cn";
	import type { Snippet } from "svelte";

	interface $$Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className = "", children }: $$Props = $props();

	const { descriptionId } = getContext<{ descriptionId: string }>("dialog");
</script>

<p id={descriptionId} class={cn("text-sm text-muted-foreground", className)}>
	{@render children?.()}
</p>
