import React, { useState, useEffect, useRef } from 'react';
import i18n from 'i18next';
import { ScanLine, Camera } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface MobileScannerProps {
  onScan: (value: string) => void;
  active: boolean;
}

const MobileScanner = ({ onScan, active }: MobileScannerProps) => {
  const [inputValue, setInputValue] = useState<string>('');
  const [useCamera, setUseCamera] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (active && !useCamera && inputRef.current) {
      inputRef.current.focus();
    }
  }, [active, useCamera]);

  useEffect(() => {
    if (active && useCamera) {
      let isMounted = true;
      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          if (decodedText && onScan && isMounted) {
            scanner.stop().then(() => {
              if (isMounted) {
                scanner.clear();
                onScan(decodedText.trim());
              }
            }).catch(() => {
              if (isMounted) {
                onScan(decodedText.trim());
              }
            });
          }
        },
        (error) => {
          // ignore
        }
      ).catch((err) => {
        console.error("Camera start error:", err);
      });

      return () => {
        isMounted = false;
        if (scanner.isScanning) {
          scanner.stop().then(() => {
            scanner.clear();
          }).catch(() => {});
        } else {
          scanner.clear();
        }
        scannerRef.current = null;
      };
    }
  }, [active, useCamera, onScan]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && onScan) {
      onScan(inputValue.trim());
      setInputValue('');
    }
  };

  if (!active) return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-4 z-50">
      <div className="flex justify-center gap-4 mb-4 z-20">
        <button
          type="button"
          onClick={() => setUseCamera(false)}
          className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-xs uppercase tracking-widest ${!useCamera ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/50'}`}
        >
          <ScanLine size={16} /> Scanner
        </button>
        <button
          type="button"
          onClick={() => setUseCamera(true)}
          className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 text-xs uppercase tracking-widest ${useCamera ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/50'}`}
        >
          <Camera size={16} /> Camera
        </button>
      </div>

      {!useCamera ? (
        <>
          <ScanLine size={48} className="text-emerald-500 mb-6 animate-pulse opacity-50" />
          <form onSubmit={handleSubmit} className="w-full max-w-[80%] relative z-20">
            <input
              ref={inputRef}
              type="password"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full p-3 rounded-xl text-center font-mono font-bold text-sm bg-white/10 text-white border-2 border-emerald-500/50 focus:outline-none focus:border-emerald-400 focus:bg-white/20 transition-all placeholder:text-white/30"
              placeholder={i18n.t('placeholders.waitHardwareScan', 'Wacht op hardware scan...')}
              autoFocus
              onBlur={() => {
                if (active && !useCamera) setTimeout(() => inputRef.current?.focus(), 100);
              }}
            />
            <button type="submit" className="hidden">{i18n.t('common.submit', 'Submit')}</button>
          </form>
        </>
      ) : (
        <div className="w-full flex-1 min-h-0 bg-black rounded-xl overflow-hidden relative z-20 flex flex-col">
          <div id="reader" className="w-full h-full flex items-center justify-center [&_video]:rounded-lg [&_video]:w-full [&_video]:h-full [&_video]:object-cover"></div>
        </div>
      )}
    </div>
  );
};

export default MobileScanner;
