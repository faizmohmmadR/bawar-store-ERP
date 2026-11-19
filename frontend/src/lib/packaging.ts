import { roundOrderNumeric } from './orderNumeric';

/** Packaging: 1 carton (کارتن) = N pieces. Default N = 8. */

export const DEFAULT_PIECES_PER_CARTON = 8;

const capacitiesMatch = (left?: number | string | null, right?: number | string | null) => {
  const a = Number(left);
  const b = Number(right);
  if (!a || !b) return false;
  return Math.abs(a - b) < 1e-9;
};

/**
 * Bottle-based packing component quantities.
 * Volume bottles: bottles = liters / bottleCapacityLiters
 * Kg bottles: bottles = kilograms / bottleCapacityKg
 * Plastic/carton must match the bottle on the same basis.
 */
export function expectedPackingComponentQuantities(input: {
  quantityLiters: number;
  quantityKg?: number | null;
  bottleCapacityLiters?: number | null;
  bottleCapacityKg?: number | null;
  plasticCapacityLiters?: number | string | null;
  plasticCapacityKg?: number | string | null;
  cartonBottleCapacityLiters?: number | string | null;
  cartonCapacityKg?: number | string | null;
  bottlesPerPlastic?: number | null;
  bottlesPerCarton?: number | null;
  includeCap?: boolean;
  includeCapLabel?: boolean;
  includeLabel?: boolean;
  /** 1 for single label, 2 for double (front+back) label materials. */
  labelPiecesPerBottle?: number | null;
  includeCartonPlastic?: boolean;
}): {
  bottleCount: number;
  bottlesPerCarton: number;
  quantities: Partial<Record<'bottle' | 'cap' | 'cap_label' | 'label' | 'plastic' | 'carton' | 'carton_plastic', number>>;
  wholeBottleCount: boolean;
  plasticMatchesBottle: boolean;
  cartonMatchesBottle: boolean;
} {
  const liters = Number(input.quantityLiters) || 0;
  const kilograms = Number(input.quantityKg) || 0;
  const bottleCapL = Number(input.bottleCapacityLiters) || 0;
  const bottleCapKg = Number(input.bottleCapacityKg) || 0;
  const plasticCapL = Number(input.plasticCapacityLiters) || 0;
  const plasticCapKg = Number(input.plasticCapacityKg) || 0;
  const cartonCapL = Number(input.cartonBottleCapacityLiters) || 0;
  const cartonCapKg = Number(input.cartonCapacityKg) || 0;
  const perPlastic = Number(input.bottlesPerPlastic) || 0;
  const perCarton = Number(input.bottlesPerCarton) || 0;

  let exactBottles = 0;
  let plasticMatchesBottle = false;
  let cartonMatchesBottle = false;

  if (bottleCapL > 0) {
    exactBottles = liters / bottleCapL;
    plasticMatchesBottle =
      capacitiesMatch(plasticCapL, bottleCapL)
      && Number.isInteger(perPlastic)
      && perPlastic > 0;
    cartonMatchesBottle =
      capacitiesMatch(cartonCapL, bottleCapL)
      && Number.isInteger(perCarton)
      && perCarton > 0;
  } else if (bottleCapKg > 0) {
    exactBottles = kilograms / bottleCapKg;
    plasticMatchesBottle =
      capacitiesMatch(plasticCapKg, bottleCapKg)
      && Number.isInteger(perPlastic)
      && perPlastic > 0;
    cartonMatchesBottle =
      capacitiesMatch(cartonCapKg, bottleCapKg)
      && Number.isInteger(perCarton)
      && perCarton > 0;
  }

  const bottleCount = Math.round(exactBottles);
  const wholeBottleCount =
    bottleCount > 0 && Math.abs(exactBottles - bottleCount) < 1e-9;

  const cartonCount =
    wholeBottleCount && Number.isInteger(perCarton) && perCarton > 0
      ? Math.ceil(bottleCount / perCarton)
      : wholeBottleCount
        ? 1
        : 0;
  const plasticCount =
    wholeBottleCount && Number.isInteger(perPlastic) && perPlastic > 0
      ? Math.ceil(bottleCount / perPlastic)
      : wholeBottleCount
        ? bottleCount
        : 0;

  const quantities: Partial<Record<'bottle' | 'cap' | 'cap_label' | 'label' | 'plastic' | 'carton' | 'carton_plastic', number>> = {};
  if (wholeBottleCount) {
    quantities.bottle = bottleCount;
    if (input.includeLabel !== false) {
      const perBottle = Math.max(1, Number(input.labelPiecesPerBottle) || 1);
      quantities.label = bottleCount * perBottle;
    }
    if (input.includeCap) quantities.cap = bottleCount;
    if (input.includeCapLabel) quantities.cap_label = bottleCount;
    quantities.plastic = plasticCount;
    quantities.carton = cartonCount;
    if (input.includeCartonPlastic) quantities.carton_plastic = cartonCount;
  }

  return {
    bottleCount: wholeBottleCount ? bottleCount : 0,
    bottlesPerCarton: perCarton > 0 && Number.isInteger(perCarton) ? perCarton : 0,
    quantities,
    wholeBottleCount,
    plasticMatchesBottle,
    cartonMatchesBottle,
  };
}

export type SaleUnit = 'carton' | 'piece';

export function normalizePiecesPerCarton(value?: number): number {
  const rate = Number(value);
  return rate > 0 ? rate : DEFAULT_PIECES_PER_CARTON;
}

export function piecesFromCartons(cartons: number, piecesPerCarton?: number): number {
  return (Number(cartons) || 0) * normalizePiecesPerCarton(piecesPerCarton);
}

/** Total pieces from full cartons + loose pieces. */
export function totalPiecesFromCartonsAndLoose(
  cartons: number,
  loosePieces: number,
  piecesPerCarton?: number,
): number {
  return (
    piecesFromCartons(cartons, piecesPerCarton) + (Number(loosePieces) || 0)
  );
}

export function cartonsFromPieces(pieces: number, piecesPerCarton?: number): number {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  const p = Number(pieces) || 0;
  if (p <= 0) return 0;
  return Math.floor(p / rate);
}

export function remainderPieces(pieces: number, piecesPerCarton?: number): number {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  const p = Number(pieces) || 0;
  if (p <= 0) return 0;
  return p % rate;
}

/** Stock stores buy_price per piece; UI often enters price per carton. */
export function pricePerPieceFromCarton(
  cartonPrice: number,
  piecesPerCarton?: number,
): number {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  return rate > 0 ? roundOrderNumeric((Number(cartonPrice) || 0) / rate) : 0;
}

export function pricePerCartonFromPiece(
  piecePrice: number,
  piecesPerCarton?: number,
): number {
  return (Number(piecePrice) || 0) * normalizePiecesPerCarton(piecesPerCarton);
}

export function piecesFromUnits(
  quantity: number,
  unit: SaleUnit | string,
  piecesPerCarton?: number,
): number {
  const qty = Number(quantity) || 0;
  if (qty <= 0) return 0;
  if (unit === 'carton') return piecesFromCartons(qty, piecesPerCarton);
  return qty;
}

/**
 * Normalize carton + loose pieces so loose is always 0..(rate-1).
 * Example: 2 cartons + 10 pieces → 3 cartons + 2 pieces (rate=8).
 */
export function normalizeCartonAndLoose(
  cartons: number,
  loosePieces: number,
  piecesPerCarton?: number,
): { carton_amount: number; piece_amount: number; total_pieces: number } {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  const total = totalPiecesFromCartonsAndLoose(cartons, loosePieces, rate);
  return {
    carton_amount: cartonsFromPieces(total, rate),
    piece_amount: remainderPieces(total, rate),
    total_pieces: total,
  };
}

export function formatCartonPiece(pieces: number, piecesPerCarton?: number): string {
  const cartons = cartonsFromPieces(pieces, piecesPerCarton);
  const loose = remainderPieces(pieces, piecesPerCarton);
  if (loose > 0) return `${cartons} کارتن + ${loose} دانه`;
  return `${cartons} کارتن`;
}

/**
 * Price is per carton.
 * When piece_amount matches carton × rate (or is the only qty), uses that total.
 * Returns forms pass piece_amount as total pieces synced from cartons.
 */
export function lineTotalFromCartonPrice(
  item: {
    carton_amount?: number;
    piece_amount?: number;
    price?: number;
    sell_price?: number;
    buy_price?: number;
    return_price?: number;
  },
  piecesPerCarton?: number,
): number {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  const price =
    Number(item.price ?? item.sell_price ?? item.buy_price ?? item.return_price) || 0;
  const cartons = Number(item.carton_amount) || 0;
  const pieces = Number(item.piece_amount) || 0;
  const expectedPieces = cartons * rate;
  if (cartons > 0 && Math.abs(pieces - expectedPieces) < 1e-9) {
    return cartons * price;
  }
  if (pieces > 0) {
    return (pieces / rate) * price;
  }
  return cartons * price;
}

/** Sale line: carton + loose pieces, price per carton. */
export function lineTotalFromCartonsAndLoose(
  cartonAmount: number,
  loosePieces: number,
  pricePerCarton: number,
  piecesPerCarton?: number,
): number {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  const totalPieces = totalPiecesFromCartonsAndLoose(
    cartonAmount,
    loosePieces,
    rate,
  );
  if (totalPieces <= 0 || rate <= 0) return 0;
  return (totalPieces / rate) * (Number(pricePerCarton) || 0);
}
