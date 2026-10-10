import React from 'react';

interface DemoBadgeProps {
  label?: string;
  className?: string;
}

export function DemoBadge({ label = 'بيانات تجريبية', className = '' }: DemoBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300/80 shadow-sm ${className}`}
      aria-label="علامة بيانات تجريبية"
    >
      <span className="w-1.5 h-1.5 me-1.5 rounded-full bg-amber-500 animate-pulse" />
      {label}
    </span>
  );
}
