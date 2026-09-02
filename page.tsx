"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Cloud, CloudFog,
  CloudLightning, CloudRain, CloudSnow, Crosshair, LoaderCircle, LocateFixed,
  LogOut, MapPin, RefreshCw, Search, Settings2, Sun, Sunrise, Sunset, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Location = { name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone: string };
type WeatherHour = { time: string; temperature: number; apparentTemperature: number; precipitationProbability: number; weatherCode: number; windSpeed: number };
type CalendarEvent = { id: string; summary: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; location?: string; htmlLink?: string };
type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient: (config: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void; error_callback?: () => void }) => GoogleTokenClient;
      revoke: (token: string, done: () => void) => void;
    } } };
  }
}

const DEFAULT_LOCATION: Location = { name: "Detroit", admin1: "Michigan", country: "United States", latitude: 42.3314, longitude: -83.0458, timezone: "America/Detroit" };
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function addDays(date: Date, amount: number) { const next = new Date(date); next.setDate(next.getDate() + amount); return next; }
function isSameDay(a: Date, b: Date) { return dateKey(a) === dateKey(b); }
function formatHour(hour: number) { return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(new Date(2026, 0, 1, hour)); }
function daysFromToday(date: Date) { const today = new Date(); today.setHours(0, 0, 0, 0); const target = new Date(date); target.setHours(0, 0, 0, 0); return Math.round((target.getTime() - today.getTime()) / 86400000); }

function weatherLabel(code: number) {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Mixed conditions";
}

function WeatherIcon({ code, hour }: { code: number; hour: number }) {
  const className = "weather-icon";
  if ([95, 96, 99].includes(code)) return <CloudLightning className={className} />;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow className={className} />;
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return <CloudRain className={className} />;
  if (code === 45 || code === 48) return <CloudFog className={className} />;
  if (code >= 2) return <Cloud className={className} />;
  if (hour < 7) return <Sunrise className={className} />;
  if (hour >= 19) return <Sunset className={className} />;
  return <Sun className={className} />;
}

function eventOverlapsHour(event: CalendarEvent, day: Date, hour: number) {
  if (event.start.date && event.end.date) { const dayString = dateKey(day); return hour === 0 && dayString >= event.start.date && dayString < event.end.date; }
  if (!event.start.dateTime || !event.end.dateTime) return false;
  const slotStart = new Date(day); slotStart.setHours(hour, 0, 0, 0);
  const slotEnd = new Date(slotStart); slotEnd.setHours(slotEnd.getHours() + 1);
  return new Date(event.start.dateTime) < slotEnd && new Date(event.end.dateTime) > slotStart;
}

function eventTime(event: CalendarEvent) {
  if (event.start.date) return "All day";
  if (!event.start.dateTime || !event.end.dateTime) return "";
  const format = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  return `${format.format(new Date(event.start.dateTime))} – ${format.format(new Date(event.end.dateTime))}`;
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION);
  const [locationQuery, setLocationQuery] = useState("");
  const [weather, setWeather] = useState<WeatherHour[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientIdDraft, setClientIdDraft] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [calendarError, setCalendarError] = useState("");
  const [locationError, setLocationError] = useState("");

  useEffect(() => {
    const savedClientId = localStorage.getItem("tmw-google-client-id") || "";
    const savedLocation = localStorage.getItem("tmw-location");
    const hydrationTimer = window.setTimeout(() => {
      setClientId(savedClientId); setClientIdDraft(savedClientId);
      if (savedLocation) { try { setLocation(JSON.parse(savedLocation)); } catch { localStorage.removeItem("tmw-location"); } }
    }, 0);
    const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true; document.head.appendChild(script);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => { window.clearTimeout(hydrationTimer); script.remove(); };
  }, []);

  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true); setWeatherError("");
    try {
      const day = dateKey(selectedDate);
      const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m", temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: location.timezone || "auto", start_date: day, end_date: day });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error("Weather is unavailable for this date.");
      const data = await response.json();
      setWeather(data.hourly.time.map((time: string, index: number) => ({ time, temperature: data.hourly.temperature_2m[index], apparentTemperature: data.hourly.apparent_temperature[index], precipitationProbability: data.hourly.precipitation_probability[index], weatherCode: data.hourly.weather_code[index], windSpeed: data.hourly.wind_speed_10m[index] })));
    } catch (error) { setWeather([]); setWeatherError(error instanceof Error ? error.message : "Could not load weather."); }
    finally { setWeatherLoading(false); }
  }, [location, selectedDate]);
  useEffect(() => { const timer = window.setTimeout(fetchWeather, 0); return () => window.clearTimeout(timer); }, [fetchWeather]);

  const fetchCalendar = useCallback(async () => {
    if (!accessToken) return;
    setCalendarLoading(true); setCalendarError("");
    try {
      const start = new Date(selectedDate); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const params = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "100" });
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (response.status === 401) { setAccessToken(""); throw new Error("Your Google session expired. Connect again."); }
      if (!response.ok) throw new Error("Google Calendar could not be loaded.");
      const data = await response.json(); setEvents(data.items || []);
    } catch (error) { setEvents([]); setCalendarError(error instanceof Error ? error.message : "Could not load Calendar."); }
    finally { setCalendarLoading(false); }
  }, [accessToken, selectedDate]);
  useEffect(() => { const timer = window.setTimeout(fetchCalendar, 0); return () => window.clearTimeout(timer); }, [fetchCalendar]);

  function connectCalendar() {
    setCalendarError("");
    if (!clientId) { setSettingsOpen(true); setCalendarError("Add your Google OAuth Client ID first."); return; }
    if (!window.google?.accounts.oauth2) { setCalendarError("Google sign-in is still loading. Try again in a moment."); return; }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: GOOGLE_SCOPE,
      callback: (response) => { if (response.access_token) { setAccessToken(response.access_token); setCalendarError(""); } else setCalendarError("Google Calendar access was not granted."); },
      error_callback: () => setCalendarError("Google sign-in was closed or interrupted."),
    });
    tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  }

  function disconnectCalendar() {
    if (accessToken && window.google?.accounts.oauth2) window.google.accounts.oauth2.revoke(accessToken, () => undefined);
    setAccessToken(""); setEvents([]);
  }

  function saveClientId(event: FormEvent) {
    event.preventDefault(); const trimmed = clientIdDraft.trim(); setClientId(trimmed);
    if (trimmed) localStorage.setItem("tmw-google-client-id", trimmed); else localStorage.removeItem("tmw-google-client-id");
    setSettingsOpen(false); setCalendarError("");
  }

  async function searchLocation(event: FormEvent) {
    event.preventDefault(); if (!locationQuery.trim()) return;
    setLocationLoading(true); setLocationError("");
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=en&format=json`);
      if (!response.ok) throw new Error("Location search failed.");
      const data = await response.json(); if (!data.results?.length) throw new Error("No matching location found.");
      const result = data.results[0];
      const nextLocation: Location = { name: result.name, admin1: result.admin1, country: result.country, latitude: result.latitude, longitude: result.longitude, timezone: result.timezone };
      setLocation(nextLocation); localStorage.setItem("tmw-location", JSON.stringify(nextLocation)); setLocationQuery("");
    } catch (error) { setLocationError(error instanceof Error ? error.message : "Could not find that location."); }
    finally { setLocationLoading(false); }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setLocationError("Location services are not supported by this browser."); return; }
    setLocationLoading(true); setLocationError("");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const nextLocation: Location = { name: "Current location", latitude: coords.latitude, longitude: coords.longitude, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      setLocation(nextLocation); localStorage.setItem("tmw-location", JSON.stringify(nextLocation)); setLocationLoading(false);
    }, () => { setLocationError("Location permission was not granted."); setLocationLoading(false); }, { enableHighAccuracy: false, timeout: 10000 });
  }

  const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(selectedDate);
  const currentHour = new Date().getHours();
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const locationLabel = [location.name, location.admin1].filter(Boolean).join(", ");
  const selectedOffset = daysFromToday(selectedDate);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block"><div className="brand-mark" aria-hidden="true"><Crosshair /></div><div><p className="eyebrow">Daily command center</p><h1>Track My Weather</h1></div></div>
        <div className="header-actions">
          {accessToken ? <Button variant="outline" onClick={disconnectCalendar} className="dark-button"><LogOut /> Disconnect</Button> : <Button onClick={connectCalendar} className="calendar-button"><CalendarDays /> <span>Connect Google Calendar</span></Button>}
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen((open) => !open)} className="dark-button" aria-label="Calendar settings" aria-expanded={settingsOpen}><Settings2 /></Button>
        </div>
      </header>

      {settingsOpen && <section className="settings-panel" aria-label="Google Calendar settings">
        <div><p className="settings-kicker">Google Calendar setup</p><h2>Connect your schedule</h2><p>Paste the OAuth 2.0 Web Client ID from Google Cloud Console. It stays in this browser.</p></div>
        <form onSubmit={saveClientId} className="settings-form"><label htmlFor="client-id">OAuth Client ID</label><div className="input-row">
          <Input id="client-id" value={clientIdDraft} onChange={(event) => setClientIdDraft(event.target.value)} placeholder="000000000000-abc123.apps.googleusercontent.com" />
          <Button type="submit"><Check /> Save</Button><Button type="button" variant="ghost" size="icon" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X /></Button>
        </div></form>
      </section>}

      <section className="control-deck" aria-label="Day and location controls">
        <div className="date-control"><Button variant="ghost" size="icon" disabled={selectedOffset <= -90} onClick={() => setSelectedDate((date) => addDays(date, -1))} aria-label="Previous day"><ChevronLeft /></Button>
          <button className="date-readout" onClick={() => setSelectedDate(new Date())} title="Return to today"><span>{isSameDay(selectedDate, new Date()) ? "Today" : "Selected day"}</span><strong>{dayLabel}</strong></button>
          <Button variant="ghost" size="icon" disabled={selectedOffset >= 14} onClick={() => setSelectedDate((date) => addDays(date, 1))} aria-label="Next day"><ChevronRight /></Button></div>
        <div className="location-control"><div className="active-location"><MapPin aria-hidden="true" /><div><span>Forecast for</span><strong>{locationLabel}</strong></div></div>
          <form onSubmit={searchLocation} className="location-search"><Input aria-label="Search city or postal code" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="City or postal code" />
            <Button type="submit" size="icon" disabled={locationLoading} aria-label="Search location">{locationLoading ? <LoaderCircle className="spin" /> : <Search />}</Button>
            <Button type="button" variant="outline" size="icon" onClick={useMyLocation} disabled={locationLoading} aria-label="Use my location"><LocateFixed /></Button>
          </form></div>
      </section>

      {(locationError || weatherError || calendarError) && <div className="notice-stack" role="status">{locationError && <p>{locationError}</p>}{weatherError && <p>{weatherError}</p>}{calendarError && <p>{calendarError}</p>}</div>}

      <section className="timeline-card" aria-label={`Hourly schedule for ${dayLabel}`}>
        <div className="timeline-header timeline-grid"><div>Time</div><div>Weather</div><div className="calendar-heading"><span>Google Calendar</span><div>{(calendarLoading || weatherLoading) && <LoaderCircle className="spin" aria-label="Loading" />}{accessToken && !calendarLoading && <button onClick={fetchCalendar} aria-label="Refresh Calendar"><RefreshCw /></button>}</div></div></div>
        <div className="timeline-body">{hours.map((hour) => {
          const hourWeather = weather.find((item) => Number(item.time.slice(11, 13)) === hour); const hourEvents = events.filter((event) => eventOverlapsHour(event, selectedDate, hour)); const isNow = isSameDay(selectedDate, new Date()) && currentHour === hour;
          return <article className={`timeline-row timeline-grid ${isNow ? "is-now" : ""}`} key={hour}>
            <div className="time-cell">{isNow && <span className="now-dot" aria-label="Current hour" />}<strong>{formatHour(hour)}</strong>{isNow && <small>Now</small>}</div>
            <div className="weather-cell">{weatherLoading ? <span className="skeleton-line" /> : hourWeather ? <><WeatherIcon code={hourWeather.weatherCode} hour={hour} /><div className="weather-copy"><strong>{Math.round(hourWeather.temperature)}°</strong><span>{weatherLabel(hourWeather.weatherCode)}</span></div><div className="weather-meta"><span>{hourWeather.precipitationProbability}% rain</span><span>{Math.round(hourWeather.windSpeed)} mph wind</span></div></> : <span className="muted-copy">No forecast</span>}</div>
            <div className="calendar-cell">{!accessToken ? (hour === 9 && <button className="connect-card" onClick={connectCalendar}><CalendarDays /><span><strong>Connect your calendar</strong><small>See events beside the forecast</small></span></button>) : calendarLoading ? <span className="skeleton-line short" /> : hourEvents.length ? hourEvents.map((event) => <a className="event-card" href={event.htmlLink} target="_blank" rel="noreferrer" key={event.id}><span className="event-bar" /><span><strong>{event.summary || "Untitled event"}</strong><small>{eventTime(event)}</small></span></a>) : <span className="open-hour">Open</span>}</div>
          </article>;
        })}</div>
      </section>
      <footer><span>Weather data by Open-Meteo</span><span>Your Calendar access stays in this session.</span></footer>
    </main>
  );
}
