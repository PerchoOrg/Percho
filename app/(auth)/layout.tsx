import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 bg-bg">
      <Link href="/" className="absolute top-5 left-5 font-serif text-xl tracking-tight text-ink">
        Vicinity
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
