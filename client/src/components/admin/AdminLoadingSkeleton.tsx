import React from 'react';

export const AdminLoadingSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading administrative workspace">
      {/* Header Banner skeleton */}
      <div className="bg-white rounded-2xl border border-timberwolf/60 p-6 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-timberwolf/30 rounded-full" />
          <div className="h-7 w-64 bg-timberwolf/40 rounded-lg" />
          <div className="h-3.5 w-96 max-w-full bg-timberwolf/25 rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-28 bg-timberwolf/30 rounded-xl" />
          <div className="h-9 w-36 bg-timberwolf/40 rounded-xl" />
        </div>
      </div>

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-timberwolf/60 p-5 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 bg-timberwolf/30 rounded" />
              <div className="w-8 h-8 rounded-xl bg-timberwolf/25" />
            </div>
            <div className="h-7 w-28 bg-timberwolf/40 rounded-lg" />
            <div className="h-3 w-36 bg-timberwolf/20 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-2xl border border-timberwolf/60 p-6 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-timberwolf/30">
          <div className="h-9 w-72 max-w-full bg-timberwolf/30 rounded-xl" />
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="h-9 w-32 bg-timberwolf/30 rounded-xl" />
            <div className="h-9 w-32 bg-timberwolf/30 rounded-xl" />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between p-3 rounded-xl bg-aliceblue/40 border border-timberwolf/30">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-timberwolf/35" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-36 bg-timberwolf/40 rounded" />
                  <div className="h-2.5 w-48 bg-timberwolf/25 rounded" />
                </div>
              </div>
              <div className="hidden md:flex items-center gap-6">
                <div className="h-3 w-20 bg-timberwolf/30 rounded" />
                <div className="h-3 w-24 bg-timberwolf/30 rounded" />
                <div className="h-6 w-16 bg-timberwolf/30 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-timberwolf/30" />
                <div className="w-7 h-7 rounded-lg bg-timberwolf/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminLoadingSkeleton;