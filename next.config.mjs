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
        // Dev local: radisson.localhost → /sites/radisson
        {
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: '(?<site>[^.]+)\\.localhost(?::\\d+)?',
            },
          ],
          destination: '/sites/:site/:path*',
        },
        // Production: radisson.attabl.com → /sites/radisson
        {
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: '(?<site>[^.]+)\\.attabl\\.com',
            },
          ],
          destination: '/sites/:site/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
