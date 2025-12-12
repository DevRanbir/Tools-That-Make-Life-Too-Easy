"use client";;
import { useDroppable } from "@dnd-kit/core";

import { useCalendarDnd } from "./calendar-dnd-context";
import { cn } from "@/lib/utils";

export function DroppableCell({
  id,
  date,
  time,
  children,
  className,
  onClick
}) {
  const { activeEvent } = useCalendarDnd();

  const { setNodeRef, isOver } = useDroppable({
    data: {
      date,
      time,
    },
    id,
  });

  // Format time for display in tooltip (only for debugging)
  const formattedTime =
    time !== undefined
      ? `${Math.floor(time)}:${Math.round((time - Math.floor(time)) * 60)
        .toString()
        .padStart(2, "0")}`
      : null;

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden px-0.5 py-1 data-dragging:bg-accent sm:px-1",
        className
      )}
      data-dragging={isOver && activeEvent ? true : undefined}
      onClick={onClick}
      ref={setNodeRef}
      title={formattedTime ? `${formattedTime}` : undefined}>
      {children}
    </div>
  );
}
