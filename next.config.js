/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true // static assets served as-is; private images go through /api/private-image-proxy
  },
  async headers() {
    return [
      {
        // Telegram WebApp is loaded inside an iframe -> relax framing restrictions
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
