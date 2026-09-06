import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MCP Gateway — Admin',
  description: 'Zero-Trust MCP Orchestrator Administration Panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-gray-50">
        <div className="flex min-h-screen">
          <Sidebar />
          {/* Offset for fixed 240px sidebar */}
          <main className="flex-1 ml-60 flex flex-col min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
