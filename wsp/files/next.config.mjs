/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/app",
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
