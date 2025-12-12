"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

const Toaster = ({
  ...props
}) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--popover-foreground)"
        }
      }
      theme={theme}
      toastOptions={{
        classNames: {
          description: "text-muted-foreground!",
        },
      }}
      {...props} />
  );
};

export { Toaster };
