import type { Metadata } from "next";
import { Inter, Libre_Baskerville } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-libre",
});

export const metadata: Metadata = {
  title: "SFG Form Completeness Checker",
  description:
    "Internal SFG Annuity Advisors tool to review annuity application PDFs for missing information before submission.",
  icons: {
    icon: "/sfg-logo.png",
    apple: "/sfg-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${libreBaskerville.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
