import { cn } from "@/lib/utils";
import type { TransactionTag } from "@/lib/types";

export function TagChip({
  tag,
  className,
}: {
  tag: TransactionTag;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[140px] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        className
      )}
      style={{
        borderColor: tag.color + "55",
        backgroundColor: tag.color + "1A",
        color: "var(--foreground)",
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}
