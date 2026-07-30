import type { Metadata } from "next";
import { headers } from "next/headers";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sa-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-sa-display",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || "https";
  return {
    title: "ShiftAhead",
    description:
      "Know what is safe to spend today, and what needs to happen next so rent is still covered.",
    metadataBase: host ? new URL(`${protocol}://${host}`) : undefined,
    openGraph: {
      title: "ShiftAhead",
      description:
        "Cash-timing for variable-income workers — Safe to Spend, Rent Runway, and a grounded Cashflow Copilot.",
      images: ["/og.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: "ShiftAhead",
      description:
        "Cash-timing for variable-income workers — Safe to Spend, Rent Runway, and a grounded Cashflow Copilot.",
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
      <body className={`${manrope.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
