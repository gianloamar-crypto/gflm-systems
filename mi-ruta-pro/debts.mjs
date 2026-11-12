// Préstamos/pagos: apartar no equivale a transferir dinero ni a pagar al acreedor.
const money = value => Math.round((Number(value) || 0) * 100) / 100;
const dateValue = value => {
  const str = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(str)) throw new Error('Fecha no válida');
  const time = Date.parse(`${str}T12:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== str) throw new Error('Fecha no válida');
  return time;
};
export function daysToDue(deadline, asOf) {
  return Math.round((dateValue(deadline) - dateValue(asOf)) / 86400000);
}
export function debtStatus(debt, actions = [], asOf) {
  const goal = money(debt.amount);
  let reserved = 0, paid = 0;
  const chronological = [...actions].sort((a, b) => `${a.date||''}|${a.created_at||''}|${a.id||''}`.localeCompare(`${b.date||''}|${b.created_at||''}|${b.id||''}`));
  for (const action of chronological) {
    const amount = money(action.amount);
    if (amount <= 0) continue;
    if (action.kind === 'reserve') reserved += amount;
    if (action.kind === 'release') reserved -= amount;
    if (action.kind === 'pay') {
      paid += amount;
      reserved -= money(action.from_reserved);
    }
  }
  reserved = money(Math.max(0, reserved));
  paid = money(Math.max(0, paid));
  const amountOutstanding = money(Math.max(0, goal - paid));
  const toCollect = money(Math.max(0, amountOutstanding - reserved));
  const days = daysToDue(debt.due_date, asOf);
  // Hoy vence: solo queda una jornada para alcanzar el objetivo. Si está vencido no se inventan días.
  const divisor = days > 0 ? days : days === 0 ? 1 : 0;
  const daily = divisor ? Math.ceil((toCollect / divisor) * 100 - 1e-9) / 100 : null;
  return {goal, reserved, paid, amountOutstanding, toCollect, days, daily,
    overdue: days < 0 && amountOutstanding > 0, dueToday: days === 0 && amountOutstanding > 0,
    complete: amountOutstanding === 0};
}
export function validateDebtAction(debt, actions, input, asOf) {
  if (!debt) throw new Error('Selecciona un préstamo o pago.');
  const state = debtStatus(debt, actions, asOf);
  const kind = input.kind;
  const amount = money(input.amount);
  const fromReserved = money(input.from_reserved);
  if (!['reserve', 'pay', 'release'].includes(kind)) throw new Error('Acción no válida.');
  if (!Number.isFinite(Number(input.amount)) || amount <= 0) throw new Error('El importe debe ser mayor que cero.');
  if (amount > 100000000) throw new Error('Importe fuera de rango.');
  if (kind === 'reserve' && amount > state.toCollect) throw new Error('No puedes apartar más de lo pendiente por reunir.');
  if (kind === 'release' && amount > state.reserved) throw new Error('No hay suficiente monto apartado para devolver.');
  if (kind === 'pay' && amount > state.amountOutstanding) throw new Error('No puedes registrar un pago mayor al saldo de la deuda.');
  if (kind !== 'pay' && fromReserved > 0) throw new Error('Solo un pago puede usar dinero apartado.');
  if (kind === 'pay' && (fromReserved > amount || fromReserved > state.reserved)) throw new Error('El pago supera el importe disponible en lo apartado.');
  return {kind, amount, fromReserved:kind==='pay'?fromReserved:0};
}
