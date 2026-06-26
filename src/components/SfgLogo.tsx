interface SfgLogoProps {
  size?: "sm" | "md" | "lg";
}

const maxWidths = {
  sm: "max-w-[180px]",
  md: "max-w-[260px]",
  lg: "max-w-[340px]",
};

export function SfgLogo({ size = "md" }: SfgLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/sfg-logo.png"
      alt="SFG Annuity Advisors — Securing Your Independence"
      className={`h-auto w-full ${maxWidths[size]}`}
    />
  );
}
