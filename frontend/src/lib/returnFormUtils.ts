import {
  ORDER_NUMERIC_DECIMALS,
  ORDER_NUMERIC_STEP,
  roundOrderNumeric,
  roundReturnAmount,
} from '@/lib/orderNumeric';
import {
  DEFAULT_PIECES_PER_CARTON,
  cartonsFromPieces,
  normalizePiecesPerCarton,
  piecesFromCartons,
} from '@/lib/packaging';

export type ReturnItemInput = {
  id?: string;
  sales_item: string;
  carton_amount: number;
  /** Derived pieces (dana) for API/stock restore — not entered in UI */
  piece_amount: number;
  return_price: number;
};

export type ReturnItemFormLine = ReturnItemInput & {
  /** Max pieces (dana) that can be returned for this sale line */
  max_piece_amount: number;
};

export const calculateReturnTotal = (
  items: ReturnItemInput[],
  piecesPerCarton?: number,
): number =>
  roundReturnAmount(
    items.reduce(
      (sum, item) => sum + returnLineTotal(item, piecesPerCarton),
      0,
    ),
  );

export const returnLineTotal = (
  item: ReturnItemInput,
  piecesPerCarton?: number,
): number => {
  const pieces = Number(item.piece_amount) > 0 ? Number(item.piece_amount) : piecesFromCartons(item.carton_amount, piecesPerCarton);
  return roundReturnAmount(pieces / DEFAULT_PIECES_PER_CARTON * Number(item.return_price || 0));
};

/** Max cartons returnable from a sold sale line. */
export const maxCartonsFromSold = (
  item: { unit?: string; quantity?: number; liter_amount?: number },
  piecesPerCarton?: number,
): number => {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  if (item.unit === 'carton') {
    return Math.max(0, Number(item.quantity) || 0);
  }
  const pieces = Number(item.liter_amount ?? item.quantity ?? 0) || 0;
  return cartonsFromPieces(pieces, rate);
};

/** Max pieces (dana) sold on a sale line. */
export const maxPiecesFromSold = (
  item: { unit?: string; quantity?: number; liter_amount?: number },
  piecesPerCarton?: number,
): number => {
  const recordedPieces = Number(item.liter_amount);
  if (Number.isFinite(recordedPieces) && recordedPieces > 0) return recordedPieces;
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  if (item.unit === 'carton') {
    return piecesFromCartons(Number(item.quantity) || 0, rate);
  }
  return Math.max(0, Number(item.liter_amount ?? item.quantity ?? 0) || 0);
};

/** Pieces from cartons, capped at the sale line max. */
export const piecesFromCartonCapped = (
  cartons: number,
  maxPieces: number,
  piecesPerCarton?: number,
): number => {
  const max = Math.max(0, Number(maxPieces) || 0);
  return Math.min(piecesFromCartons(cartons, piecesPerCarton), max);
};

/** Cap carton entry to what was sold, then derive pieces. */
export const syncReturnQtyFromCarton = (
  cartons: number,
  maxPieces: number,
  piecesPerCarton?: number,
): { carton_amount: number; piece_amount: number } => {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  const maxCartons = cartonsFromPieces(maxPieces, rate);
  const carton_amount = Math.min(Math.max(0, Number(cartons) || 0), maxCartons);
  return {
    carton_amount,
    piece_amount: piecesFromCartonCapped(carton_amount, maxPieces, rate),
  };
};

export const mapSaleItemToReturnLine = (
  item: {
    id: number | string;
    unit?: string;
    quantity?: number;
    liter_amount?: number;
    sell_price?: string | number;
  },
  piecesPerCarton?: number,
): ReturnItemFormLine => {
  const max = maxPiecesFromSold(item, piecesPerCarton);
  const soldUnits = Number(item.quantity) || 0;
  const stockUnitsPerSaleUnit = soldUnits > 0 && max > 0 ? max / soldUnits : item.unit === 'carton' ? normalizePiecesPerCarton(piecesPerCarton) : 1;
  // The return API stores price per eight stock units for non-mass returns.
  const legacyReturnPrice = (parseFloat(String(item.sell_price ?? 0)) || 0) * (item.unit === 'kg' ? 1 : DEFAULT_PIECES_PER_CARTON / stockUnitsPerSaleUnit);
  return {
    sales_item: String(item.id),
    carton_amount: 0,
    piece_amount: 0,
    return_price: legacyReturnPrice,
    max_piece_amount: max,
  };
};

export const mapReturnItemToFormLine = (
  item: {
    id?: number | string;
    sales_item?: number | string;
    liter_amount?: number;
    quantity?: number;
    return_price?: string | number;
    sales_item_details?: {
      unit?: string;
      quantity?: number;
      liter_amount?: number;
    };
  },
  piecesPerCarton?: number,
): ReturnItemFormLine => {
  const rate = normalizePiecesPerCarton(piecesPerCarton);
  const pieces = Number(item.liter_amount ?? item.quantity ?? 0) || 0;
  const details = item.sales_item_details;
  const max = details
    ? maxPiecesFromSold(details, rate)
    : Math.max(pieces, 0);
  return {
    id: item.id != null ? String(item.id) : undefined,
    sales_item: item.sales_item != null ? String(item.sales_item) : '',
    piece_amount: pieces,
    carton_amount: cartonsFromPieces(pieces, rate),
    return_price: parseFloat(String(item.return_price ?? 0)) || 0,
    max_piece_amount: max,
  };
};

export const buildReturnPayload = (
  data: {
    sales: string;
    return_date: string;
    reason?: string;
    currency: string | number;
    notes?: string;
    pieces_per_carton?: number;
    return_items: ReturnItemInput[];
  },
  options?: { includeItemIds?: boolean },
) => {
  const rate = normalizePiecesPerCarton(data.pieces_per_carton);
  const activeItems = data.return_items.filter((item) => item.carton_amount > 0 || item.piece_amount > 0);
  const total = calculateReturnTotal(activeItems, rate);

  return {
    sales: data.sales,
    return_date: data.return_date,
    reason: data.reason || '',
    currency: data.currency,
    notes: data.notes || '',
    total_amount: total,
    refund_amount: total,
    return_items: activeItems.map((item) => {
      // quantity / liter_amount = dana (pieces) for stock restore — backend expects piece count
      const pieces = roundOrderNumeric(item.piece_amount);
      return {
        ...(options?.includeItemIds && item.id
          ? { id: parseInt(String(item.id), 10) }
          : {}),
        sales_item: item.sales_item,
        quantity: pieces,
        liter_amount: pieces,
        return_price: roundReturnAmount(item.return_price),
      };
    }),
  };
};

export {
  DEFAULT_PIECES_PER_CARTON,
  ORDER_NUMERIC_DECIMALS,
  ORDER_NUMERIC_STEP,
  cartonsFromPieces,
  normalizePiecesPerCarton,
  piecesFromCartons,
};
