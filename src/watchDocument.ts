import { basename, dirname } from "@tauri-apps/api/path";
import { readTextFile, watchImmediate } from "@tauri-apps/plugin-fs";

// Observe the directory so replacing the file by rename keeps the watch alive.
export function watchDocument(
  path: string,
  initialText: string,
  changed: (text: string, active: () => boolean) => Promise<void>,
): () => void {
  let closed = false;
  let busy = false;
  let pending = false;
  let lastSeen = initialText;
  let unwatch: (() => void) | undefined;

  const check = async () => {
    pending = true;
    if (busy || closed) return;
    busy = true;
    try {
      while (pending && !closed) {
        pending = false;
        // A replace-by-rename may briefly remove the file. Its create event retries.
        const fresh = await readTextFile(path).catch(() => null);
        if (closed || fresh === null || fresh === lastSeen) continue;
        lastSeen = fresh;
        await changed(fresh, () => !closed);
      }
    } finally {
      busy = false;
    }
  };

  (async () => {
    const [directory, name] = await Promise.all([dirname(path), basename(path)]);
    if (closed) return;
    unwatch = await watchImmediate(directory, event => {
      if (typeof event.type === "object" && "access" in event.type) return;
      if (event.paths.some(p => p === directory || p.split(/[\\/]/).pop() === name)) {
        void check().catch(console.error);
      }
    });
    if (closed) unwatch();
    else await check();
  })().catch(console.error);

  return () => {
    closed = true;
    unwatch?.();
  };
}
