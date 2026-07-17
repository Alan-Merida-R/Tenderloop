/**
 * save.worker.ts
 * Offloads the heavy JSON.stringify to a background thread,
 * completely freeing the main thread during autosave.
 */

self.onmessage = (e: MessageEvent) => {
  const { data } = e;
  try {
    // We intentionally skip the prettify (null, 2) here for performance.
    // The file is still valid, parseable JSON.
    const serialized = JSON.stringify(data);
    self.postMessage({ success: true, serialized });
  } catch (err: any) {
    self.postMessage({ success: false, error: err.message });
  }
};
