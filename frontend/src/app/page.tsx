import { redirect } from 'next/navigation';

// Root → redirect to login; authenticated users are redirected to dashboard from there.
export default function Home() {
  redirect('/features/login');
}
