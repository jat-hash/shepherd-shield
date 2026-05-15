import { useEffect } from "react";

export default function PocketMode() {
  useEffect(() => {
    if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) return;

    // ── Overlay ──────────────────────────────────────────────────────────────
    const overlay = document.createElement("div");
    overlay.id = "pocket-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0", left: "0",
      width: "100%", height: "100%",
      background: "black",
      opacity: "0",
      zIndex: "999999",
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "opacity 0.4s ease",
    });
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

    overlay.addEventListener("click", disablePocketMode);
    overlay.addEventListener("touchend", (e) => { e.preventDefault(); disablePocketMode(); });

    // ── Visibility API (screen off / backgrounded) ───────────────────────────
    const handleVisibility = () => {
      if (document.hidden) enablePocketMode();
      else setTimeout(disablePocketMode, 500);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // ── Proximity Sensor (most reliable for pocket detection) ────────────────
    // Firefox/Android supports deviceproximity; some browsers support ProximitySensor API
    let proximitySensor = null;

    const handleProximity = (e) => {
      // e.near = true means something is close (in pocket)
      // e.value in cm; max is device max range
      if (e.near || (e.value !== undefined && e.value < 5)) {
        enablePocketMode();
      } else {
        disablePocketMode();
      }
    };

    window.addEventListener("deviceproximity", handleProximity);
    window.addEventListener("userproximity", handleProximity);

    // Generic ProximitySensor API (Chrome on Android)
    if ("ProximitySensor" in window) {
      try {
        proximitySensor = new window.ProximitySensor();
        proximitySensor.addEventListener("reading", () => {
          if (proximitySensor.near) enablePocketMode();
          else disablePocketMode();
        });
        proximitySensor.start();
      } catch (_) { proximitySensor = null; }
    }

    // ── Camera brightness detection (fallback) ───────────────────────────────
    let videoStream = null;
    let videoEl = null;
    let sampleInterval = null;
    let darkCount = 0;
    let brightCount = 0;
    // Very aggressive threshold — a covered camera in a dark pocket reads ~0-5
    // A camera in normal room light reads 80-200+
    const DARK_THRESHOLD = 20;
    const BRIGHT_THRESHOLD = 30;
    const FRAMES_TO_ACTIVATE = 3;  // ~1.5s of darkness
    const FRAMES_TO_DEACTIVATE = 3;

    async function startCameraDetection() {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 8 },
            height: { ideal: 8 },
          },
          audio: false,
        });

        videoEl = document.createElement("video");
        videoEl.srcObject = videoStream;
        videoEl.setAttribute("playsinline", "true");
        videoEl.muted = true;
        Object.assign(videoEl.style, {
          position: "fixed",
          opacity: "0.01", // must be > 0 or browser may suspend it
          pointerEvents: "none",
          width: "1px",
          height: "1px",
          top: "-10px",
          left: "-10px",
        });
        document.body.appendChild(videoEl);

        // Wait for video to be ready
        await new Promise((resolve) => {
          videoEl.onloadedmetadata = resolve;
          videoEl.play().then(resolve).catch(resolve);
          setTimeout(resolve, 2000); // fallback timeout
        });

        const canvas = document.createElement("canvas");
        canvas.width = 8;
        canvas.height = 8;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        sampleInterval = setInterval(() => {
          if (!videoEl || videoEl.readyState < 2) return;
          try {
            ctx.drawImage(videoEl, 0, 0, 8, 8);
            const data = ctx.getImageData(0, 0, 8, 8).data;
            let sum = 0;
            const pixels = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
              sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
            }
            const avg = sum / pixels;

            if (avg < DARK_THRESHOLD) {
              brightCount = 0;
              darkCount++;
              if (darkCount >= FRAMES_TO_ACTIVATE) enablePocketMode();
            } else if (avg > BRIGHT_THRESHOLD) {
              darkCount = 0;
              brightCount++;
              if (brightCount >= FRAMES_TO_DEACTIVATE) disablePocketMode();
            }
          } catch (_) {}
        }, 500);
      } catch (_) {
        // No camera permission — silent fail, other sensors still work
      }
    }

    function stopCameraDetection() {
      if (sampleInterval) { clearInterval(sampleInterval); sampleInterval = null; }
      if (videoEl) { videoEl.remove(); videoEl = null; }
      if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    }

    startCameraDetection();

    // ── Ambient Light Sensor (where supported) ────────────────────────────────
    let lightSensor = null;
    let lightTimer = null;
    if ("AmbientLightSensor" in window) {
      try {
        lightSensor = new window.AmbientLightSensor({ frequency: 2 });
        lightSensor.addEventListener("reading", () => {
          if (lightSensor.illuminance < 3) {
            if (!lightTimer) lightTimer = setTimeout(() => enablePocketMode(), 800);
          } else {
            if (lightTimer) { clearTimeout(lightTimer); lightTimer = null; }
            if (lightSensor.illuminance > 10) disablePocketMode();
          }
        });
        lightSensor.start();
      } catch (_) { lightSensor = null; }
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("deviceproximity", handleProximity);
      window.removeEventListener("userproximity", handleProximity);
      if (proximitySensor) proximitySensor.stop();
      if (lightTimer) clearTimeout(lightTimer);
      if (lightSensor) lightSensor.stop();
      stopCameraDetection();
      overlay.remove();
    };
  }, []);

  return null;
}