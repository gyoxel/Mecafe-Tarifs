import { splitDH } from "@/lib/format";

/** Montant en DH : chiffres en grand, devise en petit. */
export function Price({ value, className = "" }: { value: number; className?: string }) {
  const { main, dec } = splitDH(value);
  return (
    <span className={`amount ${className}`}>
      {main}
      {dec && <span className="amount-dec">{dec}</span>}
      <span className="amount-cur">DH</span>
    </span>
  );
}
