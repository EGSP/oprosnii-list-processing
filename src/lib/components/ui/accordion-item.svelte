<script lang="ts">
	import { setContext } from "svelte";
	import { cn } from "$lib/utils/cn";
	import type { Snippet } from "svelte";

	interface $$Props {
		value: string;
		class?: string;
		children?: Snippet;
	}

	let { value, class: className = "", children }: $$Props = $props();

	setContext("accordion-item", { value });
</script>

<div class={cn("border-b", className)}>
	{@render children?.()}
</div>
