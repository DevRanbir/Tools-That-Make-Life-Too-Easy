"use client";
import { RiDeleteBinLine } from "@remixicon/react";
import { ClockIcon, CalendarIcon } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { useCallback, useEffect, useMemo, useState, useId } from "react";
import { toast } from "sonner";

import {
  DefaultEndHour,
  DefaultStartHour,
  EndHour,
  StartHour,
} from "./constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

function DateTimePicker({ date, setDate, time, setTime, label, minDate }) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);

  // Handle time change from "HH:mm" input
  const handleTimeChange = (e) => {
    setTime(e.target.value);
  };

  // Validate time on blur to prevent past times
  const handleTimeBlur = () => {
    if (minTimeValue && time < minTimeValue) {
      toast.error("You cannot select a past time!");
      setTime(minTimeValue);
    }
  };

  const handleDateSelect = (newDate) => {
    if (newDate) {
      setDate(newDate);
    }
  };

  // Safe formatting for time display
  const formattedTime = useMemo(() => {
    if (!time) return "";
    try {
      const [h, m] = time.split(':');
      const d = new Date();
      d.setHours(parseInt(h), parseInt(m));
      return format(d, 'h:mm a');
    } catch (e) {
      return time;
    }
  }, [time]);

  // Calculate minimum time if selected date is same as minDate (e.g. today)
  const minTimeValue = useMemo(() => {
    if (!date || !minDate) return undefined;
    if (format(date, 'yyyy-MM-dd') === format(minDate, 'yyyy-MM-dd')) {
      return format(minDate, 'HH:mm');
    }
    return undefined;
  }, [date, minDate]);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? (
              <span>
                {format(date, "PPP")}
                {formattedTime && (
                  <span className="ml-2 text-muted-foreground border-l pl-2">
                    {formattedTime}
                  </span>
                )}
              </span>
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="rounded-md border-0 bg-background">
            <Calendar
              className="p-2"
              mode="single"
              onSelect={handleDateSelect}
              selected={date}
              disabled={(d) => minDate ? isBefore(d, startOfDay(minDate)) : false}
            />
            <div className="border-t p-3">
              <div className="flex items-center gap-3">
                <Label className="text-xs" htmlFor={`time-${id}`}>
                  Time
                </Label>
                <div className="relative grow">
                  <Input
                    className="peer appearance-none ps-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    value={time}
                    onChange={handleTimeChange}
                    onBlur={handleTimeBlur}
                    id={`time-${id}`}
                    step="60"
                    type="time"
                    min={minTimeValue}
                  />
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80 peer-disabled:opacity-50">
                    <ClockIcon aria-hidden="true" size={16} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function EventDialog({
  event,
  isOpen,
  onClose,
  onSave,
  onDelete
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [startTime, setStartTime] = useState(`${DefaultStartHour}:00`);
  const [endTime, setEndTime] = useState(`${DefaultEndHour}:00`);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [color, setColor] = useState("sky");
  const [error, setError] = useState(null);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Debug log to check what event is being passed
  useEffect(() => {
    console.log("EventDialog received event:", event);
  }, [event]);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setStartDate(new Date());
    setEndDate(new Date());
    setStartTime(`${DefaultStartHour}:00`);
    setEndTime(`${DefaultEndHour}:00`);
    setAllDay(false);
    setLocation("");
    setColor("sky");
    setError(null);
  }, []);

  const formatTimeForInput = useCallback((date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = Math.floor(date.getMinutes() / 15) * 15;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      setDescription(event.description || "");

      const start = new Date(event.start);
      const end = new Date(event.end);

      setStartDate(start);
      setEndDate(end);
      setStartTime(formatTimeForInput(start));
      setEndTime(formatTimeForInput(end));
      setAllDay(event.allDay || false);
      setLocation(event.location || "");
      setColor((event.color) || "sky");
      setError(null); // Reset error when opening dialog
    } else {
      resetForm();
    }
  }, [event, formatTimeForInput, resetForm]);

  // Memoize time options so they're only calculated once
  const timeOptions = useMemo(() => {
    const options = [];
    for (let hour = StartHour; hour <= EndHour; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const formattedHour = hour.toString().padStart(2, "0");
        const formattedMinute = minute.toString().padStart(2, "0");
        const value = `${formattedHour}:${formattedMinute}`;
        // Use a fixed date to avoid unnecessary date object creations
        const date = new Date(2000, 0, 1, hour, minute);
        const label = format(date, "h:mm a");
        options.push({ label, value });
      }
    }
    return options;
  }, []); // Empty dependency array ensures this only runs once

  const handleSave = () => {
    // 1. Validate Required Fields
    if (!title.trim()) {
      setError("Title is required");
      toast.error("Please enter an event title");
      return;
    }

    if (!startDate || !endDate) {
      setError("Start and End dates are required");
      toast.error("Please select start and end dates");
      return;
    }

    if (!allDay && (!startTime || !endTime)) {
      setError("Start and End times are required");
      toast.error("Please select start and end times");
      return;
    }

    if (!color) {
      setError("Color etiquette is required");
      toast.error("Please select a color");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!allDay) {
      const [startHours = 0, startMinutes = 0] = startTime
        .split(":")
        .map(Number);
      const [endHours = 0, endMinutes = 0] = endTime.split(":").map(Number);

      if (
        startHours < StartHour ||
        startHours > EndHour ||
        endHours < StartHour ||
        endHours > EndHour
      ) {
        setError(`Selected time must be between ${StartHour}:00 and ${EndHour}:00`);
        return;
      }

      start.setHours(startHours, startMinutes, 0);
      end.setHours(endHours, endMinutes, 0);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    // Validate that end date is not before start date
    if (isBefore(end, start)) {
      setError("End date cannot be before start date");
      return;
    }

    onSave({
      allDay,
      color,
      description,
      end,
      id: event?.id || "",
      location,
      start,
      title: title.trim(),
    });
  };

  const handleDelete = () => {
    if (event?.id) {
      onDelete(event.id);
    }
  };

  // Updated color options to match types.ts
  const colorOptions = [
    {
      bgClass: "bg-sky-400 data-[state=checked]:bg-sky-400",
      borderClass: "border-sky-400 data-[state=checked]:border-sky-400",
      label: "Sky",
      value: "sky",
    },
    {
      bgClass: "bg-amber-400 data-[state=checked]:bg-amber-400",
      borderClass: "border-amber-400 data-[state=checked]:border-amber-400",
      label: "Amber",
      value: "amber",
    },
    {
      bgClass: "bg-violet-400 data-[state=checked]:bg-violet-400",
      borderClass: "border-violet-400 data-[state=checked]:border-violet-400",
      label: "Violet",
      value: "violet",
    },
    {
      bgClass: "bg-rose-400 data-[state=checked]:bg-rose-400",
      borderClass: "border-rose-400 data-[state=checked]:border-rose-400",
      label: "Rose",
      value: "rose",
    },
    {
      bgClass: "bg-emerald-400 data-[state=checked]:bg-emerald-400",
      borderClass: "border-emerald-400 data-[state=checked]:border-emerald-400",
      label: "Emerald",
      value: "emerald",
    },
    {
      bgClass: "bg-orange-400 data-[state=checked]:bg-orange-400",
      borderClass: "border-orange-400 data-[state=checked]:border-orange-400",
      label: "Orange",
      value: "orange",
    },
  ];

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{event?.id ? "Edit Event" : "Create Event"}</DialogTitle>
          <DialogDescription className="sr-only">
            {event?.id
              ? "Edit the details of this event"
              : "Add a new event to your calendar"}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div
            className="rounded-md bg-destructive/15 px-3 py-2 text-destructive text-sm">
            {error}
          </div>
        )}
        <div className="grid gap-4 py-4">
          <div className="*:not-first:mt-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" onChange={(e) => setTitle(e.target.value)} value={title} />
          </div>

          <div className="*:not-first:mt-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              value={description} />
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <DateTimePicker
                label="Start Date"
                date={startDate}
                setDate={setStartDate}
                time={startTime}
                setTime={setStartTime}
                minDate={new Date()}
              />
            </div>

            <div className="flex-1">
              <DateTimePicker
                label="End Date"
                date={endDate}
                setDate={setEndDate}
                time={endTime}
                setTime={setEndTime}
                minDate={startDate}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={allDay}
              id="all-day"
              onCheckedChange={(checked) => setAllDay(checked === true)} />
            <Label htmlFor="all-day">All day</Label>
          </div>

          <div className="*:not-first:mt-1.5">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              onChange={(e) => setLocation(e.target.value)}
              value={location} />
          </div>
          <fieldset className="space-y-4">
            <legend className="font-medium text-foreground text-sm leading-none">
              Etiquette
            </legend>
            <RadioGroup
              className="flex gap-1.5"
              defaultValue={colorOptions[0]?.value}
              onValueChange={(value) => setColor(value)}
              value={color}>
              {colorOptions.map((colorOption) => (
                <RadioGroupItem
                  aria-label={colorOption.label}
                  className={cn("size-6 shadow-none", colorOption.bgClass, colorOption.borderClass)}
                  id={`color-${colorOption.value}`}
                  key={colorOption.value}
                  value={colorOption.value} />
              ))}
            </RadioGroup>
          </fieldset>
        </div>
        <DialogFooter className="flex-row sm:justify-between">
          {event?.id && (
            <Button
              aria-label="Delete event"
              onClick={handleDelete}
              size="icon"
              variant="outline">
              <RiDeleteBinLine aria-hidden="true" size={16} />
            </Button>
          )}
          <div className="flex flex-1 justify-end gap-2">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
