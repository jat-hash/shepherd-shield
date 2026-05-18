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
    const handleProximityEvent = (e) => {
      const near = e.near === true || (typeof e.value === "number" && e.value < 5);
      near ? activate() : deactivate();
    };
    window.addEventListener("deviceproximity", handleProximityEvent);
    window.addEventListener("userproximity", handleProximityEvent);

    let proximitySensor = null;
    if ("ProximitySensor" in window) {
      try {
        proximitySensor = new window.ProximitySensor();
        proximitySensor.addEventListener("reading", () => {
          proximitySensor.near ? activate() : deactivate();
        });
        proximitySensor.start();
      } catch (_) { proximitySensor = null; }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener("deviceproximity", handleProximityEvent);
      window.removeEventListener("userproximity", handleProximityEvent);
      if (proximitySensor) { try { proximitySensor.stop(); } catch (_) {} }
      overlay.remove();
    };
  }, []);

  return null;
}