import './globals.css';
import Link from 'next/link';
import IdentityBadge from '@/components/IdentityBadge';

export const metadata = {
  title: 'Backtracking Arena',
  description: 'Level 2 of the SCIS Connect competition',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-white/10 px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Backtracking<span className="text-indigo-400">Arena</span>
            </Link>
            <IdentityBadge />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
