import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import './globals.css';
import { Nav } from '@/components/nav';
import { ThemeProvider } from '@/components/theme-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Debt Tracker',
  description: 'Monitor revolving debt across all credit accounts',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {userId && <Nav />}
            <main className="container py-8">{children}</main>
            <footer className="border-t mt-16 py-4">
              <div className="container text-xs text-muted-foreground flex gap-4">
                <a href="/privacy" className="hover:underline">Privacy Policy</a>
                <a href="/data-retention" className="hover:underline">Data Retention Policy</a>
              </div>
            </footer>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
