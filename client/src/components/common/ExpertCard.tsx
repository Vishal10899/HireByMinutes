import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Service } from '../../types';
import { Star, CheckCircle, ArrowRight } from 'lucide-react';
import { formatINR } from '../../utils/currency';
import { useAuth } from '../../context/AuthContext';
import { saveIntendedService } from '../../utils/navigation';

interface ExpertCardProps {
  service: Service;
}

export const ExpertCard: React.FC<ExpertCardProps> = ({ service }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleHireClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      saveIntendedService(service.id);
      navigate(`/login?returnTo=${encodeURIComponent(`/services/${service.id}`)}&reason=hire`);
      return;
    }
    navigate(`/services/${service.id}?action=hire`);
  };

  const availabilityStatus = service.availability_status || (service.available_now ? 'AVAILABLE NOW' : 'OFFLINE');

  const getAvailabilityIndicator = () => {
    switch (availabilityStatus) {
      case 'AVAILABLE NOW':
        return (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>Available now</span>
          </div>
        );
      case 'BUSY':
        return (
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span>Busy in session</span>
          </div>
        );
      case 'OFFLINE':
      default:
        return (
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-midnight/50">
            <span className="w-2 h-2 rounded-full bg-timberwolf-dark shrink-0" />
            <span>Offline</span>
          </div>
        );
    }
  };

  // Primary skills formatted cleanly with bullet separators
  const primarySkills = (Array.isArray(service.skills) ? service.skills : []).slice(0, 3);

  return (
    <div className="w-full max-w-full min-w-0 water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 sm:p-6 flex flex-col justify-between hover:border-moonstone/70 transition-all duration-150 shadow-subtle hover:shadow-card group active:scale-[0.995]">
      <div className="w-full min-w-0">
        {/* Top: 1. Profile Image, 2. Expert Name, 3. Professional Title (Public Profile Link) */}
        <Link
          to={`/services/${service.id}`}
          className="flex items-start gap-3.5 mb-3.5 w-full min-w-0 group/link block"
          title={`View ${service.provider_name}'s profile`}
        >
          <div className="relative shrink-0">
            <img
              src={service.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${service.provider_name}`}
              alt={service.provider_name}
              className="w-13 h-13 rounded-full object-cover border-2 border-lightblue bg-aliceblue shrink-0 group-hover/link:border-moonstone transition-colors"
              loading="lazy"
            />
            {availabilityStatus === 'AVAILABLE NOW' && (
              <span
                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full ring-1 ring-emerald-200"
                title="Available now"
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="font-bold text-base text-midnight truncate group-hover/link:text-moonstone transition-colors min-w-0">
                {service.provider_name}
              </h3>
              {service.provider_verified && (
                <span title="Verified Expert" className="inline-flex shrink-0">
                  <CheckCircle className="w-4 h-4 text-moonstone" />
                </span>
              )}
            </div>
            <p className="text-xs text-midnight/70 font-medium line-clamp-2 mt-0.5 leading-snug break-words">
              {service.provider_headline || service.title}
            </p>
          </div>
        </Link>

        {/* 4. Availability & 5. Rating & Sessions */}
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 border-t border-b border-timberwolf/30 text-xs w-full min-w-0">
          {getAvailabilityIndicator()}

          <div className="flex items-center gap-1.5 text-midnight/80 font-medium shrink-0">
            <span className="flex items-center gap-1 font-bold text-amber-600">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
              {(() => {
                const r = Number(service.provider_rating);
                return !isNaN(r) && r > 0 ? r.toFixed(1) : '5.0';
              })()}
            </span>
            <span className="text-timberwolf-dark">•</span>
            <span className="text-midnight/65">
              {service.sessions_completed || 0} sessions
            </span>
          </div>
        </div>

        {/* 7. Primary Skills as compact tags */}
        {primarySkills.length > 0 && (
          <div className="my-3 flex flex-wrap items-center gap-1.5 w-full min-w-0">
            {primarySkills.map((skill) => (
              <span
                key={skill}
                className="px-2.5 py-0.5 rounded-lg bg-aliceblue text-midnight/80 text-[11px] font-medium border border-timberwolf/50 truncate max-w-[140px]"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 6. Per-minute rate & Paired Action Buttons */}
      <div className="pt-3.5 mt-1 border-t border-timberwolf/30 space-y-3 w-full min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-extrabold text-xl text-midnight tracking-tight">
                {formatINR(service.price_per_minute)}
              </span>
              <span className="text-xs font-semibold text-midnight/60">/min</span>
            </div>
            <span className="text-[11px] text-midnight/50 block">
              Pay per minute
            </span>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-semibold text-moonstone-dark bg-moonstone/10 px-2 py-0.5 rounded border border-moonstone/25">
              1-on-1 Live
            </span>
          </div>
        </div>

        {/* Paired Buttons: View Profile & Consult */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link
            to={`/services/${service.id}`}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-timberwolf/80 hover:border-moonstone text-midnight font-semibold text-xs flex items-center justify-center transition-colors hover:bg-aliceblue text-center"
          >
            View Profile
          </Link>

          <button
            type="button"
            onClick={handleHireClick}
            className="btn-shine min-h-[40px] px-3 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-all shadow-subtle group-hover:bg-moonstone group-hover:text-white active:scale-95 cursor-pointer flex items-center justify-center gap-1 text-center"
          >
            <span>Consult</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
export default ExpertCard;
