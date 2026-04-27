import { useEffect } from "react";

export default function PocketMode() {
  useEffect(() => {
    // Only run on mobile devices
    if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return;

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
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "opacity 0.5s ease",
    });

    // Tap to dismiss label
    const label = document.createElement("div");
    Object.assign(label.style, {
      color: "rgba(255,255,255,0.3)",
      fontSize: "14px",
      fontFamily: "sans-serif",
      userSelect: "none",
    });
    label.textContent = "Tap to unlock";
    overlay.appendChild(label);
    document.body.appendChild(overlay);

    let pocketActive = false;
    let activateTimer = null;
    let lockedByUser = false;

    function enablePocketMode() {
      if (pocketActive) return;
      pocketActive = true;
      lockedByUser = false;
      overlay.style.opacity = "1";
      overlay.style.pointerEvents = "all";
    }

    function disablePocketMode() {
      if (!pocketActive) return;
      pocketActive = false;
      lockedByUser = false;
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
    }

    // Tap to unlock
    overlay.addEventListener("click", disablePocketMode);
    overlay.addEventListener("touchend", (e) => {
      e.preventDefault();
      disablePocketMode();
    });

    // --- Visibility API: when tab hidden (screen off or app backgrounded) ---
    const handleVisibility = () => {
      if (document.hidden) {
        enablePocketMode();
      } else {
        // Small delay before unlocking to avoid flicker on quick screen-on
        setTimeout(disablePocketMode, 500);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // --- Device orientation: face-down detection ---
    // gamma = left/right tilt, beta = front/back tilt
    // When face-down: |beta| approaches 180 (or near -180)
    const handleOrientation = (e) => {
      if (lockedByUser) return;

      // Face down: beta close to ±180
      const beta = e.beta ?? 0;
      const isFaceDown = Math.abs(beta) > 150;

      if (isFaceDown) {
        if (!activateTimer) {
          activateTimer = setTimeout(() => {
            enablePocketMode();
          }, 1000); // 1 second sustained face-down
        }
      } else {
        if (activateTimer) {
          clearTimeout(activateTimer);
          activateTimer = null;
        }
        // Only auto-dismiss if not manually locked
        if (!lockedByUser) {
          disablePocketMode();
        }
      }
    };

    // Request orientation permission on iOS 13+
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then((state) => {
          if (state === "granted") {
            window.addEventListener("deviceorientation", handleOrientation);
          }
        })
        .catch(() => {});
    } else {
      window.addEventListener("deviceorientation", handleOrientation);
    }

    // --- Ambient Light Sensor: detects when camera/light sensor is covered ---
    let lightSensor = null;
    let lightTimer = null;
    if ("AmbientLightSensor" in window) {
      try {
        lightSensor = new window.AmbientLightSensor({ frequency: 2 });
        lightSensor.addEventListener("reading", () => {
          // illuminance in lux — pocket/covered is typically < 5 lux
          if (lightSensor.illuminance < 5) {
            if (!lightTimer) {
              lightTimer = setTimeout(() => enablePocketMode(), 800);
            }
          } else {
            if (lightTimer) {
              clearTimeout(lightTimer);
              lightTimer = null;
            }
            disablePocketMode();
          }
        });
        lightSensor.start();
      } catch (e) {
        lightSensor = null;
      }
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("deviceorientation", handleOrientation);
      if (activateTimer) clearTimeout(activateTimer);
      if (lightTimer) clearTimeout(lightTimer);
      if (lightSensor) lightSensor.stop();
      overlay.remove();
    };
  }, []);

  return null;
}