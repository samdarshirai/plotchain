import { request } from '@playwright/test';

// The associate-role specs need a real associate login, but no associate is seeded. Unless
// ASSOCIATE_USER / ASSOCIATE_PASSWORD are given, provision one "E2E Layout" associate through the
// admin API (and reset its password on later runs, since the temporary password is shown only once).
export default async function globalSetup() {
  if (process.env['ASSOCIATE_USER'] && process.env['ASSOCIATE_PASSWORD']) return;
  const baseURL = process.env['BASE_URL'] ?? 'http://localhost:4200';
  const api = await request.newContext({ baseURL });
  const login = await api.post('/api/auth/login', {
    data: { userId: process.env['ADMIN_USER'] ?? 'admin', password: process.env['ADMIN_PASSWORD'] ?? 'ChangeMe123!' }
  });
  if (!login.ok()) throw new Error(`e2e setup: admin login failed (${login.status()}); set ADMIN_USER/ADMIN_PASSWORD`);
  const headers = { Authorization: `Bearer ${(await login.json()).token}` };

  const found = await api.get('/api/admin/associates?search=E2E%20Layout&page=0&size=5', { headers });
  const existing = found.ok() ? (await found.json()).associates?.find((a: any) => a.name === 'E2E Layout') : undefined;
  if (existing) {
    const reset = await api.post(`/api/admin/associates/${existing.id}/reset-password`, { headers });
    if (!reset.ok()) throw new Error(`e2e setup: reset-password failed (${reset.status()})`);
    process.env['ASSOCIATE_USER'] = existing.userId;
    process.env['ASSOCIATE_PASSWORD'] = (await reset.json()).temporaryPassword;
    return;
  }

  // First associate of an empty tree is parentless; otherwise hang it under any associate with a free leg.
  const all = await api.get('/api/associates', { headers });
  const sponsor = all.ok() ? (await all.json()).find((a: any) => a.hasFreeSlot) : undefined;
  const created = await api.post('/api/associates', { headers, data: {
    name: 'E2E Layout', sponsorUserId: sponsor?.userId, position: sponsor ? 'L' : undefined,
    panNumber: 'EEEEE0000E', aadhaarNumber: '000000000001', phone: '9000000099',
    state: 'Maharashtra', district: 'Pune', address: 'Layout test address'
  } });
  if (!created.ok()) throw new Error(`e2e setup: create associate failed (${created.status()}): ${await created.text()}`);
  const body = await created.json();
  process.env['ASSOCIATE_USER'] = body.userId;
  process.env['ASSOCIATE_PASSWORD'] = body.temporaryPassword;
}
