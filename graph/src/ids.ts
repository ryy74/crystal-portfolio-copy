import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Lookup } from "../generated/schema";

export function orderIdCloid(market: Bytes, cloid: i32, userIdDec: string, txHash: Bytes, logIndex: BigInt): string {
  let m = market.toHexString();
  let tx = txHash.toHexString();
  return "cloid:" + m + ":" + cloid.toString() + ":" + userIdDec + ":" + tx + "-" + logIndex.toString();
}

export function orderIdNative(market: Bytes, price: BigInt, nativeId: BigInt): string {
  let m = market.toHexString();
  return "native:" + m + ":" + price.toString() + ":" + nativeId.toString();
}

export function openCloidPointerId(market: Bytes, userIdDec: string, cloid: i32): string {
  let m = market.toHexString();
  return "open:" + m + ":" + userIdDec + ":" + cloid.toString();
}

function resolveSeriesOwner(market: Bytes, intervalSeconds: i32): Bytes {
  const key = "series:" + market.toHexString() + "-" + intervalSeconds.toString();
  const lk = Lookup.load(key);
  return lk ? (lk.address as Bytes) : market;
}

export function seriesId(market: Bytes, intervalSeconds: i32): string {
  const owner = resolveSeriesOwner(market, intervalSeconds);
  return owner.toHexString() + "-" + intervalSeconds.toString();
}

export function candleId(market: Bytes, bucketStartSec: BigInt, intervalSeconds: i32): string {
  const owner = resolveSeriesOwner(market, intervalSeconds);
  return owner.toHexString() + "-" + bucketStartSec.toString() + "-" + intervalSeconds.toString();
}

export function txItemId(txHash: Bytes, logIndex: BigInt): string {
  let t = txHash.toHexString();
  return t + "-" + logIndex.toString();
}

export function launchpadTradeId(tx: Bytes, logIndex: BigInt): string {
  return tx.toHexString() + "-" + logIndex.toString();
}

export function launchpadPositionId(token: Bytes, account: Bytes): string {
  return token.toHexString() + "-" + account.toHexString();
}

export function accountLaunchpadBatchId(account: Bytes, batchIndex: i32): string {
  return account.toHexString() + "-lpad-" + batchIndex.toString();
}