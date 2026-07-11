/**
 * RESO Web API types for Bridge Interactive / FMLS integration.
 *
 * Only the ~30 fields Percho actually needs are modeled here. Full RESO
 * Data Dictionary has hundreds of fields — we intentionally do not import
 * them all. See docs/mls-integration/data-model.md for the shortlist and
 * the reasoning.
 *
 * Two shapes are exported:
 *   - `ResoProperty` / `ResoMedia` / `ResoOffice` / `ResoMember` — raw
 *     shapes as returned by the Bridge OData endpoints (PascalCase, RESO
 *     naming).
 *   - `NormalizedListing` — snake_case Percho-app shape suitable for
 *     writing into `mls_listings` and for feeding the address-autofill UI.
 *
 * `normalizeReso()` converts raw → normalized. It does not do IDX
 * filtering (that's the caller's job — see address-autofill.ts).
 */

export interface ResoProperty {
  ListingKey: string;
  ListPrice: number | null;
  StandardStatus: string | null;
  PropertyType: string | null;
  PropertySubType: string | null;
  StreetNumber: string | null;
  StreetName: string | null;
  StreetSuffix: string | null;
  City: string | null;
  StateOrProvince: string | null;
  PostalCode: string | null;
  Latitude: number | null;
  Longitude: number | null;
  BedroomsTotal: number | null;
  BathroomsTotalInteger: number | null;
  LivingArea: number | null;
  LotSizeAcres: number | null;
  YearBuilt: number | null;
  PublicRemarks: string | null;
  ListOfficeName: string | null;
  ListAgentFullName: string | null;
  ListAgentMlsId: string | null;
  DaysOnMarket: number | null;
  ModificationTimestamp: string | null;
  InternetEntireListingDisplayYN: boolean | null;
}

export interface ResoMedia {
  MediaKey: string;
  ResourceRecordKey: string; // ListingKey the media belongs to
  MediaURL: string;
  Order: number | null;
  MediaCategory: string | null;
  ShortDescription: string | null;
  ModificationTimestamp: string | null;
}

export interface ResoOffice {
  OfficeKey: string;
  OfficeName: string | null;
  OfficePhone: string | null;
  OfficeMlsId: string | null;
  ModificationTimestamp: string | null;
}

export interface ResoMember {
  MemberKey: string;
  MemberFullName: string | null;
  MemberMlsId: string | null;
  MemberEmail: string | null;
  MemberOfficeKey: string | null;
  ModificationTimestamp: string | null;
}

/**
 * Percho-app shape. Snake_case, nullable-safe. This is what gets written
 * to Postgres and returned to the address-autofill client. Photo URLs are
 * kept as an ordered array of Bridge CDN URLs (we hotlink for MVP; see
 * README.md for the mirroring decision).
 */
export interface NormalizedListing {
  listing_key: string;
  list_price: number | null;
  standard_status: string | null;
  property_type: string | null;
  property_sub_type: string | null;
  street_number: string | null;
  street_name: string | null;
  street_suffix: string | null;
  city: string | null;
  state_or_province: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms_total: number | null;
  bathrooms_total_integer: number | null;
  living_area: number | null;
  lot_size_acres: number | null;
  year_built: number | null;
  public_remarks: string | null;
  list_office_name: string | null;
  list_agent_full_name: string | null;
  list_agent_mls_id: string | null;
  days_on_market: number | null;
  modification_timestamp: string | null;
  internet_display_allowed: boolean;
  photos: string[];
}

export function normalizeReso(raw: ResoProperty, media: ResoMedia[] = []): NormalizedListing {
  const photos = [...media]
    .sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0))
    .map((m) => m.MediaURL)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);

  return {
    listing_key: raw.ListingKey,
    list_price: raw.ListPrice,
    standard_status: raw.StandardStatus,
    property_type: raw.PropertyType,
    property_sub_type: raw.PropertySubType,
    street_number: raw.StreetNumber,
    street_name: raw.StreetName,
    street_suffix: raw.StreetSuffix,
    city: raw.City,
    state_or_province: raw.StateOrProvince,
    postal_code: raw.PostalCode,
    latitude: raw.Latitude,
    longitude: raw.Longitude,
    bedrooms_total: raw.BedroomsTotal,
    bathrooms_total_integer: raw.BathroomsTotalInteger,
    living_area: raw.LivingArea,
    lot_size_acres: raw.LotSizeAcres,
    year_built: raw.YearBuilt,
    public_remarks: raw.PublicRemarks,
    list_office_name: raw.ListOfficeName,
    list_agent_full_name: raw.ListAgentFullName,
    list_agent_mls_id: raw.ListAgentMlsId,
    days_on_market: raw.DaysOnMarket,
    modification_timestamp: raw.ModificationTimestamp,
    // RESO uses tri-state (true / false / null). Missing → treat as true
    // (default to display allowed) but the IDX filter should still exclude
    // explicit `false`. See compliance-checklist.md.
    internet_display_allowed: raw.InternetEntireListingDisplayYN !== false,
    photos,
  };
}

export interface ODataFilter {
  raw: string; // e.g. "StandardStatus eq 'Active' and City eq 'Atlanta'"
}
