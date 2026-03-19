import React, { useRef, useState, useCallback } from 'react';
import { Camera as CameraIcon, RefreshCw, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CameraProps {
  onCapture: (base64: string) => void;
  onClose: () => void;
}

export const Camera: React.FC<CameraProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const startCamera = async () => {
    try {
      setIsStarting(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' },
        audio: false 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
    } finally {
      setIsStarting(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const capture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg');
        setCapturedImage(base64);
        stopCamera();
      }
    }
  };

  const retake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  };

  React.useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-md aspect-[3/4] bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
        {!capturedImage ? (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            {isStarting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <RefreshCw className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8">
              <button 
                onClick={onClose}
                className="p-4 rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-colors"
                id="close-camera"
              >
                <X className="w-6 h-6" />
              </button>
              <button 
                onClick={capture}
                disabled={isStarting}
                className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
                id="capture-photo"
              >
                <div className="w-16 h-16 rounded-full border-4 border-black/10" />
              </button>
              <div className="w-14" /> {/* Spacer */}
            </div>
          </>
        ) : (
          <>
            <img src={capturedImage} className="w-full h-full object-cover" alt="Captured" />
            <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8 px-8">
              <button 
                onClick={retake}
                className="flex-1 py-4 rounded-2xl bg-white/10 text-white backdrop-blur-md hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                id="retake-photo"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Retake</span>
              </button>
              <button 
                onClick={confirm}
                className="flex-1 py-4 rounded-2xl bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                id="confirm-photo"
              >
                <Check className="w-5 h-5" />
                <span>Use Photo</span>
              </button>
            </div>
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
