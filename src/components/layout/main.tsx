import { cn } from "@/lib/utils";

type MainProps = React.HTMLAttributes<HTMLElement> & {
  fluid?: boolean;
};

export function Main({ className, fluid, ...props }: MainProps) {
  return (
    <main
      id="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col px-4 py-6",
        !fluid &&
          "@7xl/content:mx-auto @7xl/content:w-full @7xl/content:max-w-7xl",
        className,
      )}
      {...props}
    />
  );
}
