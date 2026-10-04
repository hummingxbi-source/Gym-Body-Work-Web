export const baseMonthlyPrice = 580;

export const shortTermPackages = [
  { id: 'visita', name: 'Visita', price: 120 },
  { id: 'semana', name: 'Semanal', price: 230 },
  { id: '2semanas', name: '2 semanas', price: 400 },
];

export const longTermPackages = [
  { id: 'mes', name: 'Mes', price: 580, days: 30, months: 1 },
  { id: 'trimestre', name: 'Trimestre', price: 1500, days: 90, months: 3 },
  { id: 'semestre', name: 'Semestre', price: 2900, days: 180, months: 6 },
  { id: 'anualidad', name: 'Anualidad', price: 5200, days: 365, months: 12 },
];
