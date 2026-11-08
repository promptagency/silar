// Registers the offline service worker (src/sw/sw.ts). Copied from Skrubba's
// src/ui/serviceWorker.ts, without its controller wait.
import { SKIP_WAITING } from "../sw/core.ts";

declare const __SW_KILL__: boolean;

/** Production only; the app works the same without a service worker. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || __SW_KILL__) return;
  navigator.serviceWorker.register("/sw.js").then(retryWaitingActivation, () => {
    /* blocked or unsupported: just no offline use */
  });
}

/**
 * A new build calls skipWaiting() when installed, but Chromium can drop that
 * handover: it stops the old worker, a request from the page starts it again,
 * and the new build then waits until every tab is closed. While a build is
 * still waiting, ask it again every second; the ask can be dropped the same way.
 */
export function retryWaitingActivation(reg: ServiceWorkerRegistration): void {
  const retryWhileWaiting = (worker: ServiceWorker) => {
    const timer = setInterval(() => {
      if (reg.waiting === worker) worker.postMessage(SKIP_WAITING);
      else clearInterval(timer);
    }, 1000);
  };
  const watch = (worker: ServiceWorker | null) => {
    if (!worker) return;
    if (worker.state === "installed") retryWhileWaiting(worker);
    else if (worker.state === "installing") {
      const onChange = () => {
        if (worker.state === "installing") return;
        worker.removeEventListener("statechange", onChange);
        if (worker.state === "installed") retryWhileWaiting(worker);
      };
      worker.addEventListener("statechange", onChange);
    }
  };
  watch(reg.waiting);
  watch(reg.installing);
  reg.addEventListener("updatefound", () => watch(reg.installing));
}
