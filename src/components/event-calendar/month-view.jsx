"use client";;
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

import {
  DraggableEvent,
} from "./draggable-event";
import {
  DroppableCell,
} from "./droppable-cell";
import {
  EventItem,
} from "./event-item";
import {
  useEventVisibility,
} from "./hooks/use-event-visibility";
import {
  getAllEventsForDay,
  getEventsForDay,
  getSpanningEventsForDay,
  sortEvents,
} from "./utils";
import {
  EventGap,
  EventHeight,
  DefaultStartHour
} from "./constants";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function MonthView({
  currentDate,
  events,
  onEventSelect,
  onEventCreate
}) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ end: calendarEnd, start: calendarStart });
  }, [currentDate]);

  const weekdays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(startOfWeek(new Date()), i);
      return format(date, "EEE");
    });
  }, []);

  // Removed unused weeks memo

  const handleEventClick = (event, e) => {
    e.stopPropagation();
    onEventSelect(event);
  };

  const [isMounted, setIsMounted] = useState(false);
  const { contentRef, getVisibleEventCount } = useEventVisibility({
    eventGap: EventGap,
    eventHeight: EventHeight,
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="flex flex-col h-full" data-slot="month-view">
      <div className="grid grid-cols-7 border-border border-b shrink-0">
        {weekdays.map((day, index) => (
          <div
            className={cn(
              "py-3 text-center text-sm font-medium text-muted-foreground",
              index !== 6 && "border-border border-r"
            )}
            key={day}>
            {day}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 auto-rows-fr min-h-0">
        {days.map((day, dayIndex) => {
          const dayEvents = getEventsForDay(events, day);
          const spanningEvents = getSpanningEventsForDay(events, day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const cellId = `month-cell-${day.toISOString()}`;
          const allDayEvents = [...spanningEvents, ...dayEvents];
          const allEvents = getAllEventsForDay(events, day);

          // Calculate visible count based on container height (dynamic)
          // For now, we rely on CSS overflow or max items logic
          // But since we want "exact same as img 2", we should ensure it handles overflow gracefully
          // The original code used reference cell measurement. We can simplify or keep it.

          // We'll keep the measurement logic but apply it to the first cell
          const isReferenceCell = dayIndex === 0;
          const visibleCount = isMounted
            ? getVisibleEventCount(allDayEvents.length)
            : undefined;
          const hasMore =
            visibleCount !== undefined &&
            allDayEvents.length > visibleCount;
          const remainingCount = hasMore
            ? allDayEvents.length - visibleCount
            : 0;

          return (
            <div
              className={cn(
                "group relative min-h-0 border-border p-1 lg:p-2", // Base styles
                "border-b border-r", // Default borders
                (dayIndex + 1) % 7 === 0 && "border-r-0", // Remove right border for last column
                dayIndex >= days.length - 7 && "border-b-0", // Remove bottom border for last row
                !isCurrentMonth && "bg-secondary/30 text-muted-foreground", // Dim outside days
                isToday(day) && "bg-primary/5" // Highlight today
              )}
              key={day.toString()}>
              <DroppableCell
                date={day}
                id={cellId}
                className="h-full flex flex-col"
                onClick={() => {
                  const startTime = new Date(day);
                  startTime.setHours(DefaultStartHour, 0, 0);
                  onEventCreate(startTime);
                }}>
                <div
                  className={cn(
                    "mb-1 flex size-6 items-center justify-center rounded-full text-sm font-medium",
                    isToday(day)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  )}>
                  {format(day, "d")}
                </div>
                <div
                  className="flex-1 space-y-1"
                  ref={isReferenceCell ? contentRef : null}>
                  {sortEvents(allDayEvents).map((event, index) => {
                    const eventStart = new Date(event.start);
                    const eventEnd = new Date(event.end);
                    const isFirstDay = isSameDay(day, eventStart);
                    const isLastDay = isSameDay(day, eventEnd);

                    const isHidden =
                      isMounted && visibleCount && index >= visibleCount;

                    if (isHidden && visibleCount) return null;

                    if (!isFirstDay) {
                      return (
                        <div
                          aria-hidden={isHidden ? "true" : undefined}
                          className={isHidden ? "hidden" : "block"}
                          key={`spanning-${event.id}-${day.toISOString().slice(0, 10)}`}>
                          <EventItem
                            event={event}
                            isFirstDay={isFirstDay}
                            isLastDay={isLastDay}
                            onClick={(e) => handleEventClick(event, e)}
                            view="month">
                            <div className="invisible h-full">{event.title}</div>
                          </EventItem>
                        </div>
                      );
                    }

                    return (
                      <div
                        aria-hidden={isHidden ? "true" : undefined}
                        className={isHidden ? "hidden" : "block"}
                        key={event.id}>
                        <DraggableEvent
                          event={event}
                          isFirstDay={isFirstDay}
                          isLastDay={isLastDay}
                          onClick={(e) => handleEventClick(event, e)}
                          view="month" />
                      </div>
                    );
                  })}

                  {hasMore && (
                    <Popover modal>
                      <PopoverTrigger asChild>
                        <button
                          className="w-full rounded-sm px-1 py-0.5 text-left font-medium text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground md:text-xs"
                          onClick={(e) => e.stopPropagation()}
                          type="button">
                          + {remainingCount} more
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="center"
                        className="w-64 p-2"
                      >
                        <div className="mb-2 border-b pb-1 font-medium text-sm">
                          {format(day, "EEEE, MMMM d")}
                        </div>
                        <div className="flex flex-col gap-1">
                          {sortEvents(allEvents).map((event) => (
                            <EventItem
                              event={event}
                              key={event.id}
                              view="agenda" // Use agenda view for popup list as it's cleaner
                              onClick={(e) => handleEventClick(event, e)}
                            />
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </DroppableCell>
            </div>
          );
        })}
      </div>
    </div>
  );
}
