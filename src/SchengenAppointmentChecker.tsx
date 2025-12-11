/* SchengenAppointmentChecker.tsx
   Vite + React + TS + Tailwind component.
   Uses Atlys APIs with offline/demo fallback.
*/

import React, { useEffect, useMemo, useState } from "react";

const DEMO_COUNTRIES = [
  { code: "FR", name: "France" },
  { code: "CH", name: "Switzerland" },
  { code: "DE", name: "Germany" }
];

const DEMO_SLOTS: Record<
  string,
  {
    nextDate: string | null;
    isAvailable: boolean;
    cities: { name: string; nextDate: string | null; allDates: string[] }[];
    raw: any;
  }
> = {
  FR: {
    nextDate: "December 15, 2025",
    isAvailable: true,
    cities: [
      {
        name: "Ahmedabad",
        nextDate: "December 15, 2025",
        allDates: ["December 15, 2025", "December 16, 2025", "December 17, 2025"]
      },
      {
        name: "Bangalore",
        nextDate: "December 15, 2025",
        allDates: ["December 15, 2025", "December 18, 2025"]
      }
    ],
    raw: { note: "Demo slots for France used because API could not be reached." }
  },
  CH: {
    nextDate: "December 15, 2025",
    isAvailable: true,
    cities: [
      {
        name: "Ahmedabad",
        nextDate: "December 15, 2025",
        allDates: ["December 15, 2025", "December 20, 2025"]
      },
      {
        name: "Bangalore",
        nextDate: "December 15, 2025",
        allDates: ["December 15, 2025", "December 22, 2025"]
      }
    ],
    raw: { note: "Demo slots for Switzerland used because API could not be reached." }
  }
};

type Country = {
  code: string;
  name: string;
  __raw?: any;
  availableSummary?: any;
};

type SlotSummary = {
  nextDate: string | null;
  isAvailable: boolean;
  cities: { name: string; nextDate: string | null; allDates: string[] }[];
  raw?: any;
};

export default function SchengenAppointmentChecker() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [filtered, setFiltered] = useState<Country[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [slotsByCountry, setSlotsByCountry] = useState<Record<string, SlotSummary>>({});
  const [loadingCountryCodes, setLoadingCountryCodes] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [countriesRawDebug, setCountriesRawDebug] = useState<any>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [selectedCityIndex, setSelectedCityIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const residence = "IN";
  const citizenship = "IN";
  const pincode = "110001";

  useEffect(() => {
    fetchCountries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedCityIndex(0);
    setSelectedDate(null);
  }, [selectedCountry?.code]);

  async function fetchCountries() {
    setLoadingCountryCodes(true);
    setError(null);

    if (typeof fetch === "undefined") {
      setOfflineMode(true);
      setCountries(DEMO_COUNTRIES);
      setFiltered(DEMO_COUNTRIES);
      setLoadingCountryCodes(false);
      setError("Running in preview mode. Showing demo countries.");
      setLastUpdatedAt(new Date());
      return;
    }

    try {
      const url = `https://api.atlys.com/api/v3/countries?citizenship=${citizenship}&residence=${residence}&pincode=${pincode}&isEnterprise=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Countries API returned ${res.status}`);

      let data: any = null;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.error("Failed to parse countries JSON", jsonErr);
      }

      setCountriesRawDebug(data);

      let list: any[] = [];
      if (Array.isArray(data)) list = data;
      else if (data && typeof data === "object") {
        if (Array.isArray((data as any).countries)) list = (data as any).countries;
        else if (Array.isArray((data as any).data)) list = (data as any).data;
      }

      const mapped: Country[] = list.map((c) => ({
        code:
          c.code ||
          c.iso2_code ||
          c.countryCode ||
          c.alpha2 ||
          c.iso2 ||
          c.iso ||
          c.country_code ||
          "",
        name: c.name || c.countryName || c.label || c.title || "Unknown",
        __raw: c,
        availableSummary: null
      }));

      setOfflineMode(false);
      setCountries(mapped);
      setFiltered(mapped);
    } catch (err) {
      console.error("Countries fetch failed", err);
      setOfflineMode(true);
      setError("Could not reach Atlys countries API. Showing demo data.");
      setCountries(DEMO_COUNTRIES);
      setFiltered(DEMO_COUNTRIES);
    } finally {
      setLoadingCountryCodes(false);
      setLastUpdatedAt(new Date());
    }
  }

  async function fetchSlotsForCountry(countryCode: string | undefined | null) {
    if (!countryCode) return;
    if (slotsByCountry[countryCode]) return;

    setLoadingSlots(countryCode);
    setError(null);

    if (offlineMode || typeof fetch === "undefined") {
      if (DEMO_SLOTS[countryCode]) {
        setSlotsByCountry((s) => ({ ...s, [countryCode]: DEMO_SLOTS[countryCode] }));
      } else {
        setSlotsByCountry((s) => ({
          ...s,
          [countryCode]: {
            nextDate: null,
            isAvailable: false,
            cities: [],
            raw: { note: "No demo slots configured for this country in offline mode." }
          }
        }));
      }
      setLoadingSlots("");
      setLastUpdatedAt(new Date());
      return;
    }

    try {
      const url = `https://api.atlys.com/api/v2/application/slots/${encodeURIComponent(
        countryCode
      )}?residence=${residence}&citizenship=${citizenship}&purpose=atlys_black&travellersCount=1&withAllSlots=true&getCitiesWiseSlots=true`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Slots API returned ${res.status}`);

      let data: any = null;
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.error("Failed to parse slots JSON", jsonErr);
      }

      const summary = extractSummaryFromSlotsData(data);
      const withRaw: SlotSummary = { ...summary, raw: data };
      setSlotsByCountry((s) => ({ ...s, [countryCode]: withRaw }));
    } catch (err) {
      console.error("Slots fetch failed", err);
      setError(`Could not reach Atlys slots API for ${countryCode}.`);
      if (DEMO_SLOTS[countryCode]) {
        setSlotsByCountry((s) => ({ ...s, [countryCode]: DEMO_SLOTS[countryCode] }));
      } else {
        setSlotsByCountry((s) => ({
          ...s,
          [countryCode]: {
            nextDate: null,
            isAvailable: false,
            cities: [],
            raw: { note: "No slots available or API unreachable." }
          }
        }));
      }
    } finally {
      setLoadingSlots("");
      setLastUpdatedAt(new Date());
    }
  }

  function extractSummaryFromSlotsData(data: any): Omit<SlotSummary, "raw"> {
    let nextDate: string | null = null;
    let cities: { name: string; nextDate: string | null; allDates: string[] }[] = [];
    let isAvailable = false;

    if (!data) return { nextDate, cities, isAvailable };

    if (Array.isArray(data.centre_dates)) {
      cities = data.centre_dates.map((c: any) => {
        const name = c.centre_name_fe || c.centre_name || c.cityName || c.name || c.city || "-";
        const primaryDate =
          c.earliest_date ||
          (Array.isArray(c.actual_dates) && c.actual_dates[0]) ||
          (Array.isArray(c.all_dates) && c.all_dates[0]) ||
          c.nextDate ||
          c.firstAvailable ||
          null;
        const allDates: string[] =
          (Array.isArray(c.actual_dates) && c.actual_dates) ||
          (Array.isArray(c.all_dates) && c.all_dates) ||
          [];
        return { name, nextDate: primaryDate, allDates };
      });

      nextDate =
        (data as any).earliest_available_date ||
        (cities.find((c) => c.nextDate) || {}).nextDate ||
        null;
      isAvailable = !!cities.length;
      return { nextDate, cities, isAvailable };
    }

    if (Array.isArray(data)) {
      cities = data.map((c: any) => ({
        name: c.centre_name_fe || c.centre_name || c.cityName || c.name || c.city || "-",
        nextDate:
          c.earliest_date ||
          (Array.isArray(c.actual_dates) && c.actual_dates[0]) ||
          (Array.isArray(c.all_dates) && c.all_dates[0]) ||
          c.nextDate ||
          c.firstAvailable ||
          null,
        allDates:
          (Array.isArray(c.actual_dates) && c.actual_dates) ||
          (Array.isArray(c.all_dates) && c.all_dates) ||
          []
      }));
      nextDate = (cities.find((c) => c.nextDate) || {}).nextDate || null;
      isAvailable = !!cities.length;
      return { nextDate, cities, isAvailable };
    }

    if (
      data &&
      typeof data.message === "string" &&
      data.message.toLowerCase().includes("not available")
    ) {
      return { nextDate: null, cities: [], isAvailable: false };
    }

    if (data && typeof data === "object") {
      const arrays = Object.values(data).filter((v) => Array.isArray(v)) as any[];
      if (arrays.length) {
        const arr = arrays[0];
        cities = arr.map((c: any) => ({
          name: c.centre_name_fe || c.centre_name || c.cityName || c.name || c.city || "-",
          nextDate:
            c.earliest_date ||
            (Array.isArray(c.actual_dates) && c.actual_dates[0]) ||
            (Array.isArray(c.all_dates) && c.all_dates[0]) ||
            c.nextDate ||
            c.firstAvailable ||
            null,
          allDates:
            (Array.isArray(c.actual_dates) && c.actual_dates) ||
            (Array.isArray(c.all_dates) && c.all_dates) ||
            []
        }));
        nextDate = (cities.find((c) => c.nextDate) || {}).nextDate || null;
        isAvailable = !!cities.length;
      }
    }

    return { nextDate, cities, isAvailable };
  }

  function getCountryCode(obj: Country | any): string {
    if (!obj) return "";
    return (
      obj.code ||
      obj.iso2_code ||
      (obj.__raw &&
        (obj.__raw.iso2_code || obj.__raw.iso2 || obj.__raw.code || obj.__raw.countryCode)) ||
      obj.countryCode ||
      obj.alpha2 ||
      obj.iso ||
      ""
    );
  }

  function onSearch(q: string) {
    setQuery(q);
    if (!q) return setFiltered(countries);
    const lq = q.toLowerCase();
    setFiltered(
      countries.filter(
        (c) => (c.name || "").toLowerCase().includes(lq) || (c.code || "").toLowerCase().includes(lq)
      )
    );
  }

  const stats = useMemo(() => {
    const withSlots = Object.values(slotsByCountry).filter((s) => s?.isAvailable).length;

    let earliest: string | null = null;
    let mostCode: string | null = null;
    let mostCount = 0;

    Object.entries(slotsByCountry).forEach(([code, s]) => {
      if (!s) return;
      if (s.nextDate && !earliest) earliest = s.nextDate;
      const count = (s.cities && s.cities.length) || 0;
      if (count > mostCount) {
        mostCount = count;
        mostCode = code;
      }
    });

    const mostCountryName = countries.find((c) => c.code === mostCode)?.name || null;

    return { total: countries.length, withSlots, earliest, mostCountryName };
  }, [countries, slotsByCountry]);

  const lastUpdatedLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const activeModalData = (() => {
    if (!selectedCountry) return null;
    const code = getCountryCode(selectedCountry) || selectedCountry.code;
    const slot = slotsByCountry[code];
    if (!slot) return null;
    const cities = slot.cities || [];
    const activeCity = cities[selectedCityIndex] || cities[0];
    const datesForActiveCity = activeCity
      ? activeCity.allDates && activeCity.allDates.length
        ? activeCity.allDates
        : activeCity.nextDate
        ? [activeCity.nextDate]
        : []
      : [];

    const effectiveSelectedDate =
      selectedDate && datesForActiveCity.includes(selectedDate) ? selectedDate : datesForActiveCity[0] || null;

    return { code, slot, cities, activeCity, datesForActiveCity, effectiveSelectedDate };
  })();

  function changeSelectedDate(direction: 1 | -1) {
    if (!activeModalData) return;
    const { datesForActiveCity, effectiveSelectedDate } = activeModalData;
    if (!datesForActiveCity.length || !effectiveSelectedDate) return;
    const idx = datesForActiveCity.indexOf(effectiveSelectedDate);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= datesForActiveCity.length) return;
    setSelectedDate(datesForActiveCity[nextIdx]);
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] py-8 px-4">
      <div className="mx-auto max-w-6xl">
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8">
          <header className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">
                Schengen Overview
              </div>
              <h1 className="mt-1 text-2xl md:text-3xl font-semibold text-slate-900">
                Schengen Visa Appointment Availability
              </h1>
              <p className="mt-1 text-xs md:text-sm text-slate-500">
                Check appointment availability across all Schengen countries ex-India. Click any country to view centre-wise dates.
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500 space-y-0.5">
              <div>
                Residence: <span className="font-semibold text-slate-800">{residence}</span>
              </div>
              <div>
                Citizenship: <span className="font-semibold text-slate-800">{citizenship}</span>
              </div>
              <div>
                Last updated: <span className="font-semibold text-slate-800">{lastUpdatedLabel}</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 md:gap-4 mb-7">
            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Countries with appointments</div>
              <div className="mt-2 flex items-baseline gap-1">
                <div className="text-xl font-semibold text-slate-900">
                  {stats.withSlots}
                  <span className="text-sm text-slate-400">/{stats.total}</span>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-emerald-600">
                {stats.total ? Math.round((stats.withSlots / stats.total) * 100) : 0}% coverage
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Earliest available date</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{stats.earliest || "—"}</div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Most available country</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{stats.mostCountryName || "—"}</div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Raw country data</div>
              <div className="mt-2 text-[11px] text-slate-500">{offlineMode ? "Demo data" : "Live from Atlys API"}</div>
            </div>
          </div>

          <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1 flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-slate-500 mb-1 block">Filter by country</label>
                <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="All Schengen countries"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-slate-500 mb-1 block">Filter by city (coming soon)</label>
                <div className="relative">
                  <input disabled placeholder="All appointment centres" className="w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400" />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">▼</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchCountries} className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700">⟳ Refresh</button>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold tracking-[0.14em] uppercase">Destination</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold tracking-[0.14em] uppercase">Next date</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold tracking-[0.14em] uppercase">Slots available</th>
                    <th className="py-3 px-4 text-right text-[11px] font-semibold tracking-[0.14em] uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCountryCodes ? (
                    <tr><td colSpan={4} className="py-8 text-center text-slate-500 text-sm">Loading countries…</td></tr>
                  ) : error && !filtered.length ? (
                    <tr><td colSpan={4} className="py-8 text-center text-red-600 text-sm">{error}</td></tr>
                  ) : (
                    filtered.map((c) => {
                      const code = getCountryCode(c) || c.code;
                      const slot = slotsByCountry[code];
                      const hasData = !!slot;
                      const available = slot?.isAvailable && (slot.cities?.length || 0) > 0;
                      const cityPreview = slot?.cities ? slot.cities.slice(0, 2) : [];
                      const remainingCount = slot?.cities ? slot.cities.length - cityPreview.length : 0;

                      return (
                        <tr key={code || c.name} className="border-t border-slate-100 hover:bg-slate-50/70">
                          <td className="py-4 px-4 align-top">
                            <div className="text-sm font-medium text-slate-900">{c.name}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">Code: {code || "—"}</div>
                          </td>
                          <td className="py-4 px-4 align-top">
                            {hasData ? (
                              available && slot.nextDate ? (
                                <button type="button" className="text-emerald-600 text-sm font-medium hover:underline">{slot.nextDate}</button>
                              ) : (<span className="text-[11px] font-semibold text-red-500">Not available</span>)
                            ) : (<span className="text-[11px] text-slate-400">—</span>)}
                          </td>
                          <td className="py-4 px-4 align-top">
                            {hasData ? (
                              available ? (<div className="text-sm text-emerald-600 font-medium">{slot.cities?.length || 0} of {slot.cities?.length || 0} cities</div>)
                              : (<span className="text-[11px] font-semibold text-red-500">Not Available</span>)
                            ) : (<span className="text-[11px] text-slate-400">—</span>)}

                            {available && cityPreview.length > 0 && (
                              <div className="mt-1 space-y-0.5 text-[11px] text-slate-700">
                                {cityPreview.map((city, idx) => (
                                  <div key={idx}>
                                    <span>{city.name}</span>{" "}
                                    {city.nextDate && (<button type="button" className="text-emerald-600 hover:underline">{city.nextDate}</button>)}
                                  </div>
                                ))}
                                {remainingCount > 0 && (<div className="text-emerald-600 font-medium">+{remainingCount} more</div>)}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4 align-top text-right">
                            <button onClick={async () => {
                              const codeForSlots = code;
                              setSelectedCountry({ ...c, code: codeForSlots });
                              await fetchSlotsForCountry(codeForSlots);
                            }} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                              <span role="img" aria-label="calendar">📅</span> View
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {!loadingCountryCodes && !filtered.length && !error && (
                    <tr><td colSpan={4} className="py-8 text-center text-slate-500 text-sm">No countries found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {countriesRawDebug && (
            <details className="mt-4 text-[11px] text-slate-500">
              <summary className="cursor-pointer">Country API debug</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-100 p-2 text-[10px]">
                {JSON.stringify(Array.isArray(countriesRawDebug) ? countriesRawDebug.slice(0, 2) : Array.isArray(countriesRawDebug.countries) ? countriesRawDebug.countries.slice(0, 2) : countriesRawDebug, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {selectedCountry && activeModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setSelectedCountry(null)} />
            <div className="relative w-full max-w-5xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-hidden">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">Appointment calendar</div>
                  <h2 className="mt-1 text-xl md:text-2xl font-semibold text-slate-900">{selectedCountry.name} Visa Appointments</h2>
                  <p className="text-xs md:text-sm text-slate-500 mt-1">Select an application center and available date to book your appointment.</p>
                </div>
                <button className="rounded-full px-3 py-1 text-slate-500 hover:bg-slate-100 text-sm" onClick={() => setSelectedCountry(null)}>✕</button>
              </div>

              <div className="grid md:grid-cols-[1.2fr,1.4fr] gap-6 mt-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">Application Centers</h3>
                  <div className="text-xs text-slate-500 mb-2">{activeModalData.cities.length ? `${activeModalData.cities.length} centers` : "No center-level data available."}</div>
                  <div className="space-y-2 overflow-y-auto text-sm max-h-64 pr-1">
                    {activeModalData.cities.length ? activeModalData.cities.map((city, idx) => {
                      const isActive = idx === selectedCityIndex;
                      const count = city.allDates?.length || (city.nextDate ? 1 : 0);
                      return (
                        <button key={idx} type="button" onClick={() => { setSelectedCityIndex(idx); setSelectedDate(null); }}
                          className={`w-full text-left rounded-2xl px-3 py-2 border text-xs md:text-sm transition ${isActive ? "border-indigo-500 bg-white text-slate-900 shadow-sm" : "border-transparent bg-transparent text-slate-700 hover:bg-white"}`}>
                          <div className="font-medium">{city.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{count ? `${count} available dates` : "No dates available"}</div>
                        </button>
                      );
                    }) : (<div className="text-xs text-slate-500">No application centers provided in API response.</div>)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{activeModalData.activeCity?.name || "Available Dates"}</h3>
                      {activeModalData.activeCity?.nextDate && (<div className="text-[11px] text-slate-500 mt-0.5">Earliest: {activeModalData.activeCity.nextDate}</div>)}
                    </div>
                    <div className="text-[11px] text-slate-500">Country: {selectedCountry.name}</div>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs mb-4 max-h-40 overflow-y-auto">
                      {activeModalData.datesForActiveCity.length ? activeModalData.datesForActiveCity.map((d) => {
                        const isSelected = d === activeModalData.effectiveSelectedDate;
                        return (<button key={d} type="button" onClick={() => setSelectedDate(d)} className={`rounded-xl border px-2 py-1 text-[11px] sm:text-xs transition ${isSelected ? "border-indigo-500 bg-white text-slate-900 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-300"}`}>{d}</button>);
                      }) : (<div className="col-span-full text-xs text-slate-500">No dates available for this center.</div>)}
                    </div>

                    <div className="mt-auto border-t border-slate-200 pt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="text-xs md:text-sm text-slate-700">
                        <div className="font-medium">Selected Appointment Date</div>
                        <div className="mt-0.5">{activeModalData.effectiveSelectedDate || "No date selected"}</div>
                        {activeModalData.activeCity && (<div className="text-[11px] text-slate-500 mt-0.5">Location: {activeModalData.activeCity.name}</div>)}
                      </div>
                      <div className="flex flex-col md:flex-row gap-2 md:items-center">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => changeSelectedDate(-1)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={!activeModalData.datesForActiveCity.length}>Previous Slot</button>
                          <button type="button" onClick={() => changeSelectedDate(1)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={!activeModalData.datesForActiveCity.length}>Next Slot</button>
                        </div>
                        <button type="button" className="rounded-full bg-indigo-600 px-4 py-2 text-xs md:text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-40" disabled={!activeModalData.effectiveSelectedDate} onClick={() => {
                          console.log("Book appointment", {
                            country: selectedCountry.name,
                            countryCode: getCountryCode(selectedCountry),
                            center: activeModalData.activeCity?.name,
                            date: activeModalData.effectiveSelectedDate
                          });
                        }}>
                          Book This Appointment
                        </button>
                      </div>
                    </div>

                    <details className="mt-4 text-[11px] text-slate-500">
                      <summary className="cursor-pointer">Raw API response</summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-100 p-2 text-[10px]">{JSON.stringify(activeModalData.slot.raw, null, 2)}</pre>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="mt-4 text-center text-[11px] text-slate-400">Internal tool · Data via Atlys APIs</footer>
      </div>
    </div>
  );
}
