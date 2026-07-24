// Pure CSV serialization for the admin users table export. Mirrors the table's
// visible columns ("export what you see"). Kept free of React/DOM so it can be
// unit tested in isolation (see user-csv.test.ts). The actual file download is
// done by the caller.

export interface UserCsvRow {
  name: string;
  email: string;
  role: string;
  createdAt: string | Date;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  tShirtSize?: string | null;
  exodus90AppId?: string | null;
  onboarded?: boolean;
  lastSeenAt?: string | Date | null;
  lastDocumentEditAt?: string | Date | null;
  languages: { language: { id: string; name: string } }[];
}

export interface CsvColumn {
  id: string;
  label: string;
}

/**
 * Resolves a single table column to a flat string for one user. Unknown column
 * ids (e.g. the actions column) resolve to an empty string.
 */
export function userCsvValue(user: UserCsvRow, columnId: string): string {
  switch (columnId) {
    case 'name':
      return user.name;
    case 'email':
      return user.email;
    case 'role':
      return user.role;
    case 'languages':
      return user.languages.map((ul) => ul.language.name).join('; ');
    case 'createdAt':
      // ISO date (UTC) keeps the export unambiguous across locales/spreadsheets.
      return new Date(user.createdAt).toISOString().slice(0, 10);
    case 'address':
      return [user.streetAddress, user.city, user.state, user.zipCode, user.country]
        .filter(Boolean)
        .join(', ');
    case 'tShirtSize':
      return user.tShirtSize ?? '';
    case 'exodus90AppId':
      return user.exodus90AppId ?? '';
    case 'onboarded':
      return user.onboarded ? 'Yes' : 'No';
    case 'lastSeenAt':
      return user.lastSeenAt ? new Date(user.lastSeenAt).toISOString().slice(0, 10) : '';
    case 'lastDocumentEditAt':
      return user.lastDocumentEditAt ? new Date(user.lastDocumentEditAt).toISOString().slice(0, 10) : '';
    default:
      return '';
  }
}

/** Quotes a field when it contains a comma, quote, or newline (RFC 4180). */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Builds a CSV document from the given columns (header order) and users. Uses
 * CRLF line endings for spreadsheet compatibility.
 */
export function buildUserCsv(columns: CsvColumn[], users: UserCsvRow[]): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const rows = users.map((user) =>
    columns.map((c) => escapeCsvField(userCsvValue(user, c.id))).join(','),
  );
  return [header, ...rows].join('\r\n');
}
