import { SfgLogo } from "./SfgLogo";

export function Header() {
  return (
    <header>
      <div className="h-3 bg-navy sm:h-4" />
      <div className="bg-white px-4 py-5 sm:px-8 sm:py-6">
        <div className="mx-auto max-w-5xl">
          <SfgLogo size="md" />
        </div>
      </div>
      <div className="h-[3px] bg-red-accent" />
    </header>
  );
}
