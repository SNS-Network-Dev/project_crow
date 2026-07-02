import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Crow — Face Check-In",
  description: "Face-recognition check-in: register, kiosk, and phone check-in.",
};

// viewportFit:cover lets the full-screen kiosk extend under the iPad's safe areas
// (which the kiosk CSS then pads back with env(safe-area-inset-*)).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
