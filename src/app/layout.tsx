import type { Metadata } from "next";
import { DM_Sans, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "KB Q&A / 企业知识库",
  description:
    "Atlas KB — enterprise internal knowledge base Q&A with RAG citations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          {children}
          <Toaster richColors closeButton position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
