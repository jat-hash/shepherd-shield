import { useEffect } from "react";

export default function PocketMode() {
  useEffect(() => {
    // Create overlay
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
      overlay.style.opacity = "0.98";
      overlay.style.pointerEvents = "all";
      document.body.style.filter = "brightness(0.05)";
      document.querySelectorAll("audio, video").forEach(el => el.muted = true);
    }

    function disablePocketMode() {
      if (!pocketActive) return;
      pocketActive = false;
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
      document.body.style.filter = "brightness(1)";
      document.querySelectorAll("audio, video").forEach(el => el.muted = false);
    }

    const handleProximity = (event) => {
      if (event.value < 5) enablePocketMode();
      else disablePocketMode();
    };

    const handleOrientation = (event) => {
      if (event.beta > 150 || event.beta < -150) enablePocketMode();
      else disablePocketMode();
    };

    window.addEventListener("deviceproximity", handleProximity);
    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      window.removeEventListener("deviceproximity", handleProximity);
      window.removeEventListener("deviceorientation", handleOrientation);
      overlay.remove();
      document.body.style.filter = "brightness(1)";
    };
  }, []);

  return null;
}