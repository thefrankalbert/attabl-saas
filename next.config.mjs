/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async rewrites() {
    return {
      beforeFiles: [
        // Détection sous-domaine
        {
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: '(?<site>.*)\\.attabl\\.com',
            },
          ],
          destination: '/_sites/:site/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
