import Image from "next/image";

export function RimvoLogo({ priority = false }: { priority?: boolean }) {
  return <span className="brand"><Image src="/rimvo-logo.png" width={2172} height={724} alt="Rimvo" priority={priority} /></span>;
}
