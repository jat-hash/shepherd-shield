import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export default function PinchZoomViewer({ src, onClose }) {
  const containerRef = useRef(null);
  const stateRef = useRef({ scale: 1, offsetX: 0, offsetY: 0, lastDist: 0, lastScale: 1, dragging: false, lastTX: 0, lastTY: 0 });
  const imgRef = useRef(null);

  const applyTransform = () => {
    const { scale, offsetX, offsetY } = stateRef.current;
    if (imgRef.current) {
      imgRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        stateRef.current.lastDist = Math.hypot(dx, dy);
        stateRef.current.lastScale = stateRef.current.scale;
        stateRef.current.dragging = false;
      } else if (e.touches.length === 1 && stateRef.current.scale > 1) {
        stateRef.current.dragging = true;
        stateRef.current.lastTX = e.touches[0].clientX;
        stateRef.current.lastTY = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const newScale = Math.min(6, Math.max(1, stateRef.current.lastScale * (dist / stateRef.current.lastDist)));
        stateRef.current.scale = newScale;
        applyTransform();
      } else if (e.touches.length === 1 && stateRef.current.dragging) {
        const dx = e.touches[0].clientX - stateRef.current.lastTX;
        const dy = e.touches[0].clientY - stateRef.current.lastTY;
        stateRef.current.lastTX = e.touches[0].clientX;
        stateRef.current.lastTY = e.touches[0].clientY;
        stateRef.current.offsetX += dx;
        stateRef.current.offsetY += dy;
        applyTransform();
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) stateRef.current.lastDist = 0;
      if (e.touches.length === 0) {
        stateRef.current.dragging = false;
        if (stateRef.current.scale <= 1) {
          stateRef.current.offsetX = 0;
          stateRef.current.offsetY = 0;
          applyTransform();
        }
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const handleReset = () => {
    stateRef.current.scale = 1;
    stateRef.current.offsetX = 0;
    stateRef.current.offsetY = 0;
    applyTransform();
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      style={{ touchAction: "none" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <img
        ref={imgRef}
        src={src}
        alt=""
        style={{
          maxWidth: "100vw",
          maxHeight: "100vh",
          objectFit: "contain",
          transformOrigin: "center center",
          willChange: "transform",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
      <button
        className="absolute top-4 right-4 text-white bg-black/60 rounded-full p-2 z-10"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </button>
      <button
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 bg-black/40 rounded-full px-4 py-1.5 text-xs"
        onClick={handleReset}
      >
        Reset zoom
      </button>
    </div>
  );
}