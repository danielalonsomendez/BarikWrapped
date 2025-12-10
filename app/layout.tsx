import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Barik Wrapped",
  description: "Barik Wrapped",
  metadataBase: new URL("https://barikwrapped.danialonso.dev"),
  openGraph: {
    title: "Barik Wrapped",
    description: "Descubre tu año viajero con la tarjeta Barik.",
    url: "https://barikwrapped.danialonso.dev",
    siteName: "Barik Wrapped",
    images: [
      {
        url: "/social_preview.png",
        width: 1200,
        height: 630,
        alt: "Resumen anual de Barik Wrapped"
      }
    ],
    locale: "es_ES",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Barik Wrapped",
    description: "Descubre tu año viajero con la tarjeta Barik.",
    images: ["/social_preview.png"],
    creator: "@danielalonsomendez"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
