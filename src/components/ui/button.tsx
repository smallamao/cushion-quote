"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-white hover:bg-[var(--accent-hover)]",
        outline:
          "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]",
        ghost:
          "rounded-[var(--radius-md)] px-3 py-2 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]",
        secondary:
          "rounded-[var(--radius-md)] bg-[var(--accent-muted)] px-4 py-2 text-[var(--accent)] hover:bg-[var(--accent-light)]",
        destructive:
          "rounded-[var(--radius-md)] bg-[var(--error)] px-4 py-2 text-white hover:opacity-90",
      },
      size: {
        default: "h-9",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
