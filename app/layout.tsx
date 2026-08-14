import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "127.0.0.1:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  return {
    metadataBase,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: "李去哪儿", statusBarStyle: "default" },
    title: "李去哪儿｜旅行路线规划",
    description: "为自己和朋友安排每一天的地点、时间与交通路线。",
    openGraph: {
      title: "李去哪儿",
      description: "把期待，排进每一天",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "李去哪儿旅行路线规划" }],
    },
    twitter: { card: "summary_large_image", images: ["/og.png"] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ef7654",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
