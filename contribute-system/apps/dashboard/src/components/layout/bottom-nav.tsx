'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, ClipboardList, Bell, User } from 'lucide-react';
import { useTheme } from '@/lib/themes';

interface NavItem {
  name: string;
  href: string;
  icon: typeof Search;
}

const navigation: NavItem[] = [
  { name: 'Browse', href: '/dashboard/discover', icon: Search },
  { name: 'Active', href: '/dashboard/bounties', icon: ClipboardList },
  { name: 'Alerts', href: '/dashboard/alerts', icon: Bell },
  { name: 'Profile', href: '/dashboard/settings', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const { theme } = useTheme();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 md:hidden">
      <div className="flex h-16 items-center justify-around">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard/discover' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center py-2 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              style={isActive ? { color: theme.colors.primary } : undefined}
            >
              <item.icon className={`h-6 w-6 ${isActive ? '' : ''}`} />
              <span className="mt-1">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
