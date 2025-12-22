<script lang="ts">
	import * as AccordionPrimitive from "bits-ui";
	import { cn } from "$lib/utils/cn";

	interface $$Props extends AccordionPrimitive.ItemProps {
		class?: string;
	}

	let {
		class: className = "",
		...restProps
	}: $$Props = $props();
</script>

<AccordionPrimitive.Item
	class={cn("border-b", className)}
	{...restProps}
>
	<slot />
</AccordionPrimitive.Item>

