import { redirect } from 'next/navigation';

// Root → redirect to the main feature page
export default function Home() {
  redirect('/features/dashboard');
}
