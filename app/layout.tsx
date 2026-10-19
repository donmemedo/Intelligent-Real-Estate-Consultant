import type { Metadata } from "next";
import "./globals.css";
import { SetupProvider } from "@/components/setup-state";

export const metadata: Metadata = {
  title: "PropAgent UX Prototype",
  description: "A clickable product experience prototype for PropAgent.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><SetupProvider>{children}</SetupProvider></body>
    </html>
  );
}
