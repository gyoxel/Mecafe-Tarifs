import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const TITLE = "Tarifs Public - Mécafé";
const DESCRIPTION = "Catalogue tarifaire Mécafé.";

export const metadata: Metadata = {
  // Adresse absolue de l'image d'aperçu des liens (app/opengraph-image.tsx).
  metadataBase: new URL(process.env.SITE_URL ?? "https://tarifs.mecafe.ma"),
  title: TITLE,
  description: DESCRIPTION,
  // Aperçu des liens partagés (WhatsApp…) : titre, texte et image.
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Mécafé", type: "website", locale: "fr_MA" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
