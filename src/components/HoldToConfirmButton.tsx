import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimation } from 'motion/react';
import { cn } from '../lib/utils';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface HoldToConfirmButtonProps {
  onConfirm: () => void;
  label: string;
  subLabel?: string;
  className?: string;
  holdTime?: number;
}

export function HoldToConfirmButton({ 
  onConfirm, 
  label, 
  subLabel, 
  className,
  holdTime = 3000 
}: HoldToConfirmButtonProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const controls = useAnimation();

  const startHold = () => {
    if (isProcessing) return;
    setIsHolding(true);
    startTimeRef.current = Date.now();
    
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current || Date.now());
      const p = Math.min((elapsed / holdTime) * 100, 100);
      setProgress(p);
      
      if (p >= 100) {
        handleTrigger();
      }
    }, 50);
  };

  const stopHold = () => {
    setIsHolding(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setProgress(0);
  };

  const handleTrigger = async () => {
    stopHold();
    setIsProcessing(true);
    try {
      await onConfirm();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={startHold}
      onTouchEnd={stopHold}
      className={cn(
        "relative overflow-hidden border-2 border-slate-900 font-black uppercase text-xs tracking-[0.2em] transition-all active:translate-y-1 select-none",
        isHolding ? "scale-[0.98]" : "neo-brutalism-shadow",
        className
      )}
      disabled={isProcessing}
    >
      <div className="relative z-10 px-8 py-5 flex items-center justify-between gap-4">
        <div className="text-left">
          <p>{isProcessing ? "Executing..." : label}</p>
          {subLabel && !isHolding && !isProcessing && (
            <p className="text-[8px] opacity-40 font-bold mt-1">{subLabel}</p>
          )}
          {isHolding && (
            <p className="text-[8px] font-bold mt-1 text-white mix-blend-difference">Release to cancel... {Math.ceil((100 - progress) / 33)}s</p>
          )}
        </div>
        {isProcessing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <AlertTriangle className={cn("w-5 h-5", isHolding ? "animate-pulse" : "opacity-20")} />
        )}
      </div>

      <motion.div
        className="absolute left-0 top-0 bottom-0 bg-slate-900/10 pointer-events-none"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.1 }}
      />
    </button>
  );
}
