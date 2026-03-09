import type { RequestHandler } from './$types';
import { ApplicationFiles } from '$lib/storage/files';
import { Effect } from 'effect';

const extensionToMime: Record<string, string> = {
	pdf: 'application/pdf',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png'
};

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	const response = await Effect.runPromise(
		Effect.gen(function* () {
			const path = yield* ApplicationFiles.path(id);
			const buffer = yield* ApplicationFiles.read(id);
			const fullBuffer = buffer.buffer as ArrayBuffer;
			const finalArrayBuffer = fullBuffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
			const ext = path.split('.').pop()?.toLowerCase() ?? '';
			const contentType = extensionToMime[ext] ?? 'application/octet-stream';

			return new Response(finalArrayBuffer, {
				status: 200,
				headers: {
					'Content-Type': contentType,
					'Content-Disposition': `inline; filename="${id}.${ext}"`
				}
			});
		})
	);

	return response;
};