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

    // ── Camera brightness detection ──────────────────────────────────────────
    // Grab a rear-camera stream, sample a frame every 500ms, compute average brightness.
    // If brightness < threshold for 1 second → pocket mode on.
    let videoStream = null;
    let videoEl = null;
    let canvasEl = null;
    let sampleInterval = null;
    let darkFrameCount = 0;
    const DARK_THRESHOLD = 15;   // avg pixel brightness 0-255; covered camera ≈ 0-10
    const FRAMES_TO_ACTIVATE = 2; // consecutive dark frames before activating (~1s)
    const FRAMES_TO_DEACTIVATE = 2; // consecutive bright frames before deactivating

    let brightFrameCount = 0;

    async function startCameraDetection() {
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: 16, height: 16 },
          audio: false,
        });

        videoEl = document.createElement("video");
        videoEl.srcObject = videoStream;
        videoEl.setAttribute("playsinline", "true");
        videoEl.setAttribute("muted", "true");
        videoEl.muted = true;
        Object.assign(videoEl.style, { position: "absolute", opacity: "0", pointerEvents: "none", width: "1px", height: "1px" });
        document.body.appendChild(videoEl);
        await videoEl.play();

        canvasEl = document.createElement("canvas");
        canvasEl.width = 16;
        canvasEl.height = 16;
        const ctx = canvasEl.getContext("2d", { willReadFrequently: true });

        sampleInterval = setInterval(() => {
          if (!videoEl || videoEl.readyState < 2) return;
          ctx.drawImage(videoEl, 0, 0, 16, 16);
          const data = ctx.getImageData(0, 0, 16, 16).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) {
            // perceived brightness
            sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          }
          const avg = sum / (16 * 16);

          if (avg < DARK_THRESHOLD) {
            brightFrameCount = 0;
            darkFrameCount++;
            if (darkFrameCount >= FRAMES_TO_ACTIVATE) enablePocketMode();
          } else {
            darkFrameCount = 0;
            brightFrameCount++;
            if (brightFrameCount >= FRAMES_TO_DEACTIVATE) disablePocketMode();
          }
        }, 500);
      } catch (_) {
        // Permission denied or not available — fall back silently
      }
    }

    function stopCameraDetection() {
      if (sampleInterval) { clearInterval(sampleInterval); sampleInterval = null; }
      if (videoEl) { videoEl.remove(); videoEl = null; }
      if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    }

    startCameraDetection();

    // ── Ambient Light Sensor fallback ─────────────────────────────────────────
    let lightSensor = null;
    let lightTimer = null;
    if ("AmbientLightSensor" in window) {
      try {
        lightSensor = new window.AmbientLightSensor({ frequency: 2 });
        lightSensor.addEventListener("reading", () => {
          if (lightSensor.illuminance < 5) {
            if (!lightTimer) lightTimer = setTimeout(() => enablePocketMode(), 800);
          } else {
            if (lightTimer) { clearTimeout(lightTimer); lightTimer = null; }
            disablePocketMode();
          }
        });
        lightSensor.start();
      } catch (_) { lightSensor = null; }
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (lightTimer) clearTimeout(lightTimer);
      if (lightSensor) lightSensor.stop();
      stopCameraDetection();
      overlay.remove();
    };
  }, []);

  return null;
}