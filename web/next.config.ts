import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Earlier page names, kept working for links already shared.
  async redirects() {
    return [
      { source: "/ledger", destination: "/dashboard", permanent: true },
      { source: "/explorer", destination: "/lookup", permanent: true },
      { source: "/lien/:address", destination: "/seller/:address", permanent: true },
      // The app was called Horos; its old domain forwards to the new one.
      { source: "/:path*", has: [{ type: "host", value: "horos-blue.vercel.app" }], destination: "https://yieldline-app.vercel.app/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
