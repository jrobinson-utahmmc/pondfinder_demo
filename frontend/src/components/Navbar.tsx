"use client";

import { useAuth } from "@/lib/auth";

interface NavbarProps {
  onOpenSettings?: () => void;
}

export default function Navbar({ onOpenSettings }: NavbarProps) {
  const { user, logout } = useAuth();

  const isAdmin = user?.role === "admin";

  return (
    <nav className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xl">🌊</span>
        <span className="text-lg font-bold text-gray-900">Pond Finder</span>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          {isAdmin && onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          )}
          <span className="text-sm text-gray-500">
            <strong className="text-gray-800">{user.username}</strong>
            {isAdmin && (
              <span className="ml-1 text-xs text-purple-600">(admin)</span>
            )}
          </span>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
