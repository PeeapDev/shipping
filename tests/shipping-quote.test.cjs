const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');
function load(path, replacements) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: (name) => replacements?.[name] || require(name), console });
  return module.exports;
}
const pricing = load('src/lib/zone-pricing.ts');
const validation = load('src/lib/validation.ts');
const flat = { id: 'flat', name: 'Freetown', city: 'Freetown', ...pricing.flatZonePrice(12), estimated_time_minutes: 60 };
async function quote(zones, body = {}, dbError = null) {
  const calls = [];
  const supabase = { from() {
    let city;
    const query = { select() { return query; }, ilike(field, value) { city = value; calls.push(value); return query; }, eq() { return query; },
      limit() { return Promise.resolve({ data: zones.filter((zone) => zone.city.toLowerCase() === city.toLowerCase()), error: dbError }); } };
    return query;
  } };
  const route = load('src/app/api/quote/route.ts', {
    '@/lib/zone-pricing': pricing, '@/lib/validation': validation, '@/lib/supabase': { supabase },
    '@/lib/cors': { corsHeaders: () => ({}), handleCORS: () => null },
  });
  const response = await route.POST(new NextRequest('https://shipping.peeap.com/api/quote', { method: 'POST',
    body: JSON.stringify({ pickup_city: 'Freetown', delivery_city: 'Freetown', package_size: 'small', ...body }) }));
  return { response, body: await response.json(), calls };
}
test('explicit city flat fee is exact for every package size', async () => {
  for (const package_size of ['small', 'medium', 'large', 'extra_large']) {
    const result = await quote([flat], { package_size });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.quote.fee, 12);
    assert.equal(result.body.quote.pricing_method, 'city_flat');
    assert.deepEqual(result.calls, ['Freetown', 'Freetown']);
  }
});
test('explicit free rate stays zero, not a default fee', async () => {
  const result = await quote([{ ...flat, ...pricing.flatZonePrice(0) }]);
  assert.equal(result.body.quote.fee, 0);
});
test('missing and ambiguous rates block quotes instead of picking or inventing one', async () => {
  assert.equal((await quote([])).body.error, 'shipping_route_not_covered');
  assert.equal((await quote([flat, { ...flat, id: 'another' }])).body.error, 'ambiguous_shipping_zone');
  assert.equal((await quote([flat], { delivery_city: '%' })).response.status, 400);
});
test('flat cross-city deliveries require an explicit route rule', async () => {
  assert.equal((await quote([flat, { ...flat, id: 'bo', city: 'Bo' }], { delivery_city: 'Bo' })).body.error, 'flat_cross_city_rate_not_configured');
});
test('distance mode retains covered legacy rate and zero per-km supplement', async () => {
  const result = await quote([{ ...flat, base_fee: 15, per_km_fee: 0, min_fee: 3, max_fee: 100 }]);
  assert.equal(result.body.quote.fee, 12); // Existing small-package multiplier.
  assert.equal(result.body.quote.breakdown.per_km_fee, 0);
});
test('database errors never become free shipping', async () => {
  assert.equal((await quote([], {}, { message: 'unavailable' })).response.status, 500);
});
