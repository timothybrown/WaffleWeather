import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: "http://localhost:8000/api/:path*",
    },
    {
      source: "/ws/:path*",
      destination: "http://localhost:8000/ws/:path*",
    },
  ],
};

export default nextConfig;
