import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/lib/providers/query-provider";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const APP_NAME = "DBS Category Tracker";
const APP_DESCRIPTION =
  "Plataforma de Category Management para Empresas DBS — visibilidad SKU, planogramas y optimización GMROI.";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1A1A1A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL" className={cn("font-sans", geist.variable)}>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <QueryProvider>{children}</QueryProvider>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
