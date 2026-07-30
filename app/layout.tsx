import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  return {
    title: "Daily Earnings Atlas",
    description:
      "Explore the workers behind variable income and the signals that reveal cash pressure.",
    metadataBase: host ? new URL(`${protocol}://${host}`) : undefined,
    openGraph: {
      title: "Daily Earnings Atlas",
      description: "Who earns daily—and where cash pressure shows up.",
      images: ["/og.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: "Daily Earnings Atlas",
      description: "Who earns daily—and where cash pressure shows up.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
