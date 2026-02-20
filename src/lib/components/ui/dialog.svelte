<script lang="ts">
	import { setContext } from "svelte";
	import type { Snippet } from "svelte";

	let {
		open = $bindable(false),
		children,
	}: {
		open?: boolean;
		children?: Snippet;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();

	function close() {
		open = false;
		dialogEl?.close();
	}

	const titleId = "dialog-title-" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
	const descriptionId = "dialog-description-" + (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

	setContext("dialog", { close, titleId, descriptionId });

	$effect(() => {
		if (!dialogEl) return;
		if (open) {
			dialogEl.showModal();
		} else {
			dialogEl.close();
		}
	});

	function handleClose() {
		open = false;
	}
</script>

<dialog
	bind:this={dialogEl}
	aria-labelledby={titleId}
	aria-describedby={descriptionId}
	onclose={handleClose}
	onclick={(e) => {
		if (e.target === dialogEl) close();
	}}
	class="fixed inset-0 z-50 h-full w-full max-w-none border-none bg-transparent p-0 backdrop:bg-black/80"
>
	{@render children?.()}
</dialog>
