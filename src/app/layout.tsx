import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AppShell } from "@/components/AppShell";
import Script from "next/script";
import { Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-app-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Zalo Content Guidelines Assistant",
  description: "Tra cứu quy cách viết, tối ưu hóa trải nghiệm người dùng dành riêng cho Zalo.",
  keywords: ["Zalo", "Content Guidelines", "UX/UI", "UX Writing", "Zalo Guidelines"],
  openGraph: {
    title: "Zalo Content Guidelines Assistant",
    description: "Tra cứu quy cách viết, tối ưu hóa trải nghiệm người dùng dành riêng cho Zalo.",
    siteName: "Zalo Content Guidelines",
    locale: "vi_VN",
    type: "website",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Zalo Content Guidelines",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zalo Content Guidelines Assistant",
    description: "Tra cứu quy cách viết, tối ưu hóa trải nghiệm người dùng dành riêng cho Zalo.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Zalo Content Guidelines",
      },
    ],
  },
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "apple-touch-icon-precomposed", url: "/apple-touch-icon-precomposed.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`h-full antialiased ${plusJakarta.variable}`} suppressHydrationWarning>
      <body
        className={`min-h-screen bg-background text-foreground flex flex-col ${plusJakarta.className}`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <AuthProvider>
            <AppShell>
              {children}
            </AppShell>
          </AuthProvider>
        </ThemeProvider>
        {/* Avoid loading GA when unset (reduces noise); ad blockers may still block gtag when enabled */}
        {process.env.NEXT_PUBLIC_GA_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
          `}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
