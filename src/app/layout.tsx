import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { AppShell } from "@/components/AppShell";
import Script from "next/script";


const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://zalo-ikc-be--zalo-ikc.asia-southeast1.hosted.app";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background text-foreground flex flex-col font-sans" suppressHydrationWarning>
        <AuthProvider>
          <AppShell>
            {children}
          </AppShell>
        </AuthProvider>
        {/* Google tag (gtag.js) */}
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
      </body>
    </html>
  );
}
