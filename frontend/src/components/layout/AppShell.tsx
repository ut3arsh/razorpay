import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  AlertTriangle,
  Radio,
  Server,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { api, type HealthResponse } from '../../lib/api';

const NAV_ITEMS = [
  { path: '/', label: 'Overview', code: 'SYS//01', icon: LayoutDashboard },
  { path: '/cases', label: 'Recovery Cases', code: 'LEDGER//02', icon: Layers },
  { path: '/exceptions', label: 'Exceptions', code: 'ALERT//03', icon: AlertTriangle },
  { path: '/events', label: 'Payment Events', code: 'STREAM//04', icon: Radio },
];

export const AppShell: React.FC = () => {
  const location = useLocation();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = async () => {
    try {
      setHealthStatus('checking');
      const res = await api.getHealth();
      setHealth(res);
      setHealthStatus('connected');
      setLastChecked(new Date());
    } catch {
      setHealth(null);
      setHealthStatus('error');
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    checkHealth();
    // Periodic health check every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#14171C] text-[#E8EAED] font-sans">
      {/* ----------------- Persistent Left Navigation ----------------- */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-[#2A2F3A] bg-[#1C2028]">
        {/* Wordmark / Brand Header */}
        <div className="h-16 px-5 flex items-center border-b border-[#2A2F3A] bg-[#14171C]">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-[#4FD1A5] border border-[#4FD1A5]/40" />
            <div>
              <div className="font-display text-sm font-bold tracking-wider text-[#E8EAED] uppercase">
                Razorpay
              </div>
              <div className="font-mono text-[10px] tracking-widest text-[#8B93A1] uppercase">
                Recovery Engine
              </div>
            </div>
          </div>
        </div>

        {/* Section Label */}
        <div className="px-5 pt-5 pb-2">
          <div className="font-mono text-[10px] font-semibold tracking-widest text-[#5A6270] uppercase">
            Navigation // Terminal
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `group flex items-center justify-between px-3 py-2.5 text-xs transition-colors rounded-[2px] border ${
                    isActive
                      ? 'bg-[#232833] text-[#E8EAED] border-[#4FD1A5]/40 font-medium'
                      : 'text-[#8B93A1] hover:text-[#E8EAED] hover:bg-[#232833]/60 border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center space-x-2.5">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive ? 'text-[#4FD1A5]' : 'text-[#5A6270] group-hover:text-[#8B93A1]'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>
                    <span
                      className={`font-mono text-[10px] transition-colors ${
                        isActive ? 'text-[#4FD1A5]' : 'text-[#5A6270]'
                      }`}
                    >
                      {item.code}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Pinned Bottom Area: Last Batch Run */}
        <div className="p-4 border-t border-[#2A2F3A] bg-[#14171C]/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-wider text-[#5A6270] uppercase">
              Batch Status
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono text-[#4FD1A5] bg-[#4FD1A5]/10 border border-[#4FD1A5]/20 rounded-[2px]">
              PERSISTED
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center space-x-1.5 text-xs text-[#8B93A1]">
              <Clock className="w-3.5 h-3.5 text-[#5A6270]" />
              <span className="font-mono text-[11px]">Last batch run:</span>
            </div>
            <div className="font-mono text-[11px] text-[#E8EAED] pl-5">
              Live DB Synced
            </div>
          </div>
        </div>
      </aside>

      {/* ----------------- Main App Workspace ----------------- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar: Connection & Environment */}
        <header className="h-16 flex-shrink-0 px-8 flex items-center justify-between border-b border-[#2A2F3A] bg-[#1C2028]">
          <div className="flex items-center space-x-3">
            <span className="font-mono text-xs text-[#5A6270]">LOC:</span>
            <span className="font-mono text-xs text-[#8B93A1] bg-[#14171C] px-2 py-1 border border-[#2A2F3A] rounded-[2px]">
              {location.pathname}
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* API Health Status Badge */}
            <div className="flex items-center space-x-2 px-3 py-1 bg-[#14171C] border border-[#2A2F3A] rounded-[2px]">
              <div
                className={`w-2 h-2 rounded-full ${
                  healthStatus === 'connected'
                    ? 'bg-[#4FD1A5] shadow-[0_0_8px_rgba(79,209,165,0.6)] animate-pulse'
                    : healthStatus === 'checking'
                    ? 'bg-[#E8A33D] animate-ping'
                    : 'bg-[#E1615A]'
                }`}
              />
              <span className="font-mono text-xs">
                {healthStatus === 'connected' ? (
                  <span className="text-[#E8EAED]" title={`Status: ${health?.status} @ ${health?.timestamp}`}>
                    API :3000 [OK]
                  </span>
                ) : healthStatus === 'checking' ? (
                  <span className="text-[#E8A33D]">PINGING...</span>
                ) : (
                  <span className="text-[#E1615A]">DISCONNECTED</span>
                )}
              </span>
              <button
                onClick={checkHealth}
                title={lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : 'Refresh API Connection Status'}
                className="text-[#5A6270] hover:text-[#E8EAED] transition-colors pl-1"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {/* Terminal Meta Tag */}
            <div className="hidden md:flex items-center space-x-2 text-[11px] font-mono text-[#5A6270]">
              <Server className="w-3.5 h-3.5 text-[#5A6270]" />
              <span>STAGE: SPRINT_4</span>
            </div>
          </div>
        </header>

        {/* Scrollable Page Outlet */}
        <main className="flex-1 overflow-y-auto bg-[#14171C]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
