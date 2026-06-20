import { BrandMark } from '@/components/site/BrandMark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 bg-bg">
      <BrandMark className="absolute top-5 left-5" />
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
