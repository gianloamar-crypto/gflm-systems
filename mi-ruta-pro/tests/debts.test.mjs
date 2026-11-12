import test from 'node:test';
import assert from 'node:assert/strict';
import {daysToDue,debtStatus,validateDebtAction} from '../debts.mjs';
const loan={amount:1000,due_date:'2026-11-30'};
const act=(kind,amount,from_reserved=0,date='2026-11-20')=>({kind,amount,from_reserved,date});

test('1000 soles para 5 días = 200 diarios, apartar 100 reduce pendiente a 900',()=>{
 const d={...loan,due_date:'2026-11-25'};
 assert.equal(debtStatus(d,[],'2026-11-20').daily,200);
 const next=debtStatus(d,[act('reserve',100)],'2026-11-20');
 assert.equal(next.amountOutstanding,1000); // apartar NO equivale a pagar
 assert.equal(next.reserved,100);
 assert.equal(next.toCollect,900);
 assert.equal(next.daily,180);
 assert.equal(debtStatus(d,[act('reserve',100)],'2026-11-21').daily,225);
});

test('10 días hasta 30 de noviembre sin agregar un día ficticio',()=>{
 assert.equal(daysToDue('2026-11-30','2026-11-20'),10);
 assert.equal(debtStatus(loan,[],'2026-11-20').daily,100);
});

test('apartar, pagar desde apartado y liberar no duplican el ahorro',()=>{
 const actions=[act('reserve',300),act('pay',200,200),act('release',50)];
 const s=debtStatus(loan,actions,'2026-11-21');
 assert.equal(s.paid,200);
 assert.equal(s.reserved,50);
 assert.equal(s.amountOutstanding,800);
 assert.equal(s.toCollect,750);
});

test('plazos vencidos o al día no producen divisiones erróneas',()=>{
 assert.equal(debtStatus(loan,[],'2026-11-30').daily,1000);
 assert.equal(debtStatus(loan,[],'2026-12-01').daily,null);
 assert.equal(debtStatus(loan,[],'2026-12-01').overdue,true);
 assert.equal(debtStatus(loan,[act('pay',1000)],'2026-12-01').complete,true);
});

test('validación de sobrepago, exceso de apartados y monto inexistente',()=>{
 assert.throws(()=>validateDebtAction(loan,[],{kind:'reserve',amount:1200},'2026-11-20'));
 assert.throws(()=>validateDebtAction(loan,[],{kind:'release',amount:20},'2026-11-20'));
 assert.throws(()=>validateDebtAction(loan,[act('reserve',100)],{kind:'pay',amount:200,from_reserved:150},'2026-11-20'));
 assert.throws(()=>validateDebtAction(loan,[],{kind:'pay',amount:1200},'2026-11-20'));
 assert.deepEqual(validateDebtAction(loan,[],{kind:'reserve',amount:100},'2026-11-20'),{kind:'reserve',amount:100,fromReserved:0});
});
