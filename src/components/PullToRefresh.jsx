import { useState, useRef, useEffect } from "react";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 70;

/**
 * PullToRefresh — native-style pull-to-refresh for mobile.
 * Listens to touch events on the window scroll. When the user is at the
 * top of the page and pulls down past the threshold, `onRefresh` is called
 * and a spinner indicator is shown.
 */
export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const tracking = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    const onTouchStart = (e) => {
      if (window.scrollY <= 0 && !refreshingRef.current) {
        startY.current = e.touches[0].clientY;
        tracking.current = true;
      } else {
        tracking.current = false;
      }
    };
    const onTouchMove = (e) => {
      if (!tracking.current || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY <= 0) {
        pullRef.current = Math.min(delta * 0.5, 100);
        setPull(pullRef.current);
      }
    };
    const onTouchEnd = async () => {
      if (!tracking.current) return;
      tracking.current = false;
      if (pullRef.current >= THRESHOLD && !refreshingRef.current) {
        setRefreshing(true);
        refreshingRef.current = true;
        setPull(THRESHOLD);
        try {
          await onRefresh?.();
        } finally {
          setRefreshing(false);
          refreshingRef.current = false;
          pullRef.current = 0;
          setPull(0);
        }
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh]);

  return (
    <>
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: pull }}
      >
        <RefreshCw
          className={`w-5 h-5 text-[#d4a843] ${refreshing ? "animate-spin" : ""}`}
          style={{ opacity: Math.min(pull / THRESHOLD, 1) }}
        />
      </div>
      {children}
    </>
  );
}