import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Earlier page names, kept working for links already shared.
  async redirects() {
    return [
      { source: "/ledger", destination: "/dashboard", permanent: true },
      { source: "/explorer", destination: "/lookup", permanent: true },
      { source: "/lien/:address", destination: "/seller/:address", permanent: true },
    ];
  },
};

export default nextConfig;
