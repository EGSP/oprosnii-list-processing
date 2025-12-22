<script lang="ts">
	import { Accordion } from "bits-ui";
	import { cn } from "$lib/utils/cn";
	import type { Snippet } from "svelte";

	interface $$Props extends Accordion.ItemProps {
		class?: string;
		children?: Snippet;
	}

	let {
		class: className = "",
		children,
		...restProps
	}: $$Props = $props();
</script>

<Accordion.Item
	class={cn("border-b", className)}
	{...restProps}
>
	{@render children?.()}
</Accordion.Item>

