import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "FastPay", description: "Оплата рахунку за QR-кодом", applicationName: "FastPay", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#176b46", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="uk"><body>{children}</body></html>; }
