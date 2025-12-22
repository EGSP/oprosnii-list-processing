<script lang="ts">
	import * as AccordionPrimitive from "bits-ui";
	import { cn } from "$lib/utils/cn";
	import { ChevronDown } from "lucide-svelte";

	interface $$Props extends AccordionPrimitive.TriggerProps {
		class?: string;
	}

	let {
		class: className = "",
		...restProps
	}: $$Props = $props();
</script>

<AccordionPrimitive.Header>
	<AccordionPrimitive.Trigger
		class={cn(
			"flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
			className
		)}
		{...restProps}
	>
		<slot />
		<ChevronDown class="h-4 w-4 shrink-0 transition-transform duration-200" />
	</AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>

