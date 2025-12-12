"use client";

import { addDays, setHours, setMinutes, subDays } from "date-fns";
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

import { EventCalendar } from "@/components/event-calendar";

export default function Component({ user, onEventCountChange }) {
  const [events, setEvents] = useState([]);

  // Calculate and bubble up event count
  useEffect(() => {
    if (onEventCountChange) {
      const now = new Date();
      const ongoing = events.filter(e => new Date(e.start) <= now && new Date(e.end) >= now).length;
      const upcoming = events.filter(e => new Date(e.start) > now).length;
      onEventCountChange({ ongoing, upcoming });
    }
  }, [events, onEventCountChange]);

  // Fetch events from Supabase
  useEffect(() => {
    if (!user) return;
    
    // ... existing fetch logic ...
    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching events:', error);
      } else if (data) {
        const mappedEvents = data.map(evt => ({
          id: evt.id,
          title: evt.title,
          start: new Date(evt.start_time),
          end: new Date(evt.end_time),
          allDay: evt.all_day,
          description: evt.description,
          location: evt.location,
          color: evt.color || 'primary'
        }));
        setEvents(mappedEvents);
      }
    };

    fetchEvents();
  }, [user]);

  const handleEventAdd = async (event) => {
    // Optimistic Update
    const tempId = crypto.randomUUID();
    const newEvent = { ...event, id: tempId };
    setEvents(prev => [...prev, newEvent]);

    if (!user) return;

    const { data, error } = await supabase.from('events').insert({
      user_id: user.id,
      title: event.title || '(No Title)',
      start_time: event.start,
      end_time: event.end,
      all_day: event.allDay,
      description: event.description,
      location: event.location,
      color: event.color
    }).select().single();

    if (error) {
      console.error("Error adding event:", error);
      // Revert if needed
      setEvents(prev => prev.filter(e => e.id !== tempId));
    } else if (data) {
      // Replace temp ID with real ID
      setEvents(prev => prev.map(e => e.id === tempId ? { ...e, id: data.id } : e));
    }
  };

  const handleEventUpdate = async (updatedEvent) => {
    // Optimistic Update
    setEvents(events.map((event) =>
      event.id === updatedEvent.id ? updatedEvent : event));

    if (!user) return;

    const { error } = await supabase.from('events').update({
      title: updatedEvent.title,
      start_time: updatedEvent.start,
      end_time: updatedEvent.end,
      all_day: updatedEvent.allDay,
      description: updatedEvent.description,
      location: updatedEvent.location,
      color: updatedEvent.color
    }).eq('id', updatedEvent.id);

    if (error) console.error("Error updating event:", error);
  };

  const handleEventDelete = async (eventId) => {
    // Optimistic Update
    setEvents(events.filter((event) => event.id !== eventId));

    if (!user) return;

    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) console.error("Error deleting event:", error);
  };

  return (
    <EventCalendar
      events={events}
      className="h-full bg-background/50"
      onEventAdd={handleEventAdd}
      onEventDelete={handleEventDelete}
      onEventUpdate={handleEventUpdate} />
  );
}
