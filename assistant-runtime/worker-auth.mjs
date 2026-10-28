// A dedicated header preserves worker identity through reverse proxies that
// reserve or rewrite Authorization. The same private credential is required.
export function workerCredential(request) {
  return request.headers.get('x-tianyan-worker-token') ||
    (request.headers.get('authorization') || '').replace(/^Bearer /, '');
}
