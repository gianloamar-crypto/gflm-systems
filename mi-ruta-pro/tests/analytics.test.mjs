import test from 'node:test';
import assert from 'node:assert/strict';
import { weekdayReport, fuelCycles, stationRanking, LITERS_PER_GALLON, fuelAmountToStore, fuelAmountForDisplay } from '../analytics.mjs';
const shift = (date, km_work = 50) => ({ date, km_work, km_total: 60 });
const m = (date, kind, amount) => ({ date, kind, amount });
const f = (date, odometer, station, quantity, full_tank = true, exclusive_usage = true) => ({ date, odometer, station, quantity, amount: quantity * 2, fuel_type: 'GLP', full_tank, exclusive_usage });

test('un día se cuenta una vez: solo jornadas, sin horas ni dobles ingresos', () => {
  const a = weekdayReport({
    shifts: [shift('2026-11-09'), shift('2026-11-16')],
    movements: [m('2026-11-09', 'ingreso', 100), m('2026-11-09', 'ingreso', 50), m('2026-11-09', 'gasto_operativo', 10), m('2026-11-09', 'gasto_personal', 60), m('2026-11-09', 'recarga_app', 20), m('2026-11-16', 'ingreso', 200), m('2026-11-10', 'ingreso', 1000)],
    fuel: [{ date: '2026-11-09', amount: 30 }, { date: '2026-11-10', amount: 150 }]
  });
  assert.equal(a.rows[0].count, 2);
  assert.equal(a.rows[0].net, 310);
  assert.equal(a.rows[0].average, 155);
  assert.equal(a.unassignedMovementDays, 1);
  assert.equal(a.rows[1].count, 0);
  assert.equal(a.rows[1].average, null);
});

test('un llenado completo a otro usa volumen al final del ciclo y atribuye al grifo inicial', () => {
  const fills = [f('2026-11-01', 1000, 'Grifo Norte', 10), f('2026-11-02', 1100, 'Grifo Sur', 10)];
  const a = fuelCycles(fills);
  assert.equal(a[0].station, 'Grifo Norte');
  assert.equal(a[0].distance, 100);
  assert.ok(Math.abs(a[0].quantity-10/LITERS_PER_GALLON)<1e-7);
  assert.ok(Math.abs(a[0].kmPerUnit-10*LITERS_PER_GALLON)<1e-7);
  assert.equal(a[0].unit,'gal');
  assert.equal(a[0].usable, true);
});

test('recarga parcial cuenta para el denominador, ciclo mezclado no califica para ranking', () => {
  const fills = [f('2026-11-01', 1000, 'Grifo Norte', 10), f('2026-11-02', 1050, 'Grifo Sur', 4, false), f('2026-11-03', 1100, 'Grifo Norte', 6)];
  const a = fuelCycles(fills);
  assert.ok(Math.abs(a[0].quantity-10/LITERS_PER_GALLON)<1e-7);
  assert.equal(a[0].usable, false);
  assert.equal(stationRanking(fills).length, 0);
});

test('si se usó gasolina o no se confirmó uso GLP exclusivo, no compara estaciones', () => {
  const fills = [f('2026-11-01', 1000, 'Grifo Norte', 10), f('2026-11-02', 1100, 'Grifo Norte', 10, true, false)];
  assert.equal(fuelCycles(fills)[0].usable, false);
});

test('ranking requiere tres ciclos válidos para recomendación firme', () => {
  const fills = [f('2026-11-01', 1000, 'Grifo A', 10), f('2026-11-02', 1100, 'Grifo A', 10), f('2026-11-03', 1200, 'Grifo A', 10), f('2026-11-04', 1300, 'Grifo A', 10), f('2026-11-05', 1400, 'Grifo B', 10)];
  const ranking = stationRanking(fills);
  assert.equal(ranking.length, 1);
  assert.equal(ranking[0].cycles, 4);
  assert.equal(ranking[0].sufficient, true);
  assert.ok(Math.abs(ranking[0].kmPerUnit-10*LITERS_PER_GALLON)<1e-7);
});

test('galones elegidos por usuario se almacenan como litros y se visualizan igual sin perder historial', () => {
 const gal=8.5,stored=fuelAmountToStore(gal,'GLP');
 assert.ok(Math.abs(stored-gal*3.785411784)<1e-8);
 assert.ok(Math.abs(fuelAmountForDisplay(stored,'GLP')-gal)<1e-8);
 assert.equal(fuelAmountToStore(12,'GNV'),12);
});
test('no se compara un ciclo GLP si se cargó gasolina a mitad del tramo',()=>{
 const fills=[f('2026-11-01',1000,'Grifo A',10),f('2026-11-02',1100,'Grifo A',10),
  {...f('2026-11-01',1050,'Gasolina',1),fuel_type:'Gasolina'}];
 assert.equal(fuelCycles(fills)[0].usable,false);
});
