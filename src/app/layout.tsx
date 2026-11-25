import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "研判 · AI 人才潜力初评",
  description: "从简历原文到人才培养建议的盲审工作台",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
