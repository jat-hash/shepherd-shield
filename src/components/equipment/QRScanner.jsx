import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QRScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const scannedRef = useRef(false);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);

  // Keep onScan ref fresh without re-running effect
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    const scannerId = "qr-reader-" + Date.now();
    const el = document.getElementById("qr-reader");
    if (el) el.id = scannerId;

    const scanner = new Html5Qrcode(el ? scannerId : "qr-reader");
    scannerRef.current = scanner;
    scannedRef.current = false;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (scannedRef.current) return;
        scannedRef.current = true;
        scanner.stop().catch(() => {}).finally(() => {
          onScanRef.current(decodedText);
        });
      },
      () => {}
    ).then(() => setStarted(true)).catch((err) => {
      setError("Camera access denied or unavailable. Please enter code manually.");
      console.error(err);
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-lg overflow-hidden">
        <div id="qr-reader" className="w-full" style={{ minHeight: 280 }} />
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