import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Linsheradle",
  description: "Juego de adivinanza de canciones, jugadores, videojuegos, animes y películas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <main className="app-main flex-grow">{children}</main>

        <footer className="app-footer" role="contentinfo">
          <div className="app-footer-inner">by Hydrox and AmazingApple</div>
        </footer>
      </body>
    </html>
  );
}
