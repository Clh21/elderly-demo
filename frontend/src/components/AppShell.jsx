import React from 'react';
import { LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AppShell = ({ navItems }) => {
  const { user, logout } = useAuth();
  const scopeLabel = user?.role === 'ADMIN' ? 'All residents' : (user?.residentName || 'No resident assigned');

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">Elder Care</p>
            <h1 className="text-xl font-semibold text-slate-900">Resident Access Console</h1>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`
                }
              >
                {item.title}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{user?.displayName}</p>
              <p className="text-xs text-slate-500">
                {user?.username} · {scopeLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  );
};

export default AppShell;