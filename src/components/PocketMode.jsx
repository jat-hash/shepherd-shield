import { useEffect } from "react";

export default function PocketMode() {
  useEffect(() => {
    if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return;

    // ── Overlay ───────────────────────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "pocket-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0", left: "0",
      width: "100%", height: "100%",
      background: "black",
      opacity: "0",
      zIndex: "99998",
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "opacity 0.3s ease",
    });
    const label = document.createElement("div");
    Object.assign(label.style, {
      color: "rgba(255,255,255,0.35)",
      fontSize: "14px",
      fontFamily: "sans-serif",
      userSelect: "none",
      pointerEvents: "none",
    });
    label.textContent = "Tap to unlock";
    overlay.appendChild(label);
    document.body.appendChild(overlay);

    let pocketActive = false;
    let manualUnlockUntil = 0;

    function activate() {
      if (pocketActive || Date.now() < manualUnlockUntil) return;
      pocketActive = true;
      overlay.style.opacity = "1";
      overlay.style.pointerEvents = "all";
    }

    function deactivate() {
      if (!pocketActive) return;
      pocketActive = false;
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
    }

    function manualUnlock() {
      manualUnlockUntil = Date.now() + 3000;
      deactivate();
    }

    overlay.addEventListener("click", manualUnlock);
    overlay.addEventListener("touchend", (e) => { e.preventDefault(); manualUnlock(); });

    // ── Proximity Sensor (preferred — no camera needed) ───────────────────────
    let proximitySensor = null;
    let cameraStream = null;
    let cameraInterval = null;
    let proximityWorking = false;

    const cleanupFns = [];

    function stopCamera() {
      if (cameraInterval) { clearInterval(cameraInterval); cameraInterval = null; }
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
      }
    }

    // Camera fallback intentionally disabled — no camera permission requests
    async function startCameraFallback() {
      // Do nothing: only hardware proximity sensor is used
    }

    async function startProximitySensor() {
      // Modern Generic Sensor API (Android Chrome)
      if ("ProximitySensor" in window) {
        try {
          if (navigator.permissions) {
            try {
              const perm = await navigator.permissions.query({ name: "proximity" });
              if (perm.state === "denied") {
                await startCameraFallback();
                return;
              }
            } catch (_) {}
          }
          proximitySensor = new window.ProximitySensor({ frequency: 2 });
          proximitySensor.addEventListener("reading", () => {
            proximityWorking = true;
            // Stop camera if proximity sensor kicked in — no need to run both
            stopCamera();
            proximitySensor.near ? activate() : deactivate();
          });
          proximitySensor.addEventListener("error", async () => {
            proximitySensor = null;
            if (!proximityWorking) await startCameraFallback();
          });
          proximitySensor.start();
          cleanupFns.push(() => { try { proximitySensor.stop(); } catch (_) {} });

          // Give the sensor 2s to prove it works, otherwise fall back to camera
          setTimeout(async () => {
            if (!proximityWorking) await startCameraFallback();
          }, 2000);
          return;
        } catch (_) {
          proximitySensor = null;
        }
      }

      // Legacy proximity events (Firefox on Android)
      let legacyWorked = false;
      const handleLegacy = (e) => {
        legacyWorked = true;
        stopCamera(); // stop camera if legacy sensor fires
        const near = e.near === true || (typeof e.value === "number" && e.value < 5);
        near ? activate() : deactivate();
      };
      window.addEventListener("deviceproximity", handleLegacy);
      window.addEventListener("userproximity", handleLegacy);
      cleanupFns.push(() => {
        window.removeEventListener("deviceproximity", handleLegacy);
        window.removeEventListener("userproximity", handleLegacy);
      });

      // If legacy events never fire, fall back to camera
      setTimeout(async () => {
        if (!legacyWorked) await startCameraFallback();
      }, 2000);
    }

    startProximitySensor();

    return () => {
      cleanupFns.forEach(fn => fn());
      stopCamera();
      overlay.remove();
    };
  }, []);

  return null;
}