/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Хуваалцсан workspace package-ууд
  transpilePackages: ['@fuel/types', '@fuel/schemas'],
  poweredByHeader: false,
};

export default nextConfig;
