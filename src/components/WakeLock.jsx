import { useEffect, useRef } from "react";

export default function WakeLock() {
  const wakeLockRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    // Strategy 1: Screen Wake Lock API (Chrome, Edge, Android)
    const requestWakeLock = async () => {
      if ("wakeLock" in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
          return true;
        } catch (e) {
          // low battery or not supported
        }
      }
      return false;
    };

    // Strategy 2: NoSleep video trick for iOS Safari (plays a tiny invisible video loop)
    const startNoSleepVideo = () => {
      if (videoRef.current) return; // already started
      const video = document.createElement("video");
      video.setAttribute("playsinline", "");
      video.setAttribute("muted", "");
      video.setAttribute("loop", "");
      video.style.position = "fixed";
      video.style.top = "-9999px";
      video.style.left = "-9999px";
      video.style.width = "1px";
      video.style.height = "1px";
      video.style.opacity = "0.001";

      // Tiny 1x1 transparent mp4 as base64 (keeps screen awake on iOS)
      const src = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28ybXA0MQAAAAhmcmVlAAAAdW1kYXQAAAABAAAADEF2YyBDb2RpbmcAAAAIAAAAAf//ADKEiWgAAAMEbW9vdgAAAGxtdmhkAAAAANLEP5DSxD+QAAAD6AAAAB4AAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAACFpb2RzAAAAABCAgIAHAR////8AAAAAAAAAAAAEAAAADnRyYWsAAABcdGtoZAAAAAPSxD+Q0sQ/kAAAAAEAAAAAAAAeAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAEAAAAAEAAAAEAAAAAAAAAA";
      
      const source = document.createElement("source");
      source.src = src;
      source.type = "video/mp4";
      video.appendChild(source);
      document.body.appendChild(video);
      videoRef.current = video;
      video.play().catch(() => {});
    };

    const init = async () => {
      const wakeLockSupported = await requestWakeLock();
      if (!wakeLockSupported) {
        // Fallback for iOS Safari
        startNoSleepVideo();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
        if (videoRef.current) videoRef.current.play().catch(() => {});
      }
    };

    // Start on first user interaction (required for video autoplay on iOS)
    const handleInteraction = () => {
      init();
      document.removeEventListener("touchstart", handleInteraction);
      document.removeEventListener("click", handleInteraction);
    };

    // Try immediately (works on desktop/Android)
    init();
    // Also hook into first touch/click for iOS autoplay policy
    document.addEventListener("touchstart", handleInteraction, { once: true });
    document.addEventListener("click", handleInteraction, { once: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.remove();
        videoRef.current = null;
      }
    };
  }, []);

  return null;
}