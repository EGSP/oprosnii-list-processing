<script lang="ts">
	import * as AccordionPrimitive from "bits-ui";
	import { cn } from "$lib/utils/cn";

	const {
		type = "single",
		collapsible = false,
		...restProps
	}: AccordionPrimitive.RootProps = $props();

	let root: AccordionPrimitive.AccordionRoot;
</script>

<AccordionPrimitive.Root bind:root type={type} collapsible={collapsible} {...restProps}>
	<slot />
</AccordionPrimitive.Root>

