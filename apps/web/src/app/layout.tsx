import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "../styles/themes.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from 'sonner';
import FirebaseInit from '../components/FirebaseInit';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Dashboard LAZISNU",
    template: "%s · LAZISNU",
  },
  description:
    "Sistem manajemen zakat, infaq, dan sedekah LAZISNU — dashboard operasional untuk admin kecamatan, ranting, petugas, dan bendahara.",
  applicationName: "LAZISNU",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://dashboard.lazisnu.org"
  ),
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "LAZISNU",
    title: "Dashboard LAZISNU",
    description:
      "Sistem manajemen zakat, infaq, dan sedekah LAZISNU.",
  },
  icons: {
    icon: "/logolzs.svg",
    shortcut: "/logolzs.svg",
    apple: "/logolzs.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Anti-FOUC: terapkan tema tersimpan sebelum paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('lazisnu-theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <FirebaseInit />
          {children}
        </ThemeProvider>
        <Toaster position="top-center" richColors expand={true} closeButton />
      </body>
    </html>
  );
}
