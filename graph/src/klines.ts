import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Candle, Series, Market, Lookup } from "../generated/schema";
import { seriesId, candleId } from "./ids";

function upsertInterval(
  market: Bytes,
  tradeTs: BigInt,
  interval: i32,
  startPrice: BigInt,
  endPrice: BigInt,
  baseVol: BigInt,
  quoteVol: BigInt
): void {
  const i = BigInt.fromI32(interval);
  const bucket = tradeTs.div(i).times(i);

  const sid = seriesId(market, interval);
  let s = Series.load(sid);
  if (s == null) {
    s = new Series(sid); 
    s.intervalSeconds = interval;
    const m = Market.load(market);
    if (m != null) {
      s.market = m.id;
    }
    s.save();
  }

  const cid = candleId(market, bucket, interval);
  let c = Candle.load(cid);

  const mkt = Market.load(market);

  let usdDelta = BigInt.zero();

  if (mkt != null) {
    const USDC = Bytes.fromHexString("0xf817257fed379853cde0fa4f97ab987181b1e5ea") as Bytes;
    const MON = Bytes.fromHexString("0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701") as Bytes;

    let qDec: i32 = 18;
    if (mkt.quoteAsset.equals(USDC)) qDec = 6;
    else if (mkt.quoteAsset.equals(MON)) qDec = 18;

    if (mkt.quoteAsset.equals(USDC)) {
      usdDelta = quoteVol;
    } else {
      let p = Lookup.load("0xf817257fed379853cde0fa4f97ab987181b1e5ea" + "-" + mkt.quoteAsset.toHexString());
      if (p != null) {
        const mr = Market.load(p.address);
        if (mr != null) {
          const price = mr.latestPrice;
          const priceScale = BigInt.fromI32(10).pow(<u8>mr.scaleFactor);

          const vol = quoteVol.times(price).div(priceScale);
          usdDelta = vol;
        }
      } else {
        p = Lookup.load(MON.toHexString() + "-" + mkt.quoteAsset.toHexString());
        if (p != null) {
          const mrQM = Market.load(p.address);
          if (mrQM != null) {
            const priceQM = mrQM.latestPrice;
            const priceScaleQM = BigInt.fromI32(10).pow(<u8>mrQM.scaleFactor);

            const p2 = Lookup.load(USDC.toHexString() + "-" + MON.toHexString());
            if (p2 != null) {
              const mrMU = Market.load(p2.address);
              if (mrMU != null) {
                const priceMU = mrMU.latestPrice;
                const priceScaleMU = BigInt.fromI32(10).pow(<u8>mrMU.scaleFactor);

                const vol1 = quoteVol.times(priceMU).div(priceScaleMU);
                const vol2 = vol1.times(priceQM).div(priceScaleQM);
                usdDelta = vol2;
              }
            }
          }
        }
      }
    }
  }

  if (c == null) {
    c = new Candle(cid);
    c.series = s.id;
    c.time = bucket;

    let hi = startPrice;
    if (endPrice.gt(hi)) hi = endPrice;
    let lo = startPrice;
    if (endPrice.lt(lo)) lo = endPrice;

    c.open = startPrice;
    c.high = hi;
    c.low = lo;
    c.close = endPrice;
    c.baseVolume = baseVol;
    c.quoteVolume = quoteVol;
    c.usdVolume = usdDelta;

    if (interval == 60) {
      const ZERO = BigInt.fromI32(0);
      const ONE_MIN = BigInt.fromI32(60);
      const ONE_DAY = BigInt.fromI32(86400);

      let prev: Candle | null = null;
      let search = bucket.minus(ONE_MIN);
      for (let k = 0; k < 1440; k++) {
        const pid = candleId(market, search, 60);
        const pc = Candle.load(pid);
        if (pc != null) { prev = pc; break; }
        search = search.minus(ONE_MIN);
      }

      let prev24 = ZERO;
      let leaving = ZERO;

      if (prev != null) {
        if (prev.vol24h !== null) {
          prev24 = prev.vol24h as BigInt;
        }
        const gapSec = bucket.minus(prev.time);
        const gapMin = gapSec.div(ONE_MIN).toI32();

        if (gapMin >= 1440) {
          prev24 = ZERO;
          leaving = ZERO;
        } else if (gapMin > 0) {
          let start = prev.time.minus(ONE_DAY);
          for (let i = 1; i <= gapMin; i++) {
            const t = start.plus(BigInt.fromI32(i * 60));
            const out = Candle.load(candleId(market, t, 60));
            if (out != null) {
              leaving = leaving.plus(out.usdVolume);
            }
          }
        }
      }

      let now24 = prev24.minus(leaving).plus(c.usdVolume);
      if (now24.lt(ZERO)) now24 = ZERO;

      c.vol24h = now24;
      c.save();

      let m = Market.load(market);
      if (m != null) {
        m.volume = now24;
        m.save();
      }
    }
    c.save();
  } else {
    let hi = c.high;
    if (startPrice.gt(hi)) hi = startPrice;
    if (endPrice.gt(hi)) hi = endPrice;

    let lo = c.low;
    if (startPrice.lt(lo)) lo = startPrice;
    if (endPrice.lt(lo)) lo = endPrice;

    c.high = hi;
    c.low = lo;
    c.close = endPrice;
    c.baseVolume = c.baseVolume.plus(baseVol);
    c.quoteVolume = c.quoteVolume.plus(quoteVol);
    c.usdVolume = c.usdVolume.plus(usdDelta);

    if (interval == 60) {
      let base24 = BigInt.fromI32(0);
      if (c.vol24h !== null) {
        base24 = c.vol24h as BigInt;
      }
      const now24 = base24.plus(usdDelta);

      c.vol24h = now24;
      c.save();

      let m = Market.load(market);
      if (m != null) {
        m.volume = now24;
        m.save();
      }
    }
    c.save();
  }
}

export function updateKlinesFromTrade(
  market: Bytes,
  tradeTs: BigInt,
  isBuy: boolean,
  amountIn: BigInt,
  amountOut: BigInt,
  startPrice: BigInt,
  endPrice: BigInt
): void {
  let baseVol = BigInt.fromI32(0);
  let quoteVol = BigInt.fromI32(0);
  if (isBuy) {
    baseVol = amountOut;
    quoteVol = amountIn;
  } else {
    baseVol = amountIn;
    quoteVol = amountOut;
  }

  upsertInterval(market, tradeTs, 1, startPrice, endPrice, baseVol, quoteVol);
  upsertInterval(market, tradeTs, 5, startPrice, endPrice, baseVol, quoteVol);
  upsertInterval(market, tradeTs, 15, startPrice, endPrice, baseVol, quoteVol);
  upsertInterval(market, tradeTs, 60, startPrice, endPrice, baseVol, quoteVol);
  upsertInterval(market, tradeTs, 300, startPrice, endPrice, baseVol, quoteVol);
  upsertInterval(market, tradeTs, 900, startPrice, endPrice, baseVol, quoteVol);
  upsertInterval(market, tradeTs, 3600, startPrice, endPrice, baseVol, quoteVol);
  upsertInterval(market, tradeTs, 14400, startPrice, endPrice, baseVol, quoteVol);
  upsertInterval(market, tradeTs, 86400, startPrice, endPrice, baseVol, quoteVol);
}

function dstHasRecentCandles(interval: i32, dst: Bytes, endTs: BigInt): boolean {
  const step = BigInt.fromI32(interval);
  let cursor = endTs.div(step).times(step);
  for (let j = 0; j < 32; j++) {
    const dc = Candle.load(candleId(dst, cursor, interval));
    if (dc != null) return true;
    cursor = cursor.minus(step);
    if (cursor.lt(BigInt.fromI32(0))) break;
  }
  return false;
}

export function copyKlines(src: Bytes, dst: Bytes, asOf: BigInt): void {
  const intervals: i32[] = [1, 5, 15, 60, 300, 900, 3600, 14400, 86400];

  for (let i = 0; i < intervals.length; i++) {
    const iv = intervals[i];

    const srcSid = src.toHexString() + "-" + iv.toString();
    let s = Series.load(srcSid);
    if (s == null) continue;

    s.market = dst;
    s.intervalSeconds = iv;
    s.save();

    const key = "series:" + dst.toHexString() + "-" + iv.toString();
    let lk = Lookup.load(key);
    if (lk == null) { lk = new Lookup(key); lk.address = src; lk.save(); }
  }

  {
    const step60 = BigInt.fromI32(60);
    const end60 = asOf.div(step60).times(step60);

    let latest: Candle | null = null;
    let cursor = end60;
    for (let j = 0; j < 30; j++) {
      const c = Candle.load(candleId(src, cursor, 60));
      if (c != null) { latest = c; break; }
      cursor = cursor.minus(step60);
      if (cursor.lt(BigInt.fromI32(0))) break;
    }

    if (latest != null) {
      let m = Market.load(dst);
      if (m != null) {
        m.latestPrice = latest.close;
        if (latest.vol24h !== null) {
          m.volume = latest.vol24h as BigInt;
        }
        m.save();
      }
    }
  }
}