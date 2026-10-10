/**
 * Montants en DH calculés en centimes entiers : pas d'erreur d'arrondi des nombres à virgule
 * (0,1 + 0,2 ≠ 0,3 en JavaScript). Tous les calculs de prix et de totaux passent par ici.
 */
export const toCents = (dh: number): number => Math.round(dh * 100);
export const fromCents = (cents: number): number => cents / 100;

/** Prix unitaire × quantité, au centime près. */
export const lineTotal = (unit: number, qty: number): number => fromCents(toCents(unit) * qty);

/** Somme de montants, au centime près. */
export const sumMoney = (values: number[]): number => fromCents(values.reduce((s, v) => s + toCents(v), 0));

/** Deux montants égaux au centime près. */
export const sameMoney = (a: number, b: number): boolean => toCents(a) === toCents(b);
