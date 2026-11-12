// Funciones puras: resultados por jornada completa, nunca por hora.
const n = value => Number(value) || 0;
const date = value => String(value ?? '').slice(0, 10);
const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const weekdayIndex = day => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
const safeStation = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const sameStation = (a, b) => safeStation(a).toLocaleLowerCase('es-PE') === safeStation(b).toLocaleLowerCase('es-PE');

export function weekdayReport({ shifts = [], movements = [], fuel = [], includes = () => true } = {}) {
  const result = days.map(day => ({ day, count: 0, income: 0, costs: 0, net: 0, kmWork: 0, kmTotal: 0, average: null, netPerKm: null }));
  const worked = new Map();
  for (const shift of shifts) {
    const d = date(shift.date);
    if (!includes(d) || worked.has(d)) continue;
    worked.set(d, { kmWork: n(shift.km_work), kmTotal: n(shift.km_total) });
  }
  const daily = new Map([...worked].map(([d, km]) => [d, { income: 0, costs: 0, ...km }]));
  for (const move of movements) {
    const row = daily.get(date(move.date));
    if (!row) continue;
    if (move.kind === 'ingreso') row.income += n(move.amount);
    if (move.kind === 'gasto_operativo') row.costs += n(move.amount);
  }
  for (const fill of fuel) {
    const row = daily.get(date(fill.date));
    if (row) row.costs += n(fill.amount);
  }
  for (const [d, row] of daily) {
    const item = result[weekdayIndex(d)];
    item.count++;
    item.income += row.income;
    item.costs += row.costs;
    item.kmWork += row.kmWork;
    item.kmTotal += row.kmTotal;
  }
  for (const row of result) {
    row.net = row.income - row.costs;
    row.average = row.count ? row.net / row.count : null;
    row.netPerKm = row.kmWork > 0 ? row.net / row.kmWork : null;
  }
  return { rows: result, workedDays: worked.size, countedDates: [...worked.keys()],
    top: result.filter(row => row.count).sort((a, b) => b.average - a.average || b.count - a.count)[0] ?? null,
    reliable: result.some(row => row.count >= 3),
    unassignedMovementDays: [...new Set([...movements, ...fuel].filter(r => includes(date(r.date)) && !worked.has(date(r.date))).map(r => date(r.date)))].length
  };
}

// Sólo ciclos completos y con uso exclusivo del combustible. El grifo de origen
// es el del llenado inicial; la recarga final cuantifica lo consumido.
export function fuelCycles(fuel = [], fuelType = 'GLP') {
  const fills = fuel.filter(f => f.fuel_type === fuelType)
    .sort((a, b) => n(a.odometer) - n(b.odometer) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  let first = null, between = [], result = [];
  for (const fill of fills) {
    if (first && n(fill.odometer) <= n(first.odometer)) continue;
    if (!first) {
      if (fill.full_tank) first = fill;
      continue;
    }
    if (!fill.full_tank) { between.push(fill); continue; }
    const distance = n(fill.odometer) - n(first.odometer);
    const amount = [fill, ...between].reduce((s, row) => s + n(row.quantity), 0);
    const payment = [fill, ...between].reduce((s, row) => s + n(row.amount), 0);
    const originStation = safeStation(first.station);
    const stationUnique = !!originStation && between.every(row => sameStation(row.station, originStation));
    const exclusive = fill.exclusive_usage === true;
    const usable = distance > 0 && amount > 0 && exclusive && stationUnique;
    result.push({ from: date(first.date), to: date(fill.date), fromOdometer: n(first.odometer), toOdometer: n(fill.odometer),
      distance, quantity: amount, cost: payment, unit: fuelType === 'GNV' ? 'm³' : 'L',
      kmPerUnit: distance > 0 && amount > 0 ? distance / amount : null,
      solesPerKm: distance > 0 ? payment / distance : null,
      station: originStation, stationUnique, exclusive, usable,
      reason: !exclusive ? 'No se confirmó uso exclusivo del combustible' : !stationUnique ? 'Grifo desconocido o mezclado en el ciclo' : distance <= 0 || amount <= 0 ? 'Lecturas o cantidades inválidas' : '' });
    first = fill;
    between = [];
  }
  return result;
}

export function stationRanking(fuel = [], type = 'GLP') {
  const cycles = fuelCycles(fuel, type).filter(c => c.usable);
  const groups = new Map();
  for (const cycle of cycles) {
    const key = cycle.station.toLocaleLowerCase('es-PE');
    if (!groups.has(key)) groups.set(key, { name: cycle.station, cycles: 0, km: 0, quantity: 0, payment: 0 });
    const row = groups.get(key);
    row.cycles++;
    row.km += cycle.distance;
    row.quantity += cycle.quantity;
    row.payment += cycle.cost;
  }
  return [...groups.values()].map(row => ({ ...row,
    kmPerUnit: row.quantity > 0 ? row.km / row.quantity : null,
    solesPerKm: row.km > 0 ? row.payment / row.km : null,
    sufficient: row.cycles >= 3
  })).sort((a, b) => b.kmPerUnit - a.kmPerUnit);
}
