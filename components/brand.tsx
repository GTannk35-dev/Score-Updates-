import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <Image src="/lmr-media.png" alt="LMR Media — Local Marketing Results" width={522} height={150} priority />
    </div>
  );
}

export function LiveDot() {
  return <span className="live-dot" aria-hidden="true" />;
}
