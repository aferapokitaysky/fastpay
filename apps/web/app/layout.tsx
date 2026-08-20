import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Rimvo", description: "Оплата рахунку за QR-кодом", applicationName: "Rimvo", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#006e62", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="uk"><body>{children}</body></html>; }
