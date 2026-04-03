import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

interface WinCelebrationProps {
  show: boolean;
  onClose: () => void;
}

export function WinCelebration({ show, onClose }: WinCelebrationProps) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    setFading(false);

    const launchConfetti = () => {
      const defaults = { startVelocity: 30, spread: 360, ticks: 80, zIndex: 10001 };

      confetti({ ...defaults, particleCount: 80, origin: { x: 0.1, y: 0.3 } });
      confetti({ ...defaults, particleCount: 80, origin: { x: 0.9, y: 0.3 } });

      setTimeout(() => {
        confetti({ ...defaults, particleCount: 60, origin: { x: 0.5, y: 0.2 } });
        confetti({ ...defaults, particleCount: 40, origin: { x: 0.3, y: 0.5 } });
        confetti({ ...defaults, particleCount: 40, origin: { x: 0.7, y: 0.5 } });
      }, 400);

      setTimeout(() => {
        confetti({ ...defaults, particleCount: 100, origin: { x: 0.5, y: 0.4 }, spread: 160 });
      }, 900);

      setTimeout(() => {
        confetti({ ...defaults, particleCount: 50, origin: { x: 0.2, y: 0.6 } });
        confetti({ ...defaults, particleCount: 50, origin: { x: 0.8, y: 0.6 } });
      }, 1400);

      setTimeout(() => {
        confetti({ ...defaults, particleCount: 70, origin: { x: 0.4, y: 0.3 } });
        confetti({ ...defaults, particleCount: 70, origin: { x: 0.6, y: 0.3 } });
      }, 2200);

      setTimeout(() => {
        confetti({ ...defaults, particleCount: 60, origin: { x: 0.5, y: 0.5 }, spread: 200 });
      }, 3200);
    };

    launchConfetti();

    const fadeTimer = setTimeout(() => setFading(true), 7000);
    const closeTimer = setTimeout(() => {
      setVisible(false);
      onClose();
    }, 7700);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [show, onClose]);

  const handleClose = () => {
    setFading(true);
    setTimeout(() => {
      setVisible(false);
      onClose();
    }, 300);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[10000] flex flex-col items-center justify-center cursor-pointer transition-opacity duration-500 ${fading ? "opacity-0" : "opacity-100"}`}
      onClick={handleClose}
      data-testid="win-celebration-overlay"
    >
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative flex flex-col items-center gap-4 animate-in zoom-in-75 duration-500">
        <div className="text-4xl font-bold text-white drop-shadow-lg text-center">
          🏆 Opportunità Vinta!
        </div>

        <div className="rounded-xl overflow-hidden shadow-2xl border-4 border-yellow-400">
          <img
            src="https://media.giphy.com/media/tODygE8KCqBzy/giphy.gif"
            alt="Standing Ovation"
            className="w-[400px] max-w-[85vw]"
            data-testid="img-win-celebration"
          />
        </div>

        <div className="text-lg text-yellow-300 font-medium drop-shadow animate-pulse text-center max-w-[500px] px-4 leading-relaxed">
          Complimenti per il colpaccio! Goditi il momento ma non dormirci su... i prossimi preventivi non si compilano da soli! 💪
        </div>
      </div>
    </div>
  );
}