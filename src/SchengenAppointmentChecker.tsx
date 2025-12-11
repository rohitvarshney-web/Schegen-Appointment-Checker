// src/SchengenAppointmentChecker.tsx
import React, { Component, useEffect, useMemo, useState } from "react";

/**
 * Defensive Schengen Appointment Checker with ErrorBoundary
 * - Prevents runtime errors in modal from blanking the entire app
 * - Adds console.debug logs for easier troubleshooting
 */

/* ---------- Demo fallbacks (unchanged) ---------- */
const DEMO_COUNTRIES = [
  { code: "FR", name: "France" },
  { code: "CH", name: "Switzerland" },
  { code: "DE", name: "Germany" },
];

const DEMO_SLOTS: Record<
  string,
  {
    nextDate: string | null;
    isAvailable: boolean;
    cities: { name: string; nextDate: string | null; allDates: string[]; address?: string }[];
    raw: any;
  }
> = {
  FR: {
    nextDate: "2025-12-15",
    isAvailable: true,
    cities: [
      {
        name: "Ahmedabad",
        nextDate: "2025-12-15",
        allDates: ["2025-12-15", "2025-12-16", "2025-12-17"],
        address: "VFS Global Ahmedabad, Some Street, Ahmedabad, 380001",
      },
      {
        name: "Bangalore",
        nextDate: "2025-12-15",
        allDates: ["2025-12-15", "2025-12-18"],
        address: "VFS Bangalore, Address line, Bangalore, 560001",
      },
    ],
    raw: { note: "Demo slots for France used because API could not be reached." },
  },
  CH: {
    nextDate: "2025-12-15",
    isAvailable: true,
    cities: [
      {
        name: "Ahmedabad",
        nextDate: "2025-12-15",
        allDates: ["2025-12-15", "2025-12-20"],
        address: "Switzerland VFS Ahmedabad, Some Street, Ahmedabad, 380001",
      },
      {
        name: "Bangalore",
        nextDate: "2025-12-15",
        allDates: ["2025-12-15", "2025-12-22"],
        address: "Switzerland VFS Bangalore, Address line, Bangalore, 560001",
      },
    ],
    raw: { note: "Demo slots for Switzerland used because API could not be reached." },
  },
};

/* ---------- Types ---------- */
type Country = {
  code: string;
  name: string;
  __raw?: any;
  availableSummary?: any;
};

type SlotSummary = {
  nextDate: string | null;
  isAvailable: boolean;
  cities: { name: string; nextDate: string | null; allDates: string[]; address?: string }[];
  raw?: any;
};

/* ---------- ErrorBoundary ---------- */
class ErrorBoundary extends Component<
  { children: React.ReactNode; name?: string },
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    // log to console so user/developer can paste errors
    console.error("ErrorBoundary caught", this.props.name || "component", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 rounded-md text-red-700">
          <div className="font-semibold">Something went wrong rendering this section.</div>
          <div className="text-xs mt-1">Open Console and paste the error to chat for help.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------- Helper utilities ---------- */

/** Format yyyy-mm-dd or Date string to readable string (e.g. Dec 15, 2025) */
function formatReadable(dateIso: string | null | undefined) {
  if (!dateIso) return null;
  try {
    const d = new Date(dateIso);
    if (isNaN(d.getTime())) return dateIso;
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch (e) {
    return dateIso;
  }
}

/** Build a month grid (weeks) for a given set of iso dates */
function buildMonthGrid(isoDates: string[] = [], focusedIso?: string) {
  try {
    const selected = focusedIso || (isoDates && isoDates[0]) || null;
    const anchor = selected ? new Date(selected) : new Date();
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const availableSet = new Set(
      (isoDates || []).map((d) => {
        try {
          const dd = new Date(d);
          return dd.toISOString().slice(0, 10);
        } catch {
          return d;
        }
      })
    );

    const weeks: string[][] = [];
    let week: string[] = new Array(startDay).fill("");
    for (let day = 1; day <= daysInMonth; day++) {
      week.push(new Date(year, month, day).toISOString().slice(0, 10));
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push("");
      weeks.push(week);
    }

    return { weeks, year, monthIndex: month, availableSet, selectedIso: selected };
  } catch (e) {
    console.error("buildMonthGrid error", e);
    return { weeks: [], year: new Date().getFullYear(), monthIndex: new Date().getMonth(), availableSet: new Set<string>(), selectedIso: null };
  }
}

/* ---------- Component ---------- */
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

  const residence = "IN";
  const citizenship = "IN";
  const pincode = "110001";

  useEffect(() => {
    fetchCountries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchCountries() {
    setLoadingCountryCodes(true);
    setError(null);
    console.debug("fetchCountries start");

    if (typeof fetch === "undefined") {
      setOfflineMode(true);
      setCountries(DEMO_COUNTRIES);
      setFiltered(DEMO_COUNTRIES);
      setLoadingCountryCodes(false);
      setError("Preview mode: showing demo countries.");
      setLastUpdatedAt(new Date());
      return;
    }

    try {
      const url = `https://api.atlys.com/api/v3/countries?citizenship=${citizenship}&residence=${residence}&pincode=${pincode}&isEnterprise=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Countries API returned ${res.status}`);
      const data = await res.json();
      setCountriesRawDebug(data);

      let list: any[] = [];
      if (Array.isArray(data)) list = data;
      else if (data && typeof data === "object") {
        if (Array.isArray(data.countries)) list = data.countries;
        else if (Array.isArray(data.data)) list = data.data;
      }

      const mapped = (list || []).map((c) => ({
        code: c.code || c.iso2_code || c.countryCode || c.alpha2 || c.iso2 || c.iso || c.country_code || "",
        name: c.name || c.countryName || c.label || c.title || "Unknown",
        __raw: c,
        availableSummary: null,
      }));

      setOfflineMode(false);
      setCountries(mapped);
      setFiltered(mapped);
      console.debug("fetchCountries success", mapped.length);
    } catch (err) {
      console.error("fetchCountries error", err);
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
    // skip if already loading same country
    if (loadingSlots === countryCode) return;
    // don't re-fetch if data exists
    if (slotsByCountry[countryCode]) {
      console.debug("slots cached for", countryCode);
      return;
    }

    setLoadingSlots(countryCode);
    setError(null);
    console.debug("fetchSlotsForCountry start", countryCode);

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
            raw: { note: "No demo slots configured for this country in offline mode." },
          },
        }));
      }
      setLoadingSlots("");
      setLastUpdatedAt(new Date());
      console.debug("fetchSlotsForCountry offline fallback", countryCode);
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
        console.warn("Failed to parse slots JSON", jsonErr);
      }
      const summary = extractSummaryFromSlotsData(data);
      const withRaw: SlotSummary = { ...summary, raw: data };
      setSlotsByCountry((s) => ({ ...s, [countryCode]: withRaw }));
      console.debug("fetchSlotsForCountry success", countryCode, withRaw.cities?.length || 0);
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
            raw: { note: "No slots available or API unreachable." },
          },
        }));
      }
    } finally {
      setLoadingSlots("");
      setLastUpdatedAt(new Date());
    }
  }

  function extractSummaryFromSlotsData(data: any): Omit<SlotSummary, "raw"> {
    try {
      let nextDate: string | null = null;
      let cities: any[] = [];
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
          const allDates =
            (Array.isArray(c.actual_dates) && c.actual_dates) ||
            (Array.isArray(c.all_dates) && c.all_dates) ||
            [];
          const address = c.address || c.center_address || c.vfs_address || c.location || null;
          return { name, nextDate: primaryDate, allDates, address };
        });
        nextDate =
          data.earliest_available_date || (cities.find((c) => c.nextDate) || {}).nextDate || null;
        isAvailable = !!cities.length;
        return { nextDate, cities, isAvailable };
      }

      if (data && typeof data === "object") {
        const arrays = Object.values(data).filter((v) => Array.isArray(v));
        if (arrays.length) {
          const arr = arrays[0];
          cities = arr.map((c: any) => {
            const name = c.centre_name_fe || c.centre_name || c.cityName || c.name || c.city || "-";
            const primaryDate =
              c.earliest_date ||
              (Array.isArray(c.actual_dates) && c.actual_dates[0]) ||
              (Array.isArray(c.all_dates) && c.all_dates[0]) ||
              c.nextDate ||
              c.firstAvailable ||
              null;
            const allDates =
              (Array.isArray(c.actual_dates) && c.actual_dates) ||
              (Array.isArray(c.all_dates) && c.all_dates) ||
              [];
            const address = c.address || c.center_address || c.vfs_address || c.location || null;
            return { name, nextDate: primaryDate, allDates, address };
          });
          nextDate = (cities.find((c) => c.nextDate) || {}).nextDate || null;
          isAvailable = !!cities.length;
        }
      }

      return { nextDate, cities, isAvailable };
    } catch (e) {
      console.error("extractSummaryFromSlotsData error", e);
      return { nextDate: null, cities: [], isAvailable: false };
    }
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
        (c) =>
          (c.name || "").toLowerCase().includes(lq) || (c.code || "").toLowerCase().includes(lq)
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

  /* ---------- modal state (calendar view) ---------- */
  const [selectedCityIndex, setSelectedCityIndex] = useState(0);
  const [focusedIsoDate, setFocusedIsoDate] = useState<string | null>(null);

  useEffect(() => {
    setFocusedIsoDate(null);
  }, [selectedCountry?.code, selectedCityIndex]);

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-[#F7F8FA] py-8 px-4">
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
                Check appointment availability across all Schengen countries ex-India. Click any
                country to view centre-wise dates.
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

          {/* filters & actions */}
          <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1">
              <label className="text-[11px] text-slate-500 mb-1 block">Filter by country</label>
              <input
                value={query}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="All Schengen countries"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchCountries}
                className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700"
              >
                ⟳ Refresh
              </button>
            </div>
          </div>

          {/* table */}
          <section className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase">Destination</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase">Next date</th>
                    <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase">Slots available</th>
                    <th className="py-3 px-4 text-right text-[11px] font-semibold uppercase">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingCountryCodes ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 text-sm">
                        Loading countries…
                      </td>
                    </tr>
                  ) : error && !filtered.length ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-red-600 text-sm">{error}</td>
                    </tr>
                  ) : (
                    (filtered || []).map((c) => {
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
                                <span className="text-emerald-600 text-sm font-medium">{formatReadable(slot.nextDate)}</span>
                              ) : (
                                <span className="text-[11px] font-semibold text-red-500">Not available</span>
                              )
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-4 px-4 align-top">
                            {hasData ? (
                              available ? (
                                <div className="text-sm text-emerald-600 font-medium">
                                  {slot.cities?.length || 0} centres
                                </div>
                              ) : (
                                <span className="text-[11px] font-semibold text-red-500">Not Available</span>
                              )
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}

                            {available && cityPreview.length > 0 && (
                              <div className="mt-1 space-y-0.5 text-[11px] text-slate-700">
                                {cityPreview.map((city, idx) => (
                                  <div key={idx}>
                                    <span>{city.name}</span>{" "}
                                    {city.nextDate && <span className="text-emerald-600"> {formatReadable(city.nextDate)}</span>}
                                  </div>
                                ))}
                                {remainingCount > 0 && <div className="text-emerald-600 font-medium">+{remainingCount} more</div>}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-4 align-top text-right">
                            <button
                              onClick={() => {
                                try {
                                  const codeForSlots = code;
                                  console.debug("View clicked for", codeForSlots);
                                  setSelectedCountry({ ...c, code: codeForSlots });
                                  setSelectedCityIndex(0);
                                  // don't await — open modal immediately and load in background
                                  fetchSlotsForCountry(codeForSlots);
                                } catch (e) {
                                  console.error("View button handler failed", e);
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <span role="img" aria-label="calendar">📅</span> View
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {!loadingCountryCodes && (!filtered || filtered.length === 0) && !error && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 text-sm">No countries found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* Modal / drawer: improved two-column calendar + city info */}
      {selectedCountry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="absolute inset-0" onClick={() => setSelectedCountry(null)} />
          <div className="relative w-full max-w-6xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-h-[90vh] overflow-hidden">
            <ErrorBoundary name="Modal">
              <ModalContent
                selectedCountry={selectedCountry}
                slotsByCountry={slotsByCountry}
                loadingSlots={loadingSlots}
                selectedCityIndex={selectedCityIndex}
                setSelectedCityIndex={setSelectedCityIndex}
                focusedIsoDate={focusedIsoDate}
                setFocusedIsoDate={setFocusedIsoDate}
                fetchSlotsForCountry={fetchSlotsForCountry}
                formatReadable={formatReadable}
                extractAddress={extractAddress}
                getCountryCode={getCountryCode}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- ModalContent as separate functional component (defensive) ---------- */
function ModalContent(props: {
  selectedCountry: Country;
  slotsByCountry: Record<string, SlotSummary>;
  loadingSlots: string;
  selectedCityIndex: number;
  setSelectedCityIndex: (idx: number) => void;
  focusedIsoDate: string | null;
  setFocusedIsoDate: (d: string | null) => void;
  fetchSlotsForCountry: (code: string | null) => Promise<void>;
  formatReadable: (d: string | null | undefined) => string | null;
  extractAddress: (city: any, slot: any) => string | null;
  getCountryCode: (obj: any) => string;
}) {
  const {
    selectedCountry,
    slotsByCountry,
    loadingSlots,
    selectedCityIndex,
    setSelectedCityIndex,
    focusedIsoDate,
    setFocusedIsoDate,
    fetchSlotsForCountry,
    formatReadable,
    extractAddress,
    getCountryCode,
  } = props;

  // defensive local helpers
  const code = getCountryCode(selectedCountry) || selectedCountry.code || "";
  const slot = slotsByCountry[code] || null;

  useEffect(() => {
    // if modal opens and we have no slot data, start fetch
    if (!slot && code) {
      try {
        fetchSlotsForCountry(code);
      } catch (e) {
        console.error("ModalContent fetchSlotsForCountry threw", e);
      }
    }
  }, [code]); // eslint-disable-line

  // avoid exceptions when slot or cities missing
  const cities = (slot && Array.isArray(slot.cities) ? slot.cities : []) as any[];
  const activeCity = cities[selectedCityIndex] || cities[0] || null;
  const datesForActiveCity = activeCity
    ? (Array.isArray(activeCity.allDates) && activeCity.allDates.length ? activeCity.allDates : activeCity.nextDate ? [activeCity.nextDate] : [])
    : [];

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.16em] text-slate-400 uppercase">Appointment calendar</div>
          <h2 className="mt-1 text-xl md:text-2xl font-semibold text-slate-900">
            {selectedCountry.name} {slot && slot.isAvailable ? "— Available" : ""}
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Select an application centre and an available date to book your appointment.
          </p>
        </div>
        <div>
          <button className="rounded-full px-3 py-1 text-slate-500 hover:bg-slate-100 text-sm" onClick={() => {}}>
            {/* Close button handled by parent overlay */}
            ✕
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr,1.4fr] gap-6 mt-2">
        {/* Left: Centers list */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Application Centres</h3>
            <div className="text-xs text-slate-500">
              {slot ? `${cities.length} centres` : loadingSlots === code ? "Loading…" : "—"}
            </div>
          </div>

          <div className="space-y-2 overflow-y-auto text-sm max-h-72 pr-1">
            {loadingSlots === code ? (
              <div className="py-8 text-center text-slate-500">Loading slots…</div>
            ) : !slot ? (
              <div className="py-6 text-center text-slate-500">
                No slot data available yet. Click <strong>Refresh</strong> or try again.
              </div>
            ) : (
              cities.map((city: any, idx: number) => {
                const isActive = idx === selectedCityIndex;
                const count = (city.allDates && city.allDates.length) || (city.nextDate ? 1 : 0);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedCityIndex(idx);
                      setFocusedIsoDate(null);
                    }}
                    className={`w-full text-left rounded-2xl px-3 py-2 border text-xs md:text-sm transition ${isActive ? "border-indigo-500 bg-white text-slate-900 shadow-sm" : "border-transparent bg-transparent text-slate-700 hover:bg-white"}`}
                  >
                    <div className="flex justify-between">
                      <div className="font-medium">{city.name}</div>
                      <div className="text-[11px] text-slate-500">{count} dates</div>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {city.nextDate ? formatReadable(city.nextDate) : "No dates yet"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Calendar + City info */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col">
          {loadingSlots === code ? (
            <div className="py-12 text-center text-slate-500">Loading calendar…</div>
          ) : !slot ? (
            <div className="py-12 text-center text-slate-500">No appointment data yet. Try refreshing slots.</div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{activeCity?.name || "Available Dates"}</h3>
                  {activeCity?.nextDate && <div className="text-[11px] text-slate-500">Earliest: {formatReadable(activeCity.nextDate)}</div>}
                </div>
                <div className="text-[11px] text-slate-500">Country: {selectedCountry.name}</div>
              </div>

              <div className="mb-3">
                <CalendarGrid
                  dates={datesForActiveCity}
                  focusedIso={focusedIsoDate || undefined}
                  onPick={(iso) => setFocusedIsoDate(iso)}
                />
              </div>

              <div className="mt-auto border-t border-slate-100 pt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-xs md:text-sm text-slate-700">
                  <div className="font-medium">Selected Appointment Date</div>
                  <div className="mt-0.5">{formatReadable(focusedIsoDate || (datesForActiveCity[0] || null)) || "No date selected"}</div>
                  {activeCity && <div className="text-[11px] text-slate-500 mt-0.5">Location: {activeCity.name}</div>}
                </div>

                <div className="flex flex-col md:flex-row gap-2 md:items-center">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    onClick={() => {
                      const list = datesForActiveCity || [];
                      if (!list.length) return;
                      const current = focusedIsoDate || list[0];
                      const idx = list.indexOf(current as string);
                      const prev = list[idx - 1];
                      if (prev) setFocusedIsoDate(prev);
                    }}
                    disabled={!datesForActiveCity.length}
                  >
                    Previous Slot
                  </button>

                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    onClick={() => {
                      const list = datesForActiveCity || [];
                      if (!list.length) return;
                      const current = focusedIsoDate || list[0];
                      const idx = list.indexOf(current as string);
                      const next = list[idx + 1];
                      if (next) setFocusedIsoDate(next);
                    }}
                    disabled={!datesForActiveCity.length}
                  >
                    Next Slot
                  </button>

                  <button
                    type="button"
                    className="rounded-full bg-indigo-600 px-4 py-2 text-xs md:text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-40"
                    disabled={!datesForActiveCity.length}
                    onClick={() => {
                      // Place-holder booking action
                      console.debug("Book appointment", {
                        country: selectedCountry.name,
                        countryCode: code,
                        center: activeCity?.name,
                        date: focusedIsoDate || (datesForActiveCity[0] || null),
                      });
                      alert("Booking flow placeholder — integrate your booking endpoint here.");
                    }}
                  >
                    Book This Appointment
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-slate-500">Application center address</div>
                    <div className="mt-1 font-medium text-slate-900">{activeCity?.name || "—"}</div>
                    <div className="text-[13px] text-slate-700 mt-1">
                      {extractAddress(activeCity, slot) || <span className="text-[11px] text-slate-500">Address not available in API</span>}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 text-right">
                    <div>VFS / BLS</div>
                    <div className="mt-1">Mon - Fri</div>
                    <div className="mt-1">09:30 - 16:30</div>
                  </div>
                </div>

                <details className="mt-3 text-[11px] text-slate-500">
                  <summary className="cursor-pointer">Raw API snippet</summary>
                  <pre className="mt-2 max-h-28 overflow-auto rounded-lg bg-white p-2 text-[11px]">
                    {JSON.stringify(slot?.raw || {}, null, 2)}
                  </pre>
                </details>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- Helper components (CalendarGrid) ---------- */

function CalendarGrid({
  dates,
  focusedIso,
  onPick,
}: {
  dates: string[];
  focusedIso?: string | null;
  onPick: (iso: string) => void;
}) {
  try {
    const anchorIso = focusedIso || (dates && dates[0]) || null;
    const anchorDate = anchorIso ? new Date(anchorIso) : new Date();
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();

    const monthDates = (dates || []).filter((d) => {
      try {
        const dd = new Date(d);
        return dd.getFullYear() === year && dd.getMonth() === month;
      } catch {
        return false;
      }
    });

    const { weeks, availableSet, selectedIso } = buildMonthGrid(monthDates, anchorIso || undefined);
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <div>
        <div className="mb-2 text-xs text-slate-600 font-medium">
          {anchorDate.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="grid grid-cols-7 gap-2 text-xs">
          {weekdays.map((w) => (
            <div key={w} className="text-[11px] text-slate-400 text-center font-medium">
              {w}
            </div>
          ))}
          {weeks.map((week, i) =>
            week.map((iso, j) => {
              if (!iso) {
                return <div key={`${i}-${j}`} className="h-10" />;
              }
              const available = availableSet.has(iso);
              const isSelected = iso === selectedIso;
              return (
                <button
                  key={`${i}-${j}`}
                  onClick={() => available && onPick(iso)}
                  className={`h-10 rounded-lg text-[13px] transition flex items-center justify-center ${
                    available ? (isSelected ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 hover:bg-indigo-50") : "bg-slate-50 text-slate-300"
                  }`}
                >
                  <div className="text-center">
                    <div>{new Date(iso).getDate()}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  } catch (e) {
    console.error("CalendarGrid render error", e);
    return <div className="text-sm text-red-600">Calendar error — check console</div>;
  }
}

/* ---------- Small utility to extract address from various payload shapes ---------- */
function extractAddress(city: any, slot: any) {
  try {
    if (city && (city.address || city.vfs_address)) return city.address || city.vfs_address;

    if (slot && slot.raw) {
      const raw = slot.raw;
      const arrays = Object.values(raw).filter((v) => Array.isArray(v));
      for (const arr of arrays) {
        for (const c of arr as any[]) {
          const nameMatch =
            (c.centre_name && city && city.name && c.centre_name.toLowerCase().includes(city.name.toLowerCase())) ||
            (c.cityName && city && city.name && c.cityName.toLowerCase().includes(city.name.toLowerCase()));
          const addr = c.address || c.center_address || c.vfs_address || c.location || c.address_text || c.address_line;
          if ((nameMatch || !city) && addr) return addr;
        }
      }
    }

    if (slot && slot.raw) {
      if (slot.raw.address) return slot.raw.address;
      if (slot.raw.contact && typeof slot.raw.contact === "string") return slot.raw.contact;
    }

    return null;
  } catch (e) {
    console.error("extractAddress error", e);
    return null;
  }
}
