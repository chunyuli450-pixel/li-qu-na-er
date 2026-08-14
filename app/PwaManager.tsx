"use client";

import { useEffect, useRef, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaManager() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadRequestedRef = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    let disposed = false;
    let updateTimer = 0;
    let registration: ServiceWorkerRegistration | null = null;

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      worker?.addEventListener("statechange", () => {
        if (!disposed && worker.state === "installed" && navigator.serviceWorker.controller) {
          setUpdateAvailable(true);
        }
      });
    };

    const checkForUpdate = () => registration?.update().catch(() => undefined);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    const handleControllerChange = () => {
      if (!reloadRequestedRef.current) return;
      reloadRequestedRef.current = false;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    const appScope = new URL("./", document.baseURI);

    navigator.serviceWorker.register(new URL("sw.js", appScope).href, { scope: appScope.pathname }).then((current) => {
      if (disposed) return;
      registration = current;
      registrationRef.current = current;
      if (current.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
      current.addEventListener("updatefound", () => watchInstallingWorker(current.installing));
      window.addEventListener("focus", checkForUpdate);
      document.addEventListener("visibilitychange", handleVisibility);
      updateTimer = window.setInterval(checkForUpdate, 60 * 60 * 1000);
    }).catch(() => undefined);

    return () => {
      disposed = true;
      registrationRef.current = null;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(updateTimer);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const applyUpdate = () => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    reloadRequestedRef.current = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <>
      {!online && (
        <div className="pwa-offline-banner" role="status">
          <b>当前处于离线模式</b>
          <span>本地行程仍可查看和编辑；地图、地点搜索与路线查询需要联网。</span>
        </div>
      )}

      {installPrompt && !updateAvailable && (
        <button className="pwa-install-button" onClick={installApp} aria-label="安装李去哪儿到当前设备">
          <span>李</span>
          <b>安装到设备</b>
        </button>
      )}

      {updateAvailable && (
        <section className="pwa-update-card" role="status" aria-live="polite">
          <div>
            <b>发现新版本</b>
            <span>更新前会保留设备中的本地行程。</span>
          </div>
          <button className="pwa-update-later" onClick={() => setUpdateAvailable(false)}>稍后</button>
          <button className="pwa-update-now" onClick={applyUpdate}>立即更新</button>
        </section>
      )}
    </>
  );
}
