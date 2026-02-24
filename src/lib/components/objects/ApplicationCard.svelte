<script lang="ts">
    import type { Application } from '$lib/business/types';

    let {application}: {application: Application | null} = $props();

    $effect(() => {
        console.log(`application details: ${application?.originalFilename}`);
    });

</script>

<div class="application-card">
    <p>{application?.id}</p>
    <p>{application?.originalFilename}</p>
    <p>{application?.uploadDate}</p>
</div>

<style>
    .application-card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.5rem;
        border: 1px solid hsl(var(--border));
        border-radius: 0.5rem;
    }
</style>