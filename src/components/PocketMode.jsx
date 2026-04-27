import { useEffect } from "react";

export default function PocketMode() {
  useEffect(() => {
    const overlay = document.createElement("div");
    overlay.id = "pocket-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "black",
      opacity: "0",
      zIndex: "999999",
      pointerEvents: "none",
      transition: "opacity 0.3s ease",
    });
    document.body.appendChild(overlay);

    let pocketActive = false;

    function enablePocketMode() {
      if (pocketActive) return;
      pocketActive = true;
      overlay.style.opacity = "1";
      overlay.style.pointerEvents = "all";
    }

    function disablePocketMode() {
      if (!pocketActive) return;
      pocketActive = false;
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
    }

    // --- Modern Proximity Sensor API ---
    let proximitySensor = null;
    if ("ProximitySensor" in window) {
      try {
        proximitySensor = new window.ProximitySensor({ frequency: 5 });
        proximitySensor.addEventListener("reading", () => {
          if (proximitySensor.near) enablePocketMode();
          else disablePocketMode();
        });
        proximitySensor.start();
      } catch (e) {
        proximitySensor = null;
      }
    }

    // --- Legacy deviceproximity (Firefox) ---
    const handleLegacyProximity = (e) => {
      if (e.near || e.value < 5) enablePocketMode();
      else disablePocketMode();
    };
    window.addEventListener("deviceproximity", handleLegacyProximity);
    window.addEventListener("userproximity", handleLegacyProximity);

    // --- Face-down orientation fallback ---
    // beta ~180 or ~-180 = face down. Use absolute value approach.
    let orientationTimer = null;
    const handleOrientation = (e) => {
      // Only use orientation if no proximity sensor available
      if (proximitySensor) return;
      const faceDown = Math.abs(e.beta) > 150;
      if (faceDown) {
        // Require sustained face-down for 1.5s to avoid false positives
        if (!orientationTimer) {
          orientationTimer = setTimeout(() => enablePocketMode(), 1500);
        }
      } else {
        if (orientationTimer) {
          clearTimeout(orientationTimer);
          orientationTimer = null;
        }
        disablePocketMode();
      }
    };
    window.addEventListener("deviceorientation", handleOrientation);

    // --- Tap anywhere on overlay to dismiss ---
    overlay.addEventListener("click", disablePocketMode);

    return () => {
      if (proximitySensor) proximitySensor.stop();
      window.removeEventListener("deviceproximity", handleLegacyProximity);
      window.removeEventListener("userproximity", handleLegacyProximity);
      window.removeEventListener("deviceorientation", handleOrientation);
      if (orientationTimer) clearTimeout(orientationTimer);
      overlay.remove();
    };
  }, []);

  return null;
}