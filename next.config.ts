import type { NextConfig } from "next";

const isStaticBuild = process.env.BUILD_STATIC === '1'

const nextConfig: NextConfig = isStaticBuild
  ? {
      output: 'export',
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {}

export default nextConfig;
