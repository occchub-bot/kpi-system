import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { readFlashRaw } from "@/lib/flash";
import FlashToaster from "@/components/FlashToaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPI System",
  description: "ระบบประเมิน KPI องค์กร",
};

export const viewport: Viewport = {
  themeColor: "#17305c",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const flash = await readFlashRaw();

  return (
    <html lang="th" className="h-full">
      <body className="min-h-full">
        {children}
        <Toaster position="top-center" toastOptions={{ style: { fontFamily: "inherit" } }} />
        <FlashToaster value={flash} />
      </body>
    </html>
  );
}
