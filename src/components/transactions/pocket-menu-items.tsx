"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Settings2, X } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { listPockets } from "@/lib/api";
import type { Pocket } from "@/lib/types";

interface PocketMenuItemsProps {
  /** The pocket the row is in today, so it can be marked and removed. */
  currentPocketId?: number | null;
  onSelect: (pocket: Pocket | null) => void;
}

/**
 * The pocket list as menu items, shared by the row menu (as a submenu)
 * and the bulk bar (as its own menu). Choosing a pocket makes the rows
 * transfers into it; "Remove from pocket" turns them back into spending
 * or income by the sign of the amount.
 */
export function PocketMenuItems({ currentPocketId, onSelect }: PocketMenuItemsProps) {
  const t = useTranslations("transactions");
  const pocketsQuery = useQuery({ queryKey: ["pockets"], queryFn: () => listPockets() });
  const pockets = pocketsQuery.data ?? [];

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("pocketMenuLabel")}
        </DropdownMenuLabel>
      {pockets.map((pocket) => (
        <DropdownMenuItem
          key={pocket.id}
          onClick={() => onSelect(pocket)}
          className={pocket.id === currentPocketId ? "bg-accent/60" : undefined}
        >
          <span className="me-2 w-4 text-center">{pocket.emoji ?? "•"}</span>
          <span className="flex-1 truncate">{pocket.name}</span>
          <span
            className="ms-2 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: pocket.color }}
          />
        </DropdownMenuItem>
      ))}
      {pockets.length === 0 && pocketsQuery.isFetched && (
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {t("pocketMenuEmpty")}
        </div>
      )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      {/* Offered for a row that is in a pocket, and always in bulk mode
          (undefined) where the bar cannot know what the rows carry. */}
      {currentPocketId !== null && (
        <DropdownMenuItem onClick={() => onSelect(null)}>
          <X className="me-2 h-3.5 w-3.5" />
          {t("pocketRemove")}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        render={<Link href="/settings/pockets" />}
      >
        <Settings2 className="me-2 h-3.5 w-3.5" />
        {t("pocketManage")}
      </DropdownMenuItem>
    </>
  );
}
