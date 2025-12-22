<script lang="ts">
	import * as AccordionPrimitive from "bits-ui";
	import { cn } from "$lib/utils/cn";

	interface $$Props extends AccordionPrimitive.ContentProps {
		class?: string;
	}

	let {
		class: className = "",
		...restProps
	}: $$Props = $props();
</script>

<AccordionPrimitive.Content
	transition
	class={cn(
		"overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
		className
	)}
	{...restProps}
>
	<div class="pb-4 pt-0">
		<slot />
	</div>
</AccordionPrimitive.Content>

