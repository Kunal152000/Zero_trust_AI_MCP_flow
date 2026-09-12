import { redirect } from 'next/navigation';

// Signup is now part of the unified auth card at /features/login
export default function SignupPage() {
  redirect('/features/login');
}
