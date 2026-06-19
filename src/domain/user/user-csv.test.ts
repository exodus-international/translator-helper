import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  userCsvValue,
  escapeCsvField,
  buildUserCsv,
  type UserCsvRow,
} from './user-csv';

function makeUser(overrides: Partial<UserCsvRow> = {}): UserCsvRow {
  return {
    name: 'Anna Horak',
    email: 'anna@example.org',
    role: 'USER',
    createdAt: new Date('2026-01-15T09:30:00.000Z'),
    streetAddress: 'Main St 1',
    city: 'Prague',
    state: null,
    zipCode: '11000',
    country: 'Czechia',
    tShirtSize: 'M',
    exodus90AppId: 'app-123',
    onboarded: true,
    languages: [{ language: { id: 'cs', name: 'Czech' } }],
    ...overrides,
  };
}

describe('userCsvValue', () => {
  it('returns plain fields directly', () => {
    const u = makeUser();
    assert.equal(userCsvValue(u, 'name'), 'Anna Horak');
    assert.equal(userCsvValue(u, 'email'), 'anna@example.org');
    assert.equal(userCsvValue(u, 'role'), 'USER');
    assert.equal(userCsvValue(u, 'tShirtSize'), 'M');
    assert.equal(userCsvValue(u, 'exodus90AppId'), 'app-123');
  });

  it('joins multiple language names', () => {
    const u = makeUser({
      languages: [
        { language: { id: 'cs', name: 'Czech' } },
        { language: { id: 'de', name: 'German' } },
      ],
    });
    assert.equal(userCsvValue(u, 'languages'), 'Czech; German');
  });

  it('composes the address from non-empty parts', () => {
    assert.equal(userCsvValue(makeUser(), 'address'), 'Main St 1, Prague, 11000, Czechia');
  });

  it('formats createdAt as an ISO date', () => {
    assert.equal(userCsvValue(makeUser(), 'createdAt'), '2026-01-15');
  });

  it('renders onboarded as Yes/No', () => {
    assert.equal(userCsvValue(makeUser({ onboarded: true }), 'onboarded'), 'Yes');
    assert.equal(userCsvValue(makeUser({ onboarded: false }), 'onboarded'), 'No');
  });

  it('renders null optional fields as empty strings', () => {
    const u = makeUser({ tShirtSize: null, exodus90AppId: null });
    assert.equal(userCsvValue(u, 'tShirtSize'), '');
    assert.equal(userCsvValue(u, 'exodus90AppId'), '');
  });

  it('returns empty string for unknown columns', () => {
    assert.equal(userCsvValue(makeUser(), 'actions'), '');
  });
});

describe('escapeCsvField', () => {
  it('leaves plain values untouched', () => {
    assert.equal(escapeCsvField('Prague'), 'Prague');
  });

  it('quotes values containing a comma', () => {
    assert.equal(escapeCsvField('Main St 1, Prague'), '"Main St 1, Prague"');
  });

  it('escapes embedded quotes by doubling them', () => {
    assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  });

  it('quotes values containing newlines', () => {
    assert.equal(escapeCsvField('line1\nline2'), '"line1\nline2"');
  });
});

describe('buildUserCsv', () => {
  const columns = [
    { id: 'name', label: 'Name' },
    { id: 'tShirtSize', label: 'T-Shirt' },
    { id: 'address', label: 'Address' },
  ];

  it('emits a header row followed by one row per user with CRLF endings', () => {
    const csv = buildUserCsv(columns, [makeUser()]);
    assert.equal(
      csv,
      'Name,T-Shirt,Address\r\nAnna Horak,M,"Main St 1, Prague, 11000, Czechia"',
    );
  });

  it('escapes a name containing a comma', () => {
    const csv = buildUserCsv([{ id: 'name', label: 'Name' }], [makeUser({ name: 'Horak, Anna' })]);
    assert.equal(csv, 'Name\r\n"Horak, Anna"');
  });

  it('emits only the header when there are no users', () => {
    assert.equal(buildUserCsv(columns, []), 'Name,T-Shirt,Address');
  });
});
