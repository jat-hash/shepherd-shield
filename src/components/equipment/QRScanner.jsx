import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const SCANNER_ID = "qr-reader-container";

export default function QRScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const scannedRef = useRef(false);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    scannedRef.current = false;

    // Clear any leftover html5-qrcode DOM from a previous mount
    const container = document.getElementById(SCANNER_ID);
    if (container) container.innerHTML = "";

    let scanner;
    let stopped = false;

    try {
      scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;
    } catch (e) {
      setError("Could not initialize scanner. Please enter code manually.");
      return;
    }

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        if (scannedRef.current || stopped) return;
        scannedRef.current = true;
        scanner.stop()
          .catch(() => {})
          .finally(() => {
            onScanRef.current(decodedText);
          });
      },
      () => {} // suppress per-frame errors
    )
      .then(() => setStarted(true))
      .catch((err) => {
        console.error("QR Scanner start error:", err);
        setError("Camera access denied or unavailable. Please enter code manually.");
      });

    return () => {
      stopped = true;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-lg overflow-hidden">
        <div id={SCANNER_ID} className="w-full" style={{ minHeight: 280 }} />
        <Button
          onClick={onClose}
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70 z-10"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      {error && (
        <p className="text-red-400 text-xs text-center">{error}</p>
      )}
      {!error && !started && (
        <p className="text-slate-400 text-xs text-center">Starting camera...</p>
      )}
      {!error && started && (
        <p className="text-slate-400 text-xs text-center">Point camera at QR code</p>
      )}
    </div>
  );
}