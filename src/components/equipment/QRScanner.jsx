import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QRScanner({ onScan, onClose, scannerId = "qr-reader" }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);
  const hasScanned = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    // Small delay to ensure the DOM element is mounted inside the dialog
    const timer = setTimeout(() => {
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (hasScanned.current) return;
        hasScanned.current = true;
        scanner.stop().catch(() => {});
        onScan(decodedText);
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
        <div id={scannerId} className="w-full" style={{ minHeight: 280 }} />
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