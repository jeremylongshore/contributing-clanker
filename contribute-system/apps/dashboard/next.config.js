/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@contribute/core', '@contribute/ui'],
  // Exclude problematic packages from server-side bundling
  serverExternalPackages: ['undici'],
  webpack: (config, { isServer }) => {
    // Fix for Firebase auth with undici
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
