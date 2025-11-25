import React, { ReactNode } from 'react';

interface BoxProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  color: string; // Tailwind border/text color class partial, e.g., "blue-500"
  className?: string;
}

export const VizBox: React.FC<BoxProps> = ({ title, icon, children, color, className = "" }) => {
  return (
    <div className={`relative flex flex-col h-full bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden ${className}`}>
      <div className={`px-4 py-2 bg-slate-800 border-b border-slate-700 flex items-center gap-2 text-sm font-semibold tracking-wide text-${color}`}>
        {icon}
        {title.toUpperCase()}
      </div>
      <div className="flex-1 p-2 overflow-y-auto relative">
        {children}
      </div>
    </div>
  );
};
