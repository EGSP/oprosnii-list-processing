<script lang="ts">
	import { getContext } from "svelte";
	import { cn } from "$lib/utils/cn";
	import { ChevronDown } from "lucide-svelte";
	import type { Snippet } from "svelte";

	interface $$Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className = "", children }: $$Props = $props();

	const accordion = getContext<{
		openValues: import("svelte/store").Writable<string[]>;
		toggle: (value: string) => void;
	}>("accordion");
	const { value } = getContext<{ value: string }>("accordion-item");
	const openValues = accordion.openValues;

	const isOpen = $derived($openValues.includes(value));
</script>

<button
	type="button"
	onclick={() => accordion.toggle(value)}
	class={cn(
		"flex flex-1 items-center justify-between py-4 font-medium [&>svg]:transition-transform",
		isOpen && "[&>svg]:rotate-180",
		className
	)}
>
	{@render children?.()}
	<ChevronDown class="h-4 w-4 shrink-0" />
</button>
