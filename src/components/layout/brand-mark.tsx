import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground",
        size === "sm" ? "size-8" : "size-11",
        className,
      )}
    >
      <BookOpen
        className={size === "sm" ? "size-3.5" : "size-5"}
        strokeWidth={1.75}
      />
    </span>
  );
}
