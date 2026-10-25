import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rocha Health", template: "%s · Rocha Health" },
  description: "Private family health records.",
  robots: { index: false, follow: false },
  applicationName: "Rocha Health",
  // Added to an iPhone's home screen, it opens full screen like an app.
  appleWebApp: { capable: true, title: "Rocha Health", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the layout reach under the notch and home bar; padding keeps content clear (see AppShell).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
