import {
  Account,
  AccountFillBatch,
  AccountFillMap,
  AccountFillShard,
  AccountOpenOrderBatch,
  AccountOpenOrderMap,
  AccountOpenOrderShard,
  AccountOrderBatch,
  AccountOrderMap,
  AccountOrderShard,
  AccountTradeBatch,
  AccountTradeMap,
  AccountTradeShard,
  // CloidSlot,
  Fill,
  Market,
  Order,
  Taker,
  UserFillBatch,
  UserFillMap,
  UserFillShard,
  UserId,
  UserOpenOrderBatch,
  UserOpenOrderMap,
  UserOpenOrderShard,
  UserOrderBatch,
  UserOrderMap,
  UserOrderShard,
  UserTradeBatch,
  UserTradeMap,
  UserTradeShard,
  MarketRecentTrade
} from "../generated/schema";

import { BigInt, Bytes, store } from "@graphprotocol/graph-ts";
import { orderIdCloid, orderIdNative, txItemId } from "./ids";

export function addOrder(
  kind: string,
  market: Bytes,
  account: Bytes,
  userIdDec: string,
  isBuy: boolean,
  price: BigInt,
  isCloid: boolean,
  cloid: i32,
  nativeId: BigInt,
  sizeOrRemaining: BigInt,
  timestamp: BigInt,
  txHash: Bytes,
  logIndex: BigInt,
  amountIn: BigInt,
  amountOut: BigInt,
  startPrice: BigInt,
  endPrice: BigInt
): void {
  if (isCloid) return;
  let acct = Account.load(account);
  if (acct == null) {
    acct = new Account(account);
    acct.save();
  }

  let user = UserId.load(userIdDec);
  if (user == null) {
    user = new UserId(userIdDec);
    user.account = account;
    user.isMargin = false;
    user.timestamp = timestamp;
    user.save();
  }

  let m = Market.load(market);
  if (m == null) {
    m = new Market(market);
    m.timestamp = timestamp;
    m.save();
  }

  if (kind == "placement") {
    let oid = isCloid ? orderIdCloid(market, cloid, userIdDec, txHash, logIndex) : orderIdNative(market, price, nativeId);
    let o = new Order(oid);
    let m = Market.load(market);
    if (m == null) return;

    o.isCloid = isCloid;
    o.cloid = isCloid ? cloid : 0;
    o.nativeId = isCloid ? null : nativeId;
    o.market = market;
    o.marketType = m.marketType;
    o.user = user.id;
    o.account = account;
    o.isBuy = isBuy;
    o.price = price;
    o.originalSize = sizeOrRemaining;
    o.remainingSize = sizeOrRemaining;
    o.status = 2;
    o.placedAt = timestamp;
    o.updatedAt = timestamp;
    o.txHash = txHash;

    let aMap = AccountOrderMap.load(account);
    if (aMap == null) {
      aMap = new AccountOrderMap(account);
      aMap.account = account;
      aMap.nextIndex = BigInt.fromI32(0);
      aMap.shardCount = 0;
      aMap.save();
    }
    let aShardIndex = aMap.nextIndex.div(BigInt.fromI32(1000000));
    let aRem = aMap.nextIndex.minus(aShardIndex.times(BigInt.fromI32(1000000)));
    let aBatchIndex = aRem.div(BigInt.fromI32(1000));
    let aShardId =
      account.toHexString() + "-ord-shard-" + aShardIndex.toI32().toString();
    let aShard = AccountOrderShard.load(aShardId);
    if (aShard == null) {
      aShard = new AccountOrderShard(aShardId);
      aShard.map = aMap.id;
      aShard.index = aShardIndex.toI32();
      aShard.batchCount = 0;
      aShard.save();
      aMap.shardCount = aMap.shardCount + 1;
      aMap.save();
    }
    let aBatchId =
      account.toHexString() +
      "-ord-" +
      aShardIndex.toI32().toString() +
      "-" +
      aBatchIndex.toI32().toString();
    let aBatch = AccountOrderBatch.load(aBatchId);
    if (aBatch == null) {
      aBatch = new AccountOrderBatch(aBatchId);
      aBatch.shard = aShard.id;
      aBatch.index = aBatchIndex.toI32();
      aBatch.total = 0;
    }
    aBatch.total = aBatch.total + 1;
    aBatch.save();
    aMap.nextIndex = aMap.nextIndex.plus(BigInt.fromI32(1));
    aMap.save();
    o.accountOrderBatch = aBatch.id;

    let uMap = UserOrderMap.load(user.id);
    if (uMap == null) {
      uMap = new UserOrderMap(user.id);
      uMap.user = user.id;
      uMap.nextIndex = BigInt.fromI32(0);
      uMap.shardCount = 0;
      uMap.save();
    }
    let uShardIndex = uMap.nextIndex.div(BigInt.fromI32(1000000));
    let uRem = uMap.nextIndex.minus(uShardIndex.times(BigInt.fromI32(1000000)));
    let uBatchIndex = uRem.div(BigInt.fromI32(1000));
    let uShardId = user.id + "-ord-shard-" + uShardIndex.toI32().toString();
    let uShard = UserOrderShard.load(uShardId);
    if (uShard == null) {
      uShard = new UserOrderShard(uShardId);
      uShard.map = uMap.id;
      uShard.index = uShardIndex.toI32();
      uShard.batchCount = 0;
      uShard.save();
      uMap.shardCount = uMap.shardCount + 1;
      uMap.save();
    }
    let uBatchId =
      user.id +
      "-ord-" +
      uShardIndex.toI32().toString() +
      "-" +
      uBatchIndex.toI32().toString();
    let uBatch = UserOrderBatch.load(uBatchId);
    if (uBatch == null) {
      uBatch = new UserOrderBatch(uBatchId);
      uBatch.shard = uShard.id;
      uBatch.index = uBatchIndex.toI32();
      uBatch.total = 0;
    }
    uBatch.total = uBatch.total + 1;
    uBatch.save();
    uMap.nextIndex = uMap.nextIndex.plus(BigInt.fromI32(1));
    uMap.save();
    o.userOrderBatch = uBatch.id;

    let aoMap = AccountOpenOrderMap.load(account);
    if (aoMap == null) {
      aoMap = new AccountOpenOrderMap(account);
      aoMap.account = account;
      aoMap.nextIndex = BigInt.fromI32(0);
      aoMap.shardCount = 0;
      aoMap.save();
    }
    let aoShardIndex = aoMap.nextIndex.div(BigInt.fromI32(1000000));
    let aoRem = aoMap.nextIndex.minus(aoShardIndex.times(BigInt.fromI32(1000000)));
    let aoBatchIndex = aoRem.div(BigInt.fromI32(1000));
    let aoShardId =
      account.toHexString() + "-open-shard-" + aoShardIndex.toI32().toString();
    let aoShard = AccountOpenOrderShard.load(aoShardId);
    if (aoShard == null) {
      aoShard = new AccountOpenOrderShard(aoShardId);
      aoShard.map = aoMap.id;
      aoShard.index = aoShardIndex.toI32();
      aoShard.batchCount = 0;
      aoShard.save();
      aoMap.shardCount = aoMap.shardCount + 1;
      aoMap.save();
    }
    let aoBatchId =
      account.toHexString() +
      "-open-" +
      aoShardIndex.toI32().toString() +
      "-" +
      aoBatchIndex.toI32().toString();
    let aoBatch = AccountOpenOrderBatch.load(aoBatchId);
    if (aoBatch == null) {
      aoBatch = new AccountOpenOrderBatch(aoBatchId);
      aoBatch.shard = aoShard.id;
      aoBatch.index = aoBatchIndex.toI32();
      aoBatch.total = 0;
    }
    aoBatch.total = aoBatch.total + 1;
    aoBatch.save();
    aoMap.nextIndex = aoMap.nextIndex.plus(BigInt.fromI32(1));
    aoMap.save();
    o.accountOpenOrderBatch = aoBatch.id;
    o.openIndex = aoBatch.total - 1;

    let uoMap = UserOpenOrderMap.load(user.id);
    if (uoMap == null) {
      uoMap = new UserOpenOrderMap(user.id);
      uoMap.user = user.id;
      uoMap.nextIndex = BigInt.fromI32(0);
      uoMap.shardCount = 0;
      uoMap.save();
    }
    let uoShardIndex = uoMap.nextIndex.div(BigInt.fromI32(1000000));
    let uoRem = uoMap.nextIndex.minus(uoShardIndex.times(BigInt.fromI32(1000000)));
    let uoBatchIndex = uoRem.div(BigInt.fromI32(1000));
    let uoShardId = user.id + "-open-shard-" + uoShardIndex.toI32().toString();
    let uoShard = UserOpenOrderShard.load(uoShardId);
    if (uoShard == null) {
      uoShard = new UserOpenOrderShard(uoShardId);
      uoShard.map = uoMap.id;
      uoShard.index = uoShardIndex.toI32();
      uoShard.batchCount = 0;
      uoShard.save();
      uoMap.shardCount = uoMap.shardCount + 1;
      uoMap.save();
    }
    let uoBatchId =
      user.id +
      "-open-" +
      uoShardIndex.toI32().toString() +
      "-" +
      uoBatchIndex.toI32().toString();
    let uoBatch = UserOpenOrderBatch.load(uoBatchId);
    if (uoBatch == null) {
      uoBatch = new UserOpenOrderBatch(uoBatchId);
      uoBatch.shard = uoShard.id;
      uoBatch.index = uoBatchIndex.toI32();
      uoBatch.total = 0;
    }
    uoBatch.total = uoBatch.total + 1;
    uoBatch.save();
    uoMap.nextIndex = uoMap.nextIndex.plus(BigInt.fromI32(1));
    uoMap.save();
    o.userOpenOrderBatch = uoBatch.id;
    o.userOpenIndex = uoBatch.total - 1;

    // if (isCloid) {
    //   const slotId = openCloidPointerId(market, userIdDec, cloid);
    //   let slot = CloidSlot.load(slotId);
    //   if (slot == null) {
    //     slot = new CloidSlot(slotId);
    //     slot.market = market;
    //     slot.user = user.id;
    //     slot.cloid = cloid;
    //   }
    //   slot.order = oid;
    //   slot.timestamp = timestamp;
    //   slot.save();
    // }    

    o.save();
  }

  if (kind == "fill") {
    let fid = txItemId(txHash, logIndex);
    let f = new Fill(fid);
    f.block = timestamp;
    f.tx = txHash;
    f.logIndex = logIndex;
    f.market = market;
    f.user = user.id;
    f.account = account;
    f.price = price;
    f.nativeId = isCloid ? null : nativeId;
    f.cloid = isCloid ? cloid : 0;
    f.fillAmount = amountIn;
    f.receivedAmount = amountOut;
    f.remaining = sizeOrRemaining;
  
    let aMap = AccountFillMap.load(account);
    if (aMap == null) {
      aMap = new AccountFillMap(account);
      aMap.account = account;
      aMap.nextIndex = BigInt.fromI32(0);
      aMap.shardCount = 0;
      aMap.save();
    }
    let aShardIndex = aMap.nextIndex.div(BigInt.fromI32(1000000));
    let aRem = aMap.nextIndex.minus(aShardIndex.times(BigInt.fromI32(1000000)));
    let aBatchIndex = aRem.div(BigInt.fromI32(1000));
    let aShardId =
      account.toHexString() + "-fill-shard-" + aShardIndex.toI32().toString();
    let aShard = AccountFillShard.load(aShardId);
    if (aShard == null) {
      aShard = new AccountFillShard(aShardId);
      aShard.map = aMap.id;
      aShard.index = aShardIndex.toI32();
      aShard.batchCount = 0;
      aShard.save();
      aMap.shardCount = aMap.shardCount + 1;
      aMap.save();
    }
    let aBatchId =
      account.toHexString() +
      "-fill-" +
      aShardIndex.toI32().toString() +
      "-" +
      aBatchIndex.toI32().toString();
    let aBatch = AccountFillBatch.load(aBatchId);
    if (aBatch == null) {
      aBatch = new AccountFillBatch(aBatchId);
      aBatch.shard = aShard.id;
      aBatch.index = aBatchIndex.toI32();
      aBatch.total = 0;
    }
    aBatch.total = aBatch.total + 1;
    aBatch.save();
    aMap.nextIndex = aMap.nextIndex.plus(BigInt.fromI32(1));
    aMap.save();
    f.accountBatch = aBatch.id;
  
    let uMap = UserFillMap.load(user.id);
    if (uMap == null) {
      uMap = new UserFillMap(user.id);
      uMap.user = user.id;
      uMap.nextIndex = BigInt.fromI32(0);
      uMap.shardCount = 0;
      uMap.save();
    }
    let uShardIndex = uMap.nextIndex.div(BigInt.fromI32(1000000));
    let uRem = uMap.nextIndex.minus(uShardIndex.times(BigInt.fromI32(1000000)));
    let uBatchIndex = uRem.div(BigInt.fromI32(1000));
    let uShardId = user.id + "-fill-shard-" + uShardIndex.toI32().toString();
    let uShard = UserFillShard.load(uShardId);
    if (uShard == null) {
      uShard = new UserFillShard(uShardId);
      uShard.map = uMap.id;
      uShard.index = uShardIndex.toI32();
      uShard.batchCount = 0;
      uShard.save();
      uMap.shardCount = uMap.shardCount + 1;
      uMap.save();
    }
    let uBatchId =
      user.id +
      "-fill-" +
      uShardIndex.toI32().toString() +
      "-" +
      uBatchIndex.toI32().toString();
    let uBatch = UserFillBatch.load(uBatchId);
    if (uBatch == null) {
      uBatch = new UserFillBatch(uBatchId);
      uBatch.shard = uShard.id;
      uBatch.index = uBatchIndex.toI32();
      uBatch.total = 0;
    }
    uBatch.total = uBatch.total + 1;
    uBatch.save();
    uMap.nextIndex = uMap.nextIndex.plus(BigInt.fromI32(1));
    uMap.save();
    f.userBatch = uBatch.id;
  
    f.save();
    return;
  }
  
  if (kind == "trade") {
    let tid = txItemId(txHash, logIndex);
    let t = new Taker(tid);
    t.block = timestamp;
    t.tx = txHash;
    t.logIndex = logIndex;
    t.market = market;
    t.account = account;
    t.user = user.id;
    t.amountIn = amountIn;
    t.amountOut = amountOut;
    t.startPrice = startPrice;
    t.endPrice = endPrice;
    t.isBuy = isBuy;
    t.timestamp = timestamp;
  
    let aMap = AccountTradeMap.load(account);
    if (aMap == null) {
      aMap = new AccountTradeMap(account);
      aMap.account = account;
      aMap.nextIndex = BigInt.fromI32(0);
      aMap.shardCount = 0;
      aMap.save();
    }
    let aShardIndex = aMap.nextIndex.div(BigInt.fromI32(1000000));
    let aRem = aMap.nextIndex.minus(aShardIndex.times(BigInt.fromI32(1000000)));
    let aBatchIndex = aRem.div(BigInt.fromI32(1000));
    let aShardId =
      account.toHexString() + "-trade-shard-" + aShardIndex.toI32().toString();
    let aShard = AccountTradeShard.load(aShardId);
    if (aShard == null) {
      aShard = new AccountTradeShard(aShardId);
      aShard.map = aMap.id;
      aShard.index = aShardIndex.toI32();
      aShard.batchCount = 0;
      aShard.save();
      aMap.shardCount = aMap.shardCount + 1;
      aMap.save();
    }
    let aBatchId =
      account.toHexString() +
      "-trade-" +
      aShardIndex.toI32().toString() +
      "-" +
      aBatchIndex.toI32().toString();
    let aBatch = AccountTradeBatch.load(aBatchId);
    if (aBatch == null) {
      aBatch = new AccountTradeBatch(aBatchId);
      aBatch.shard = aShard.id;
      aBatch.index = aBatchIndex.toI32();
      aBatch.total = 0;
    }
    aBatch.total = aBatch.total + 1;
    aBatch.save();
    aMap.nextIndex = aMap.nextIndex.plus(BigInt.fromI32(1));
    aMap.save();
    t.accountBatch = aBatch.id;
  
    let uMap = UserTradeMap.load(user.id);
    if (uMap == null) {
      uMap = new UserTradeMap(user.id);
      uMap.user = user.id;
      uMap.nextIndex = BigInt.fromI32(0);
      uMap.shardCount = 0;
      uMap.save();
    }
    let uShardIndex = uMap.nextIndex.div(BigInt.fromI32(1000000));
    let uRem = uMap.nextIndex.minus(uShardIndex.times(BigInt.fromI32(1000000)));
    let uBatchIndex = uRem.div(BigInt.fromI32(1000));
    let uShardId = user.id + "-trade-shard-" + uShardIndex.toI32().toString();
    let uShard = UserTradeShard.load(uShardId);
    if (uShard == null) {
      uShard = new UserTradeShard(uShardId);
      uShard.map = uMap.id;
      uShard.index = uShardIndex.toI32();
      uShard.batchCount = 0;
      uShard.save();
      uMap.shardCount = uMap.shardCount + 1;
      uMap.save();
    }
    let uBatchId =
      user.id +
      "-trade-" +
      uShardIndex.toI32().toString() +
      "-" +
      uBatchIndex.toI32().toString();
    let uBatch = UserTradeBatch.load(uBatchId);
    if (uBatch == null) {
      uBatch = new UserTradeBatch(uBatchId);
      uBatch.shard = uShard.id;
      uBatch.index = uBatchIndex.toI32();
      uBatch.total = 0;
    }
    uBatch.total = uBatch.total + 1;
    uBatch.save();
    uMap.nextIndex = uMap.nextIndex.plus(BigInt.fromI32(1));
    uMap.save();
    t.userBatch = uBatch.id;
  
    t.save();

    for (let r = 48; r >= 0; r--) {
      let oldId = market.toHexString() + "#" + r.toString();
      let item = MarketRecentTrade.load(oldId);
      if (item != null) {
        store.remove("MarketRecentTrade", oldId);
        let moved = new MarketRecentTrade(market.toHexString() + "#" + (r + 1).toString());
        moved.market = market;
        moved.rank = r + 1;
        moved.trade = item.trade;
        moved.save();
      }
    }

    let tail49 = market.toHexString() + "#49";
    store.remove("MarketRecentTrade", tail49);

    let head = new MarketRecentTrade(market.toHexString() + "#0");
    head.market = market;
    head.rank = 0;
    head.trade = tid;
    head.save();

    return;
  }
}

export function updateOrder(
  market: Bytes,
  userIdDec: string,
  isCloid: boolean,
  cloid: i32,
  nativeId: BigInt,
  price: BigInt,
  newRemaining: BigInt,
  updatedAt: BigInt
): void {
  if (isCloid) {
    // const slotId = openCloidPointerId(market, userIdDec, cloid);
    // const slot = CloidSlot.load(slotId);
    // if (slot != null) {
    //   const o = Order.load(slot.order);
    //   if (o != null) {
    //     o.remainingSize = newRemaining;
    //     o.updatedAt = updatedAt;
    //     o.save();
    //   }
    // } 
    return;
  } else {
    let oid = orderIdNative(market, price, nativeId);
    let o = Order.load(oid);
    if (o != null) {
      o.remainingSize = newRemaining;
      o.updatedAt = updatedAt;
      o.save();
    }
  }
}

export function closeOrder(
  market: Bytes,
  userIdDec: string,
  isCloid: boolean,
  cloid: i32,
  nativeId: BigInt,
  price: BigInt,
  statusCode: i32,
  updatedAt: BigInt
): void {
  if (isCloid) {
    return;
    // const slotId = openCloidPointerId(market, userIdDec, cloid);
    // let slot = CloidSlot.load(slotId);
    // if (slot != null) {
    //   let oid = slot.order;
    //   let o = Order.load(oid);
    //   if (o != null) {
    //     o.accountOpenOrderBatch = null;
    //     o.userOpenOrderBatch = null;
    //     o.unset("openIndex");
    //     o.unset("userOpenIndex");
    //     o.status = statusCode;
    //     o.updatedAt = updatedAt;
    //     o.save();
    //   }

    //   store.remove("CloidSlot", slotId);
    // }
  } else {
    let oid = orderIdNative(market, price, nativeId);
    let o = Order.load(oid);
    if (o != null) {
      o.status = statusCode;
      o.updatedAt = updatedAt;
      o.accountOpenOrderBatch = null;
      o.userOpenOrderBatch = null;
      o.unset("openIndex");
      o.unset("userOpenIndex");
      o.save();
    }       
  }
}