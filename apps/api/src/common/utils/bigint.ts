/**
 * BigInt-ийг JSON-д string болгож хувиргана — CLAUDE.md §2.1.
 * Мөнгийг BigInt-ээр хадгалдаг тул API хариунд нарийвчлал алдалгүй дамжуулна.
 * main.ts-ийн ХАМГИЙН ЭХЭНД import хийнэ (side-effect).
 */
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function toJSON(this: bigint): string {
  return this.toString();
};

export {};
