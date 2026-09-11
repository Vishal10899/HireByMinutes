import React from 'react';
import { Link } from 'react-router-dom';
import { Service } from '../../types';
import { Star, CheckCircle, Clock, ArrowRight } from 'lucide-react';

interface ExpertCardProps {
  service: Service;
}

export const ExpertCard: React.FC<ExpertCardProps> = ({ service }) => {
  // Determine availability status
  const availabilityStatus = service.availability_status || (service.available_now ? 'AVAILABLE NOW' : 'OFFLINE');

  const getStatusBadge = () => {
    switch (availabilityStatus) {
      case 'AVAILABLE NOW':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            AVAILABLE NOW
          </span>
        );
      case 'BUSY':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            BUSY IN SESSION
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            OFFLINE
          </span>
        );
    }
  };

  return (
    <div className="water-surface-card bg-white rounded-2xl border border-timberwolf/70 p-6 flex flex-col justify-between hover:border-moonstone/60 transition-all duration-200 group">
      <div>
        {/* Header: Avatar, Name, Verification, Rating & Availability */}
        <div className="flex items-start gap-4 mb-4">
          <div className="relative">
            <img
              src={service.provider_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${service.provider_name}`}
              alt={service.provider_name}
              className="w-14 h-14 rounded-full object-cover border-2 border-lightblue"
            />
            {availabilityStatus === 'AVAILABLE NOW' && (
              <span
                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full ring-2 ring-emerald-200"
                title="Available now for instant consultation"
              />
            )}
            {availabilityStatus === 'BUSY' && (
              <span
                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full"
                title="Currently busy in consultation"
              />
            )}
            {availabilityStatus === 'OFFLINE' && (
              <span
                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-slate-300 border-2 border-white rounded-full"
                title="Offline"
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-bold text-base text-midnight truncate group-hover:text-moonstone transition-colors">
                  {service.provider_name}
                </h3>
                {service.provider_verified && (
                  <span title="Verified Expert">
                    <CheckCircle className="w-4 h-4 text-moonstone shrink-0" />
                  </span>
                )}
              </div>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-midnight/70 font-medium truncate">
              {service.provider_headline || service.title}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-midnight/80">
              <span className="flex items-center gap-1 font-semibold text-amber-600">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {service.provider_rating ? service.provider_rating.toFixed(1) : '5.0'}
              </span>
              <span className="text-timberwolf-dark">•</span>
              <span className="text-midnight/60">
                {service.sessions_completed || 0} sessions
              </span>
              {service.experience_years ? (
                <>
                  <span className="text-timberwolf-dark">•</span>
                  <span className="text-midnight/60">
                    {service.experience_years} yrs exp
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Subcategory / Service Type Tag */}
        {service.subcategory && (
          <div className="mb-2">
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-aliceblue text-moonstone border border-moonstone/30">
              {service.subcategory}
            </span>
          </div>
        )}

        {/* Service Title & Brief Description */}
        <h4 className="font-semibold text-sm text-midnight line-clamp-1 mb-1.5">
          {service.title}
        </h4>
        <p className="text-xs text-midnight/70 line-clamp-2 leading-relaxed mb-3">
          {service.description}
        </p>

        {/* Languages & Location row */}
        <div className="space-y-1.5 mb-3.5 text-xs text-midnight/70 border-t border-b border-timberwolf/30 py-2">
          {/* Languages */}
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[11px] font-semibold text-midnight/50 shrink-0">Languages:</span>
            <span className="text-midnight/80 font-medium truncate">
              {service.languages && service.languages.length > 0
                ? service.languages.join(' · ')
                : 'English'}
            </span>
          </div>

          {/* Location */}
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[11px] font-semibold text-midnight/50 shrink-0">Location:</span>
            <span className="text-midnight/80 font-medium truncate">
              {[service.city || service.provider_city, service.country || service.provider_country].filter(Boolean).join(', ') || 'Worldwide · Online'}
            </span>
          </div>
        </div>

        {/* Skills Tags */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {service.skills && service.skills.slice(0, 3).map((skill, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-md bg-aliceblue text-midnight/80 text-[11px] font-medium border border-timberwolf/40"
            >
              {skill}
            </span>
          ))}
          {service.skills && service.skills.length > 3 && (
            <span className="px-1.5 py-0.5 text-[11px] text-midnight/50">
              +{service.skills.length - 3}
            </span>
          )}
        </div>
      </div>

      {/* Footer: Pricing & CTA */}
      <div className="pt-4 border-t border-timberwolf/40 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="font-extrabold text-xl text-midnight">
              ${service.price_per_minute.toFixed(2)}
            </span>
            <span className="text-xs font-medium text-midnight/60">/ min</span>
          </div>
          <span className="text-[11px] text-midnight/50 block mt-0.5">
            Pay only for minutes used
          </span>
        </div>

        <Link
          to={`/services/${service.id}`}
          className="btn-shine inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-midnight text-aliceblue text-xs font-bold hover:bg-midnight-hover transition-all shadow-subtle group-hover:bg-moonstone group-hover:text-white cursor-pointer"
        >
          <span>Hire Now</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
