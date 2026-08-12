/** @type {import('next').NextConfig} */
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.join(__dirname, "src"),
    };
    config.output.globalObject = "globalThis";
    return config;
  },
};

export default nextConfig;