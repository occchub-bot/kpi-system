import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { readFlashRaw, readPasswordRevealRaw } from "@/lib/flash";
import FlashToaster from "@/components/FlashToaster";
import PasswordRevealModal from "@/components/PasswordRevealModal";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCCCKey",
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
  const pwReveal = await readPasswordRevealRaw();

  return (
    <html lang="th" className="h-full">
      <body className="min-h-full">
        {children}
        <Toaster position="top-center" toastOptions={{ style: { fontFamily: "inherit" } }} />
        <FlashToaster value={flash} />
        <PasswordRevealModal value={pwReveal} />
      </body>
    </html>
  );
}
