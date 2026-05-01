'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Target,
  FileCheck,
  DollarSign,
  Settings,
  LogOut,
  User,
  Moon,
  Sun,
  Search,
  Zap,
  Bell
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/themes';

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  feature?: 'showFinancials' | 'showProofs';
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Bounties', href: '/dashboard/bounties', icon: Target },
  { name: 'Discover', href: '/dashboard/discover', icon: Search },
  { name: 'Automation', href: '/dashboard/automation', icon: Zap },
  { name: 'Proofs', href: '/dashboard/proofs', icon: FileCheck, feature: 'showProofs' },
  { name: 'Financials', href: '/dashboard/financials', icon: DollarSign, feature: 'showFinancials' },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { theme, isDark, toggleDark } = useTheme();

  // Filter navigation based on theme features
  const visibleNavigation = navigation.filter(item => {
    if (!item.feature) return true;
    return theme.features[item.feature];
  });

  return (
    <div className="flex h-screen w-64 flex-col bg-theme-gradient">
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-white/10">
        <Target className="h-8 w-8 text-white" style={{ color: theme.colors.primaryLight }} />
        <span className="ml-2 text-xl font-bold text-white">{theme.name}</span>
      </div>

      {/* Site tagline */}
      <div className="px-4 py-2 text-xs text-white/60">
        {theme.tagline}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {visibleNavigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              style={isActive ? { backgroundColor: theme.colors.primary } : undefined}
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Dark mode toggle */}
      <div className="px-4 pb-2">
        <button
          onClick={toggleDark}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <span>Dark Mode</span>
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>

      {/* User section */}
      <div className="border-t border-gray-800 p-4">
        <div className="flex items-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <User className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <div className="ml-3 flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-white">
              {user?.displayName || 'User'}
            </p>
            <p className="truncate text-xs text-gray-400">
              {user?.email}
            </p>
          </div>
          <button
            onClick={() => signOut()}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
