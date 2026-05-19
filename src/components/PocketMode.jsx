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

    // Front-camera darkness detection fallback
    async function startCameraFallback() {
      if (cameraStream) return; // already running
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 16, height: 16 },
          audio: false,
        });
        cameraStream = stream;

        const video = document.createElement("video");
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        video.style.display = "none";
        document.body.appendChild(video);
        await video.play();

        const canvas = document.createElement("canvas");
        canvas.width = 16; canvas.height = 16;
        const ctx = canvas.getContext("2d");

        // Darkness threshold — covered lens = very dark
        const DARK_THRESHOLD = 12;
        let darkFrames = 0;
        let lightFrames = 0;

        cameraInterval = setInterval(() => {
          if (!cameraStream) return;
          ctx.drawImage(video, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          let total = 0;
          for (let i = 0; i < data.length; i += 4) {
            total += (data[i] + data[i + 1] + data[i + 2]) / 3;
          }
          const avg = total / (16 * 16);

          if (avg < DARK_THRESHOLD) {
            darkFrames++;
            lightFrames = 0;
            if (darkFrames >= 3) activate();
          } else {
            lightFrames++;
            darkFrames = 0;
            if (lightFrames >= 3) deactivate();
          }
        }, 300);

        cleanupFns.push(() => {
          stopCamera();
          video.remove();
        });
      } catch (_) {
        // Camera not available or permission denied — silently skip
      }
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
          proximitySensor = new window.ProximitySensor({ frequency: 5 });
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