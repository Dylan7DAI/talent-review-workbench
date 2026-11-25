import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  outputFileTracingIncludes: {
    "/": ["./src/data/*.json", "./src/data/*.md"],
    "/api/resumes/default": ["./src/data/*.md"],
  },
};
export default config;
