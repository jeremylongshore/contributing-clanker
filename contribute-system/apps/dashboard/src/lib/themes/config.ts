/**
 * Multi-Site Theme Configuration
 *
 * Defines branding and theme settings for each domain.
 */

export interface SiteTheme {
  id: string;
  name: string;
  domain: string;
  logo?: string;
  tagline: string;
  colors: {
    primary: string;
    primaryHover: string;
    primaryLight: string;
    accent: string;
    gradient: {
      from: string;
      to: string;
    };
  };
  features: {
    showFinancials: boolean;
    showProofs: boolean;
    publicProofWall: boolean;
  };
}

export const themes: Record<string, SiteTheme> = {
  'intentsolutions.io': {
    id: 'intent',
    name: 'Intent Solutions',
    domain: 'intentsolutions.io',
    tagline: 'Enterprise AI Solutions',
    colors: {
      primary: '#2563eb', // Blue
      primaryHover: '#1d4ed8',
      primaryLight: '#dbeafe',
      accent: '#7c3aed',
      gradient: {
        from: '#1e3a8a',
        to: '#312e81',
      },
    },
    features: {
      showFinancials: true,
      showProofs: true,
      publicProofWall: true,
    },
  },
  'startaitools.io': {
    id: 'startai',
    name: 'Start AI Tools',
    domain: 'startaitools.io',
    tagline: 'AI Tools & Resources',
    colors: {
      primary: '#059669', // Emerald
      primaryHover: '#047857',
      primaryLight: '#d1fae5',
      accent: '#0891b2',
      gradient: {
        from: '#064e3b',
        to: '#134e4a',
      },
    },
    features: {
      showFinancials: false,
      showProofs: true,
      publicProofWall: true,
    },
  },
  'jeremylongshore.com': {
    id: 'jeremy',
    name: 'Jeremy Longshore',
    domain: 'jeremylongshore.com',
    tagline: 'Developer Portfolio',
    colors: {
      primary: '#7c3aed', // Violet
      primaryHover: '#6d28d9',
      primaryLight: '#ede9fe',
      accent: '#ec4899',
      gradient: {
        from: '#4c1d95',
        to: '#831843',
      },
    },
    features: {
      showFinancials: true,
      showProofs: true,
      publicProofWall: true,
    },
  },
  // Default/localhost theme
  default: {
    id: 'default',
    name: 'Bounty System',
    domain: 'localhost',
    tagline: 'Track, Record, Prove',
    colors: {
      primary: '#22c55e', // Green
      primaryHover: '#16a34a',
      primaryLight: '#dcfce7',
      accent: '#3b82f6',
      gradient: {
        from: '#14532d',
        to: '#1e3a8a',
      },
    },
    features: {
      showFinancials: true,
      showProofs: true,
      publicProofWall: true,
    },
  },
};

export function getThemeForHost(hostname: string): SiteTheme {
  // Strip port and www prefix
  const cleanHost = hostname.replace(/:\d+$/, '').replace(/^www\./, '');

  return themes[cleanHost] || themes.default;
}

export function getThemeById(id: string): SiteTheme | undefined {
  return Object.values(themes).find(t => t.id === id);
}
