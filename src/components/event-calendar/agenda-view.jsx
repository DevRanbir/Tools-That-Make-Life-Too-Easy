"use client";;
import { RiCalendarEventLine } from "@remixicon/react";
import { addDays, format, isToday } from "date-fns";
import { useMemo } from "react";

import { EventItem } from "./event-item";
import { getAgendaEventsForDay } from "./utils";
import { AgendaDaysToShow } from "./constants";

export function AgendaView({
  currentDate,
  events,
  onEventSelect
}) {
  // Show events for the next days based on constant
  const days = useMemo(() => {
    console.log("Agenda view updating with date:", currentDate.toISOString());
    return Array.from({ length: AgendaDaysToShow }, (_, i) =>
      addDays(new Date(currentDate), i));
  }, [currentDate]);

  const handleEventClick = (event, e) => {
    e.stopPropagation();
    console.log("Agenda view event clicked:", event);
    onEventSelect(event);
  };

  // Check if there are any days with events
  const hasEvents = days.some((day) => getAgendaEventsForDay(events, day).length > 0);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent border-t border-border px-4">
      {!hasEvents ? (
        <div
          className="flex h-full flex-col items-center justify-center py-16 text-center">
          <RiCalendarEventLine className="mb-2 text-muted-foreground/50" size={32} />
          <h3 className="font-medium text-lg">No events found</h3>
          <p className="text-muted-foreground">
            There are no events scheduled for this time period.
          </p>
        </div>
      ) : (
        days.map((day) => {
          const dayEvents = getAgendaEventsForDay(events, day);

          if (dayEvents.length === 0) return null;

          return (
            <div className="relative my-8 border-border border-t" key={day.toString()}>
              <span
                className="-top-3 absolute left-0 flex h-6 items-center bg-background pe-4 text-xs font-medium uppercase text-muted-foreground data-today:text-primary data-today:font-bold"
                data-today={isToday(day) || undefined}>
                {format(day, "d MMM, EEEE")}
              </span>
              <div className="mt-6 space-y-2">
                {dayEvents.map((event) => (
                  <EventItem
                    event={event}
                    key={event.id}
                    onClick={(e) => handleEventClick(event, e)}
                    view="agenda"
                    currentDay={day} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
