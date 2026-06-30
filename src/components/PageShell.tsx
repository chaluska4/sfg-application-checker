import { Header } from "./Header";
import { Footer } from "./Footer";

interface PageShellProps {
  children: React.ReactNode;
  wide?: boolean;
  extraWide?: boolean;
}

export function PageShell({ children, wide = false, extraWide = false }: PageShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="relative flex-1 overflow-hidden bg-surface">
        <div
          className="pointer-events-none absolute inset-0 bg-center bg-no-repeat opacity-[0.06]"
          style={{
            backgroundImage: "url('/sfg-watermark.png')",
            backgroundSize: "min(480px, 80vw)",
          }}
          aria-hidden
        />

        <div
          className={`relative z-10 mx-auto w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8 ${
            extraWide ? "max-w-7xl" : wide ? "max-w-5xl" : "max-w-3xl"
          }`}
        >
          {children}
        </div>
      </main>

      <Footer />
    </div>
  );
}
