<script lang="ts">
	import { Accordion } from "bits-ui";
	import { cn } from "$lib/utils/cn";
	import type { Snippet } from "svelte";

	interface $$Props extends Accordion.RootProps {
		children?: Snippet;
		// Explicitly include collapsible and type for TypeScript
		collapsible?: boolean;
		type?: "single" | "multiple";
	}

	let {
		type = "single",
		collapsible = false,
		children,
		...restProps
	}: $$Props = $props();
</script>

<Accordion.Root type={type} collapsible={collapsible} {...restProps}>
	{@render children?.()}
</Accordion.Root>

