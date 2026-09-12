'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith('/features/login') || pathname?.startsWith('/features/signup');

  // If on the auth pages, hide the sidebar and remove the left margin offset
  if (isAuthPage) {
    return <main className="flex-1 flex flex-col min-h-screen">{children}</main>;
  }

  // Standard authenticated layout with sidebar
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col min-h-screen">
        {children}
      </main>
    </div>
  );
}
