"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(135deg,var(--brand-600),var(--brand-500))] text-white shadow-[0_18px_40px_-22px_rgba(16,73,214,0.7)] hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-24px_rgba(16,73,214,0.75)]",
        secondary:
          "ui-button-secondary border border-white/60 bg-white/80 text-slate-700 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.35)] backdrop-blur-md hover:border-sky-200 hover:bg-white",
        ghost:
          "ui-button-ghost text-slate-600 hover:bg-slate-100/80 hover:text-slate-950",
        outline:
          "ui-button-outline border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "size-11 rounded-2xl",
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
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
