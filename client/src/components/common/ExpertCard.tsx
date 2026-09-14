import React from 'react';
import { Link } from 'react-router-dom';
import { Service } from '../../types';
import { Star, CheckCircle, ArrowRight } from 'lucide-react';

interface ExpertCardProps {
  service: Service;
}

export const ExpertCard: React.FC<ExpertCardProps> = ({ service }) => {
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
  const primarySkills = (service.skills || []).slice(0, 3);

  return (
    <div className="w-full max-w-full min-w-0 water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-5 sm:p-6 flex flex-col justify-between hover:border-moonstone/70 transition-all duration-150 shadow-subtle hover:shadow-card group active:scale-[0.995]">
      <div className="w-full min-w-0">
        {/* Top: 1. Profile Image, 2. Expert Name, 3. Professional Title */}
        <div className="flex items-start gap-3.5 mb-3.5 w-full min-w-0">
          <div className="relative shrink-0">
            <img
              src={service.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${service.provider_name}`}
              alt={service.provider_name}
              className="w-13 h-13 rounded-full object-cover border-2 border-lightblue bg-aliceblue shrink-0"
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
              <h3 className="font-bold text-base text-midnight truncate group-hover:text-moonstone transition-colors min-w-0">
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
        </div>

        {/* 4. Availability & 5. Rating & Sessions */}
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 border-t border-b border-timberwolf/30 text-xs w-full min-w-0">
          {getAvailabilityIndicator()}

          <div className="flex items-center gap-1.5 text-midnight/80 font-medium shrink-0">
            <span className="flex items-center gap-1 font-bold text-amber-600">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
              {service.provider_rating ? service.provider_rating.toFixed(1) : '5.0'}
            </span>
            <span className="text-timberwolf-dark">•</span>
            <span className="text-midnight/65">
              {service.sessions_completed || 0} sessions
            </span>
          </div>
        </div>

        {/* 7. Primary Skills (Clean, uncluttered, bullet separated) */}
        {primarySkills.length > 0 && (
          <div className="my-3 text-xs text-midnight/75 font-medium flex items-center gap-1.5 overflow-hidden w-full min-w-0">
            {primarySkills.map((skill, index) => (
              <React.Fragment key={skill}>
                <span className="truncate">{skill}</span>
                {index < primarySkills.length - 1 && (
                  <span className="text-timberwolf-dark shrink-0">•</span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* 6. Per-minute rate & 8. Hire CTA */}
      <div className="pt-3.5 mt-1 border-t border-timberwolf/30 flex items-center justify-between gap-2 w-full min-w-0">
        <div className="min-w-0 shrink-0">
          <div className="flex items-baseline gap-1">
            <span className="font-extrabold text-xl text-midnight tracking-tight">
              ${service.price_per_minute.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-midnight/60">/min</span>
          </div>
          <span className="text-[11px] text-midnight/50 block">
            Pay per minute
          </span>
        </div>

        <Link
          to={`/services/${service.id}`}
          className="btn-shine inline-flex items-center justify-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-xl bg-midnight text-aliceblue text-xs sm:text-sm font-bold hover:bg-midnight-hover transition-all shadow-subtle group-hover:bg-moonstone group-hover:text-white active:scale-95 cursor-pointer select-none shrink-0"
        >
          <span>Hire</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </Link>
      </div>
    </div>
  );
};
export default ExpertCard;
