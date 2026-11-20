import { roundOrderNumeric } from '@/lib/orderNumeric';

/** Default bottles per carton when product packing is unknown. */
export const DEFAULT_PIECES_PER_CARTON = 24;

export function normalizePiecesPerCarton(value?: number | string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PIECES_PER_CARTON;
}

export function cartonsFromPieces(pieces: number, bottlesPerCarton?: number): number {
  const rate = normalizePiecesPerCarton(bottlesPerCarton);
  if (!Number.isFinite(pieces) || pieces <= 0 || rate <= 0) return 0;
  return Math.floor(pieces / rate);
}

export function remainderPieces(pieces: number, bottlesPerCarton?: number): number {
  const rate = normalizePiecesPerCarton(bottlesPerCarton);
  if (!Number.isFinite(pieces) || pieces <= 0 || rate <= 0) return 0;
  return pieces % rate;
}

export function piecesFromCartons(cartons: number, bottlesPerCarton?: number): number {
  const rate = normalizePiecesPerCarton(bottlesPerCarton);
  const wholeCartons = Math.max(0, Math.floor(Number(cartons) || 0));
  return wholeCartons * rate;
}

export function totalPiecesFromCartonsAndLoose(
  cartons: number,
  loosePieces: number,
  bottlesPerCarton?: number,
): number {
  return (
    piecesFromCartons(cartons, bottlesPerCarton)
    + Math.max(0, Math.floor(Number(loosePieces) || 0))
  );
}

export type NormalizedCartonLoose = {
  carton_amount: number;
  piece_amount: number;
  total_pieces: number;
};

/** Normalize loose pieces into full cartons when they exceed pack size. */
export function normalizeCartonAndLoose(
  cartons: number,
  loose: number,
  bottlesPerCarton?: number,
): NormalizedCartonLoose {
  const rate = normalizePiecesPerCarton(bottlesPerCarton);
  let cartonAmount = Math.max(0, Math.floor(Number(cartons) || 0));
  let pieceAmount = Math.max(0, Math.floor(Number(loose) || 0));

  if (rate > 0 && pieceAmount >= rate) {
    cartonAmount += Math.floor(pieceAmount / rate);
    pieceAmount %= rate;
  }

  return {
    carton_amount: cartonAmount,
    piece_amount: pieceAmount,
    total_pieces: totalPiecesFromCartonsAndLoose(cartonAmount, pieceAmount, rate),
  };
}

export function pricePerPieceFromCarton(cartonPrice: number, bottlesPerCarton?: number): number {
  const rate = normalizePiecesPerCarton(bottlesPerCarton);
  if (!Number.isFinite(cartonPrice) || rate <= 0) return 0;
  return roundOrderNumeric(cartonPrice / rate);
}

export function pricePerCartonFromPiece(piecePrice: number, bottlesPerCarton?: number): number {
  const rate = normalizePiecesPerCarton(bottlesPerCarton);
  if (!Number.isFinite(piecePrice)) return 0;
  return roundOrderNumeric(piecePrice * rate);
}

export function formatCartonPiece(
  pieces: number,
  bottlesPerCarton?: number,
  cartonLabel = 'CTN',
  pieceLabel = 'pcs',
): string {
  const rate = normalizePiecesPerCarton(bottlesPerCarton);
  const cartons = cartonsFromPieces(pieces, rate);
  const loose = remainderPieces(pieces, rate);
  if (cartons > 0 && loose > 0) return `${cartons} ${cartonLabel} · ${loose} ${pieceLabel}`;
  if (cartons > 0) return `${cartons} ${cartonLabel}`;
  return `${Math.max(0, Math.floor(pieces))} ${pieceLabel}`;
}