// Login pages must not render inside the sidebar shell — override the root layout.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
