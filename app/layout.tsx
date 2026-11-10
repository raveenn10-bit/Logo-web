import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://logo.harshapex.com.lk";
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f6f0",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "LOGOVA",
  title: {
    default: "LOGOVA AI Logo Builder | Professional Logo Design Sri Lanka",
    template: "%s | LOGOVA",
  },
  description:
    "Create a professional, editable logo and brand identity with LOGOVA by Harsh Apex Digital Solutions. Your first logo concept is free, then only LKR 300 for five concepts.",
  keywords: [
    "AI logo generator Sri Lanka",
    "professional logo maker",
    "editable SVG logo",
    "brand identity design",
    "logo design Galle",
    "LOGOVA",
    "Harsh Apex Digital Solutions",
  ],
  authors: [{ name: "Harsh Apex Digital Solutions", url: "https://harshapex.com.lk" }],
  creator: "Harsh Apex Digital Solutions",
  publisher: "Harsh Apex Digital Solutions",
  category: "Design Software",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/icon.svg",
  },
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_LK",
    url: siteUrl,
    siteName: "LOGOVA AI Logo Builder",
    title: "LOGOVA — Professional AI Logo Builder",
    description:
      "Build a high-end, editable brand logo. First completed logo concept is free, then LKR 300 for five concepts.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "LOGOVA AI Logo Builder by Harsh Apex Digital Solutions" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LOGOVA — Professional AI Logo Builder",
    description: "Create an editable, professional logo and brand identity online.",
    images: ["/opengraph-image"],
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-LK">
      <body>{children}</body>
    </html>
  );
}
