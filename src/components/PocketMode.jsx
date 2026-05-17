import { useEffect } from "react";

// ── Vote-based Pocket Mode ────────────────────────────────────────────────────
// Each sensor votes "dark" (true) or "light" (false).
// Pocket mode ACTIVATES if ANY sensor votes dark.
// Pocket mode DEACTIVATES only when ALL sensors vote light (or user taps unlock).
// User tap sets a manual unlock that prevents re-activation for 3 seconds.

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
      zIndex: "999999",
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

    // ── Vote registry ─────────────────────────────────────────────────────────
    const votes = {
      visibility: false,
      proximity: false,
      camera: false,
      ambientLight: false,
    };

    let pocketActive = false;
    let manualUnlockUntil = 0; // timestamp: suppress re-activation until this time

    // ── Background keepalive while in pocket ─────────────────────────────────
    let wakeLock = null;
    let keepAliveInterval = null;

    async function startKeepalive() {
      // 1. Wake lock — prevents JS timers from being throttled
      if ("wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen").catch(() => null);
      }
      // 2. Post keepalive to SW every 15s so it stays alive
      if (!keepAliveInterval) {
        keepAliveInterval = setInterval(() => {
          if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({ type: "KEEPALIVE" });
          }
        }, 15_000);
      }
    }

    function stopKeepalive() {
      if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
      if (keepAliveInterval) { clearInterval(keepAliveInterval); keepAliveInterval = null; }
    }

    function updateState() {
      const anyDark = Object.values(votes).some(Boolean);
      const now = Date.now();

      if (anyDark && now >= manualUnlockUntil) {
        if (!pocketActive) {
          pocketActive = true;
          overlay.style.opacity = "1";
          overlay.style.pointerEvents = "all";
          startKeepalive();
        }
      } else if (!anyDark) {
        if (pocketActive) {
          pocketActive = false;
          overlay.style.opacity = "0";
          overlay.style.pointerEvents = "none";
          stopKeepalive();
        }
      }
    }

    function setVote(sensor, isDark) {
      votes[sensor] = isDark;
      updateState();
    }

    function manualUnlock() {
      // User tapped — clear all votes, suppress re-activation for 3s
      manualUnlockUntil = Date.now() + 3000;
      Object.keys(votes).forEach(k => { votes[k] = false; });
      pocketActive = false;
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
    }

    overlay.addEventListener("click", manualUnlock);
    overlay.addEventListener("touchend", (e) => { e.preventDefault(); manualUnlock(); });

    // ── 1. Visibility API ─────────────────────────────────────────────────────
    const handleVisibility = () => {
      setVote("visibility", document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // ── 2. Proximity sensors ──────────────────────────────────────────────────
    const handleProximityEvent = (e) => {
      const near = e.near === true || (typeof e.value === "number" && e.value < 5);
      setVote("proximity", near);
    };
    window.addEventListener("deviceproximity", handleProximityEvent);
    window.addEventListener("userproximity", handleProximityEvent);

    let proximitySensor = null;
    if ("ProximitySensor" in window) {
      try {
        proximitySensor = new window.ProximitySensor();
        proximitySensor.addEventListener("reading", () => {
          setVote("proximity", proximitySensor.near === true);
        });
        proximitySensor.start();
      } catch (_) { proximitySensor = null; }
    }

    // ── 3. Ambient Light Sensor ───────────────────────────────────────────────
    let lightSensor = null;
    let lightDarkTimer = null;
    const LIGHT_DARK_LUX = 3;
    const LIGHT_BRIGHT_LUX = 8;
    const LIGHT_DARK_DELAY = 1000;

    function handleLuxReading(lux) {
      if (typeof lux !== "number" || isNaN(lux)) return;
      if (lux <= LIGHT_DARK_LUX) {
        if (!lightDarkTimer) {
          lightDarkTimer = setTimeout(() => setVote("ambientLight", true), LIGHT_DARK_DELAY);
        }
      } else {
        if (lightDarkTimer) { clearTimeout(lightDarkTimer); lightDarkTimer = null; }
        if (lux >= LIGHT_BRIGHT_LUX) setVote("ambientLight", false);
      }
    }

    // devicelight — wide support on older Android/Firefox
    const handleDeviceLight = (e) => handleLuxReading(e.value);
    window.addEventListener("devicelight", handleDeviceLight);

    // Generic Sensors API — requires permissions policy
    async function startAmbientLightSensor() {
      if (!("AmbientLightSensor" in window)) return;
      try {
        // Request permission if the Permissions API supports it
        if (navigator.permissions) {
          const status = await navigator.permissions.query({ name: "ambient-light-sensor" }).catch(() => null);
          if (status && status.state === "denied") return;
        }
        lightSensor = new window.AmbientLightSensor({ frequency: 4 });
        lightSensor.addEventListener("reading", () => handleLuxReading(lightSensor.illuminance));
        lightSensor.addEventListener("error", () => { lightSensor = null; });
        lightSensor.start();
      } catch (_) { lightSensor = null; }
    }
    startAmbientLightSensor();

    // ── 4. Camera brightness detection ───────────────────────────────────────
    // Samples the rear camera at 8x8. Activates if avg brightness < threshold
    // for N consecutive frames. Deactivates only when bright for N frames AND
    // no other sensor is voting dark.
    let videoStream = null;
    let videoEl = null;
    let sampleInterval = null;
    let darkFrames = 0;
    let brightFrames = 0;
    const CAM_DARK_THRESHOLD = 15;   // avg pixel value 0-255
    const CAM_BRIGHT_THRESHOLD = 25;
    const CAM_FRAMES_ON = 3;         // consecutive dark frames to activate (~1.5s)
    const CAM_FRAMES_OFF = 4;        // consecutive bright frames to deactivate (~2s)

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
          opacity: "0.01",
          pointerEvents: "none",
          width: "1px", height: "1px",
          top: "-10px", left: "-10px",
        });
        document.body.appendChild(videoEl);

        await new Promise((resolve) => {
          videoEl.onloadedmetadata = () => { videoEl.play().then(resolve).catch(resolve); };
          setTimeout(resolve, 3000);
        });

        const canvas = document.createElement("canvas");
        canvas.width = 8; canvas.height = 8;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        sampleInterval = setInterval(() => {
          if (!videoEl || videoEl.readyState < 2) return;
          try {
            ctx.drawImage(videoEl, 0, 0, 8, 8);
            const data = ctx.getImageData(0, 0, 8, 8).data;
            let sum = 0;
            const pixels = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
              sum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            }
            const avg = sum / pixels;

            if (avg < CAM_DARK_THRESHOLD) {
              brightFrames = 0;
              darkFrames = Math.min(darkFrames + 1, CAM_FRAMES_ON + 1);
              if (darkFrames >= CAM_FRAMES_ON) setVote("camera", true);
            } else if (avg > CAM_BRIGHT_THRESHOLD) {
              darkFrames = 0;
              brightFrames = Math.min(brightFrames + 1, CAM_FRAMES_OFF + 1);
              if (brightFrames >= CAM_FRAMES_OFF) setVote("camera", false);
            }
          } catch (_) {}
        }, 500);
      } catch (_) {
        // Camera unavailable — other sensors still operate
      }
    }

    function stopCameraDetection() {
      if (sampleInterval) { clearInterval(sampleInterval); sampleInterval = null; }
      if (videoEl) { videoEl.remove(); videoEl = null; }
      if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
    }

    startCameraDetection();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      stopKeepalive();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("deviceproximity", handleProximityEvent);
      window.removeEventListener("userproximity", handleProximityEvent);
      if (proximitySensor) { try { proximitySensor.stop(); } catch (_) {} }
      window.removeEventListener("devicelight", handleDeviceLight);
      if (lightDarkTimer) clearTimeout(lightDarkTimer);
      if (lightSensor) { try { lightSensor.stop(); } catch (_) {} }
      stopCameraDetection();
      overlay.remove();
    };
  }, []);

  return null;
}