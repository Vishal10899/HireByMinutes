import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import {
  Sparkles,
  Info,
  AlertTriangle,
  CheckCircle2,
  Megaphone,
  X,
  ArrowRight
} from 'lucide-react';

export interface BannerItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'announcement' | 'warning' | 'success' | 'promo';
  placement: 'global' | 'hero' | 'announcement' | 'services' | 'opportunities';
  start_date?: string;
  end_date?: string;
  is_active: number | boolean;
  cta_label?: string;
  cta_url?: string;
  priority: number;
}

interface BannerAnnouncementProps {
  placement?: 'global' | 'hero' | 'announcement' | 'services' | 'opportunities';
  className?: string;
}

export const BannerAnnouncement: React.FC<BannerAnnouncementProps> = ({
  placement = 'global',
  className = ''
}) => {
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    api
      .getPublicBanners(placement)
      .then((data) => {
        if (mounted && Array.isArray(data.banners)) {
          setBanners(data.banners);
        }
      })
      .catch((err) => {
        console.debug('[BannerAnnouncement] Banners fetch failed:', err);
      });

    return () => {
      mounted = false;
    };
  }, [placement]);

  // Read dismissed state from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hbm_dismissed_banners');
      if (stored) {
        setDismissed(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  const handleDismiss = (id: string) => {
    setDismissed((prev) => {
      const updated = { ...prev, [id]: true };
      try {
        sessionStorage.setItem('hbm_dismissed_banners', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const activeBanners = banners.filter((b) => !dismissed[b.id]);
  if (activeBanners.length === 0) return null;

  // Render the highest priority banner
  const banner = activeBanners[0];

  const getTypeStyle = () => {
    switch (banner.type) {
      case 'warning':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-900',
          icon: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
          btn: 'bg-amber-600 text-white hover:bg-amber-700'
        };
      case 'success':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-950',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
          btn: 'bg-emerald-600 text-white hover:bg-emerald-700'
        };
      case 'promo':
        return {
          bg: 'bg-purple-50 border-purple-200 text-purple-950',
          icon: <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />,
          btn: 'bg-purple-600 text-white hover:bg-purple-700'
        };
      case 'announcement':
        return {
          bg: 'bg-moonstone/10 border-moonstone/30 text-midnight',
          icon: <Megaphone className="w-4 h-4 text-moonstone shrink-0" />,
          btn: 'bg-midnight text-white hover:bg-midnight-hover'
        };
      case 'info':
      default:
        return {
          bg: 'bg-blue-50 border-blue-200 text-blue-950',
          icon: <Info className="w-4 h-4 text-blue-600 shrink-0" />,
          btn: 'bg-blue-600 text-white hover:bg-blue-700'
        };
    }
  };

  const style = getTypeStyle();

  return (
    <div
      role="region"
      aria-label="Announcement"
      className={`border-b transition-all duration-200 py-2.5 px-4 sm:px-6 relative text-xs ${style.bg} ${className}`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {style.icon}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate">
            {banner.title && (
              <span className="font-bold tracking-tight shrink-0">{banner.title}</span>
            )}
            <span className="text-midnight/80 font-medium truncate">{banner.message}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {banner.cta_label && banner.cta_url && (
            banner.cta_url.startsWith('http') ? (
              <a
                href={banner.cta_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold shadow-subtle transition-all cursor-pointer ${style.btn}`}
              >
                <span>{banner.cta_label}</span>
                <ArrowRight className="w-3 h-3" />
              </a>
            ) : (
              <Link
                to={banner.cta_url}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold shadow-subtle transition-all cursor-pointer ${style.btn}`}
              >
                <span>{banner.cta_label}</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )
          )}

          <button
            onClick={() => handleDismiss(banner.id)}
            title="Dismiss announcement"
            className="p-1 rounded-lg text-midnight/50 hover:text-midnight hover:bg-black/5 transition-colors cursor-pointer"
            aria-label="Close announcement"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
