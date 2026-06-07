export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-5xl font-bold tracking-tight">Vicinity</h1>
      <p className="max-w-md text-center text-lg text-zinc-400">
        Property swipe platform for US homebuyers.
        <br />
        V1 in development.
      </p>
      <a
        href="/login"
        className="rounded-lg bg-accent px-6 py-3 font-semibold text-black transition-colors hover:bg-accent-dark"
      >
        Agent Login
      </a>
    </main>
  );
}
