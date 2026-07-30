import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cormorant_Garamond, Outfit } from "next/font/google";
import { LanguageProvider } from "@/lib/LanguageProvider";
import MobileNavShell from "@/components/mobile/MobileNavShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI-Powered National Digital Library",
  description: "Learn, Discover and Research with AI",
  // True immersive landscape reader: without capable:true, iOS treats
  // any Add-to-Home-Screen launch as an ordinary Safari tab (full
  // browser chrome even in "standalone"). This alone doesn't remove
  // Safari chrome for a normal tab visit — only the Fullscreen API
  // (requested from the reader itself) or an actual home-screen launch
  // does that — but it's required for the home-screen path to work at
  // all, and is additive/harmless for every other page in the app.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

// viewportFit: "cover" lets the page extend under the notch / home-
// indicator instead of Safari silently letterboxing the whole document
// to the safe area — the actual cause of the "black side strips" real-
// device report in landscape (the strips were the OS's own chrome
// showing through, not app content). The reader's own env(safe-area-
// inset-*) padding (components/reader-premium/PremiumReaderPreviewContent
// .tsx, MobilePdfPage.tsx) is what keeps interactive content clear of
// the cutout — this just grants the page permission to draw there at
// all. No effect on any non-notched device or on desktop.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${outfit.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LanguageProvider>
          <MobileNavShell>{children}</MobileNavShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
