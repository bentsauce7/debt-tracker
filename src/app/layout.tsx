import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import './globals.css';
import { Nav } from '@/components/nav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Debt Tracker',
  description: 'Monitor revolving debt across all credit accounts',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();

  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          {userId && <Nav />}
          <main className="container py-8">{children}</main>
          <footer className="border-t mt-16 py-4">
            <div className="container text-xs text-muted-foreground">
              <a href="/privacy" className="hover:underline">Privacy Policy</a>
            </div>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
