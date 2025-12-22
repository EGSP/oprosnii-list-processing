<script lang="ts">
	import * as DialogPrimitive from "bits-ui";

	const {
		open = $bindable(false),
		modal = true,
		...restProps
	}: DialogPrimitive.DialogRootProps = $props();

	let root: DialogPrimitive.DialogRoot;
</script>

<DialogPrimitive.Root bind:open bind:root {modal} {...restProps}>
	<slot />
</DialogPrimitive.Root>

