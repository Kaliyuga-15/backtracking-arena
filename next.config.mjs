/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mongoose is only ever used on the server; keep it out of the client bundle.
  serverExternalPackages: ['mongoose'],
};

export default nextConfig;
