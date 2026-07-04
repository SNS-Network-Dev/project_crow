import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";
import ToastProvider from "./components/ToastProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
  themeColor: "#f5f6f8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
