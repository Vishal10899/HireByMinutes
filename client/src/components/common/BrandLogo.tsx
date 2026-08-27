import React from 'react';
import { Link } from 'react-router-dom';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  lightText?: boolean;
  showTagline?: boolean;
  className?: string;
  asLink?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText = true,
  lightText = false,
  showTagline = false,
  className = '',
  asLink = true
}) => {
  const iconDimensions = {
    sm: { box: 'w-7 h-7', svg: 18, text: 'text-base', sub: 'text-[9px]' },
    md: { box: 'w-9 h-9', svg: 22, text: 'text-lg', sub: 'text-[10px]' },
    lg: { box: 'w-11 h-11', svg: 28, text: 'text-xl sm:text-2xl', sub: 'text-xs' },
    xl: { box: 'w-14 h-14', svg: 34, text: 'text-2xl sm:text-3xl', sub: 'text-xs' },
  }[size];

  const logoMark = (
    <div
      className={`${iconDimensions.box} rounded-xl bg-midnight flex items-center justify-center shadow-subtle relative overflow-hidden group-hover:bg-midnight-light transition-all duration-300 border border-moonstone/20 shrink-0`}
    >
      {/* Subtle ambient light glow inside icon */}
      <div className="absolute inset-0 bg-radial from-moonstone/30 via-transparent to-transparent opacity-70" />
      
      {/* Custom Vector Icon: Time Dial + Interlocking Human Connection Bridge (H & M) */}
      <svg
        width={iconDimensions.svg}
        height={iconDimensions.svg}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 transition-transform duration-300 group-hover:scale-105"
      >
        {/* Outer Minute Arc / Dial */}
        <circle
          cx="16"
          cy="16"
          r="13"
          stroke="#44A6B5"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="60 22"
          className="opacity-90"
        />

        {/* Left Human Node / Vertical Bridge ("H" column) */}
        <path
          d="M10.5 9.5V22.5"
          stroke="#E9F1F6"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Right Human Node / Vertical Bridge ("H/M" column) */}
        <path
          d="M21.5 9.5V22.5"
          stroke="#E9F1F6"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Center Connection / Time Bridge */}
        <path
          d="M10.5 16H21.5"
          stroke="#44A6B5"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Minute Hand Pulse Dot */}
        <circle cx="16" cy="10" r="1.8" fill="#B2D5E2" />
        <circle cx="16" cy="22" r="1.8" fill="#44A6B5" />
      </svg>
    </div>
  );

  const content = (
    <div className={`flex items-center gap-2.5 group ${className}`}>
      {logoMark}
      {showText && (
        <div className="flex flex-col text-left">
          <span
            className={`font-extrabold tracking-tight leading-none ${iconDimensions.text} ${
              lightText ? 'text-aliceblue' : 'text-midnight'
            } transition-colors group-hover:text-moonstone`}
          >
            HireByMinutes
          </span>
          {showTagline && (
            <span
              className={`font-medium tracking-normal mt-1 ${iconDimensions.sub} ${
                lightText ? 'text-aliceblue/70' : 'text-midnight/65'
              }`}
            >
              Expertise by the minute
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (asLink) {
    return (
      <Link to="/" className="inline-flex focus:outline-none" aria-label="HireByMinutes Home">
        {content}
      </Link>
    );
  }

  return content;
};
export default BrandLogo;
