import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peeap Shipping - Fast & Reliable Delivery",
  description:
    "Peeap Shipping connects merchants with delivery drivers for fast, reliable local deliveries. Track your packages in real-time.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SHIPPING_URL || "https://shipping.peeap.com"
  ),
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
