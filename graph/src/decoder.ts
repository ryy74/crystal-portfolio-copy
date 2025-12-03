import { BigInt } from "@graphprotocol/graph-ts";
import {
  Fill as OrderFilledEvent,
  OrdersUpdated as OrdersUpdatedEvent,
} from "../generated/CrystalRouter/Crystal";

export function parseHexBigInt(hexStr: string): BigInt {
  let result = BigInt.zero();
  let base = BigInt.fromI32(16);
  for (let i = 0; i < hexStr.length; i++) {
    let charCode = hexStr.charCodeAt(i);
    let digit = BigInt.zero();
    if (charCode >= 48 && charCode <= 57) {
      digit = BigInt.fromI32(charCode - 48);
    } else if (charCode >= 97 && charCode <= 102) {
      digit = BigInt.fromI32(charCode - 97 + 10);
    } else if (charCode >= 65 && charCode <= 70) {
      digit = BigInt.fromI32(charCode - 65 + 10);
    }
    result = result.times(base).plus(digit);
  }
  return result;
}

// [marketHex, userIdDec, fillInfoHex, fillAmountDec]
export function decodeOrderFilled(ev: OrderFilledEvent): Array<string> {
  let a = new Array<string>(4);
  a[0] = ev.params.market.toHexString();
  a[1] = ev.params.user.toString();
  a[2] = ev.params.fillInfo.toHexString().replace("0x", "");
  a[3] = ev.params.fillAmount.toString();
  return a;
}

// [price, id46, isCloid("1"/"0"), cloid, nativeId, remaining]
export function decodeOrderInfo(fillInfo: BigInt): Array<string> {
  let out = new Array<string>(6);

  let hex = fillInfo.toHexString().replace("0x", "");
  while (hex.length < 64) hex = "0" + hex;

  const priceHex = hex.substr(2, 20);
  const id56Hex = hex.substr(22, 14);
  const remHex = hex.substr(36, 28);

  const price = parseHexBigInt("0x" + priceHex);
  const id56 = parseHexBigInt("0x" + id56Hex);
  const remaining = parseHexBigInt("0x" + remHex);

  const TWO = BigInt.fromI32(2);

  let pow41 = BigInt.fromI32(1);
  for (let i = 0; i < 41; i++) pow41 = pow41.times(TWO);

  let pow51 = pow41;
  for (let i = 0; i < 10; i++) pow51 = pow51.times(TWO);

  const real51 = id56.minus(id56.div(pow51).times(pow51));
  const cloidBI = real51.div(pow41);
  const low41 = real51.minus(cloidBI.times(pow41)); 

  const isCloid = !cloidBI.isZero();
  const nativeId = isCloid ? BigInt.zero() : low41;

  out[0] = price.toString();
  out[1] = id56.toString();
  out[2] = isCloid ? "1" : "0";
  out[3] = cloidBI.toString();
  out[4] = nativeId.toString();
  out[5] = remaining.toString();
  return out;
}

// [chunk0Hex, chunk1Hex, ...] (each 64-char hex, no 0x)
export function decodeOrdersUpdated(ev: OrdersUpdatedEvent): Array<string> {
  let hex = ev.params.orderData.toHexString().replace("0x", "");
  let n = hex.length / 64;
  let out = new Array<string>(n as i32);
  for (let i = 0; i < n; i++) out[i] = hex.substr(i * 64, 64);
  return out;
}

// [action, isBuy("1"/"0"), price, id51, isCloid("1"/"0"), cloid, nativeId, size]
export function decodeOrderData(wordHexNo0x: string): Array<string> {
  while (wordHexNo0x.length < 64) wordHexNo0x = "0" + wordHexNo0x;

  const actionHex = wordHexNo0x.substr(0, 1);
  const priceHex = wordHexNo0x.substr(2, 20);
  const id56Hex = wordHexNo0x.substr(22, 14);
  const sizeHex = wordHexNo0x.substr(36, 28);

  const action = I32.parseInt(actionHex, 16);
  const isBuy = action == 0 || action == 2 || action == 4;

  let id56 = parseHexBigInt("0x" + id56Hex);

  let TWO = BigInt.fromI32(2);
  let pow41 = BigInt.fromI32(1);
  for (let i = 0; i < 41; i++) pow41 = pow41.times(TWO);
  let pow51 = pow41;
  for (let i = 0; i < 10; i++) pow51 = pow51.times(TWO);

  let real51 = id56.minus(id56.div(pow51).times(pow51));
  let cloidBI = real51.div(pow41);
  let nativeIdBI = real51.minus(cloidBI.times(pow41));
  let isCloid = !cloidBI.isZero();

  let out = new Array<string>(8);
  out[0] = BigInt.fromI32(action).toString();
  out[1] = isBuy ? "1" : "0";
  out[2] = parseHexBigInt("0x" + priceHex).toString();
  out[3] = real51.toString();
  out[4] = isCloid ? "1" : "0";
  out[5] = isCloid ? cloidBI.toString() : "0"; 
  out[6] = isCloid ? "0" : nativeIdBI.toString();
  out[7] = parseHexBigInt("0x" + sizeHex).toString();
  return out;
}
