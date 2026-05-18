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

    // ── Proximity Sensor ──────────────────────────────────────────────────────
    let proximitySensor = null;
    const cleanupFns = [];

    async function startProximitySensor() {
      // Modern Generic Sensor API (Android Chrome)
      if ("ProximitySensor" in window) {
        try {
          // Request permission if needed
          if (navigator.permissions) {
            try {
              const perm = await navigator.permissions.query({ name: "proximity" });
              if (perm.state === "denied") return;
            } catch (_) {
              // permission query may not support 'proximity' — continue anyway
            }
          }
          proximitySensor = new window.ProximitySensor({ frequency: 5 });
          proximitySensor.addEventListener("reading", () => {
            proximitySensor.near ? activate() : deactivate();
          });
          proximitySensor.addEventListener("error", () => {
            proximitySensor = null;
          });
          proximitySensor.start();
          cleanupFns.push(() => { try { proximitySensor.stop(); } catch (_) {} });
          return; // success — don't fall through to legacy events
        } catch (_) {
          proximitySensor = null;
        }
      }

      // Legacy events (Firefox on Android, older browsers)
      const handleLegacy = (e) => {
        const near = e.near === true || (typeof e.value === "number" && e.value < 5);
        near ? activate() : deactivate();
      };
      window.addEventListener("deviceproximity", handleLegacy);
      window.addEventListener("userproximity", handleLegacy);
      cleanupFns.push(() => {
        window.removeEventListener("deviceproximity", handleLegacy);
        window.removeEventListener("userproximity", handleLegacy);
      });
    }

    startProximitySensor();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cleanupFns.forEach(fn => fn());
      overlay.remove();
    };
  }, []);

  return null;
}