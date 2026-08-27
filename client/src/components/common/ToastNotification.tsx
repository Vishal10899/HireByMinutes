import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { Bell, X, ArrowRight, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export const ToastNotification: React.FC = () => {
  const { activeNotification, dismissNotification } = useSocket();
  const navigate = useNavigate();

  if (!activeNotification) return null;

  const handleClick = () => {
    if (activeNotification.link) {
      navigate(activeNotification.link);
    }
    dismissNotification();
  };

  const getIcon = () => {
    switch (activeNotification.type) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />;
      default:
        return <Info className="w-5 h-5 text-moonstone shrink-0" />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-fade-in">
      <div className="bg-white border-2 border-moonstone/40 rounded-xl shadow-elevated p-4 flex items-start gap-3">
        {getIcon()}
        <div className="flex-1 cursor-pointer" onClick={handleClick}>
          <h5 className="font-semibold text-sm text-midnight">{activeNotification.title}</h5>
          <p className="text-xs text-midnight/70 mt-0.5 leading-relaxed">{activeNotification.message}</p>
          {activeNotification.link && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-moonstone hover:text-moonstone-dark mt-2">
              View now <ArrowRight className="w-3 h-3" />
            </span>
          )}
        </div>
        <button
          onClick={dismissNotification}
          className="text-midnight/40 hover:text-midnight p-1 rounded-md transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
