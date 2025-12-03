import {
  Fill as OrderFilledEvent,
  OrdersUpdated as OrdersUpdatedEvent,
  Trade as TradeEvent,
  MarketCreated as MarketCreatedEvent,
  UserRegistered as UserRegisteredEvent,
  TokenCreated as TokenCreatedEvent,
  Migrated as MigratedEvent,
  LaunchpadTrade as LaunchpadTradeEvent,
} from "../generated/CrystalRouter/Crystal";
import {
  Account,
  Market,
  UserId,
  LaunchpadToken,
  LaunchpadTrade,
  LaunchpadBuyer,
  LaunchpadSeller,
  LaunchpadPosition,
  AccountLaunchpadTradeMap,
  AccountLaunchpadTradeBatch,
  AccountOrderMap, 
  AccountOrderShard,
  AccountOpenOrderMap, 
  AccountOpenOrderShard,
  AccountFillMap, 
  AccountFillShard,
  AccountTradeMap, 
  AccountTradeShard,
  UserOrderMap, 
  UserOrderShard,
  UserOpenOrderMap, 
  UserOpenOrderShard,
  UserFillMap, 
  UserFillShard,
  UserTradeMap, 
  UserTradeShard,
  Lookup,
  Series,
  Token,
  LaunchpadRecentTrade,
} from "../generated/schema";
import { Erc20Token } from "../generated/templates";
import { Transfer } from "../generated/templates/Erc20Token/ERC20";
import { BigInt, Bytes, ethereum, Address, store } from "@graphprotocol/graph-ts";
import { decodeOrderInfo, decodeOrdersUpdated, decodeOrderData } from "./decoder";
import { addOrder, updateOrder, closeOrder } from "./batching";
import { updateKlinesFromTrade, copyKlines } from "./klines";
import {
  launchpadTradeId,
  launchpadPositionId,
  accountLaunchpadBatchId,
  seriesId,
} from "./ids";

function ensureSeriesLink(tok: LaunchpadToken, tokenBytes: Bytes, secs: i32): void {
  const sid = seriesId(tokenBytes, secs);
  let s = Series.load(sid);
  if (s == null) { s = new Series(sid); s.save(); }

  switch (secs) {
    case 1: tok.series1 = s.id; break;
    case 5: tok.series5 = s.id; break;
    case 15: tok.series15 = s.id; break;
    case 60: tok.series60 = s.id; break;
    case 300: tok.series300 = s.id; break;
    case 900: tok.series900 = s.id; break;
    case 3600: tok.series3600 = s.id; break;
    case 14400: tok.series14400 = s.id; break;
    case 86400: tok.series86400 = s.id; break;
    default: break;
  }
}

function ensureLaunchpadSeriesLinks(tok: LaunchpadToken): void {
  const tokenBytes = tok.id as Bytes;
  ensureSeriesLink(tok, tokenBytes, 1);
  ensureSeriesLink(tok, tokenBytes, 5);
  ensureSeriesLink(tok, tokenBytes, 15);
  ensureSeriesLink(tok, tokenBytes, 60);
  ensureSeriesLink(tok, tokenBytes, 300);
  ensureSeriesLink(tok, tokenBytes, 900);
  ensureSeriesLink(tok, tokenBytes, 3600);
  ensureSeriesLink(tok, tokenBytes, 14400);
  ensureSeriesLink(tok, tokenBytes, 86400);
}

function ensureAccount(a: Bytes): Account {
  let acc = Account.load(a);
  if (acc == null) {
    acc = new Account(a);
    acc.tokensLaunched = 0;
    acc.tokensGraduated = 0;
    acc.save();
  }
  return acc as Account;
}

function ensurePos(tok: LaunchpadToken, acc: Account, nowTs: BigInt): LaunchpadPosition {
  const pid = launchpadPositionId(tok.id as Bytes, acc.id as Bytes);
  let p = LaunchpadPosition.load(pid);
  if (p == null) {
    p = new LaunchpadPosition(pid);
    p.token = tok.id;
    p.account = acc.id;
    p.tokenBought = BigInt.fromI32(0);
    p.tokenSold = BigInt.fromI32(0);
    p.nativeSpent = BigInt.fromI32(0);
    p.nativeReceived = BigInt.fromI32(0);
    p.tokens = BigInt.fromI32(0);
    p.realized = BigInt.fromI32(0);
    p.lastUpdatedAt = nowTs;
  }
  return p as LaunchpadPosition;
}

function pow2(exp: i32): BigInt {
  let two = BigInt.fromI32(2);
  let out = BigInt.fromI32(1);
  for (let i = 0; i < exp; i++) out = out.times(two);
  return out;
}

function createToken(addr: Address, symbol: string, name: string, decimals: BigInt): void {
  const id = addr.toHexString();
  let t = Token.load(id);
  if (t) return;

  t = new Token(id);
  t.symbol = symbol;
  t.name = name;
  t.decimals = decimals;
  t.save();
}

export function handleMarketCreated(event: MarketCreatedEvent): void {
  let m = Market.load(event.params.market);
  if (m == null) {
    m = new Market(event.params.market);
    m.timestamp = event.block.timestamp;
    m.volume = BigInt.fromI32(0);
  }
  m.isCanonical = event.params.isCanonical;
  m.quoteAsset = event.params.quoteAsset;
  m.baseAsset = event.params.baseAsset;
  m.quoteToken = event.params.quoteInfo.token;
  m.quoteDecimals = event.params.quoteInfo.decimals;
  m.quoteTicker = event.params.quoteInfo.ticker;
  m.quoteName = event.params.quoteInfo.name;
  m.baseToken = event.params.baseInfo.token;
  m.baseDecimals = event.params.baseInfo.decimals;
  m.baseTicker = event.params.baseInfo.ticker;
  m.baseName = event.params.baseInfo.name;
  m.marketId = event.params.marketInfo.marketId;
  m.marketType = event.params.marketInfo.marketType;
  m.scaleFactor = event.params.marketInfo.scaleFactor.toI32();
  m.tickSize = event.params.marketInfo.tickSize;
  m.maxPrice = event.params.marketInfo.maxPrice;
  m.minSize = event.params.marketInfo.minSize;
  m.takerFee = event.params.marketInfo.takerFee;
  m.makerRebate = event.params.marketInfo.makerRebate;
  m.latestPrice = BigInt.fromI32(0);

  createToken(event.params.quoteInfo.token, event.params.quoteInfo.ticker, event.params.quoteInfo.name, event.params.quoteInfo.decimals);
  createToken(event.params.baseInfo.token, event.params.baseInfo.ticker, event.params.baseInfo.name, event.params.baseInfo.decimals);

  if (event.params.isCanonical) {
    let l = new Lookup(event.params.quoteInfo.token.toHexString() + "-" + event.params.baseInfo.token.toHexString());
    l.address = event.params.market;
    l.save();
  }

  let tok = LaunchpadToken.load(event.params.baseAsset);
  if (tok != null && tok.migrated) {
    tok.migratedMarket = event.params.market;
    m.metadataCID = tok.metadataCID;
    ensureLaunchpadSeriesLinks(tok);
    tok.save();
    copyKlines(event.params.baseAsset as Bytes, event.params.market, event.block.timestamp);
  }

  m.save();
}

export function handleUserRegistered(event: UserRegisteredEvent): void {
  let acct = Account.load(event.params.user);
  if (acct == null) {
    acct = new Account(event.params.user);
    acct.tokensLaunched = 0;
    acct.tokensGraduated = 0;
    acct.save();
  }

  let aom = AccountOrderMap.load(acct.id);
  if (aom == null) {
    aom = new AccountOrderMap(acct.id);
    aom.account = acct.id;
    aom.nextIndex = BigInt.fromI32(0);
    aom.shardCount = 1;
    aom.save();

    let shardId = acct.id.toHexString() + "-ord-shard-0";
    let aomShard = new AccountOrderShard(shardId);
    aomShard.map = aom.id;
    aomShard.index = 0;
    aomShard.batchCount = 0;
    aomShard.save();
  }

  let aoom = AccountOpenOrderMap.load(acct.id);
  if (aoom == null) {
    aoom = new AccountOpenOrderMap(acct.id);
    aoom.account = acct.id;
    aoom.nextIndex = BigInt.fromI32(0);
    aoom.shardCount = 1;
    aoom.save();

    let shardId = acct.id.toHexString() + "-open-shard-0";
    let openShard = new AccountOpenOrderShard(shardId);
    openShard.map = aoom.id;
    openShard.index = 0;
    openShard.batchCount = 0;
    openShard.save();
  }

  let afm = AccountFillMap.load(acct.id);
  if (afm == null) {
    afm = new AccountFillMap(acct.id);
    afm.account = acct.id;
    afm.nextIndex = BigInt.fromI32(0);
    afm.shardCount = 1;
    afm.save();

    let shardId = acct.id.toHexString() + "-fill-shard-0";
    let fillShard = new AccountFillShard(shardId);
    fillShard.map = afm.id;
    fillShard.index = 0;
    fillShard.batchCount = 0;
    fillShard.save();
  }

  let atm = AccountTradeMap.load(acct.id);
  if (atm == null) {
    atm = new AccountTradeMap(acct.id);
    atm.account = acct.id;
    atm.nextIndex = BigInt.fromI32(0);
    atm.shardCount = 1;
    atm.save();

    let shardId = acct.id.toHexString() + "-trade-shard-0";
    let tradeShard = new AccountTradeShard(shardId);
    tradeShard.map = atm.id;
    tradeShard.index = 0;
    tradeShard.batchCount = 0;
    tradeShard.save();
  }

  let alptm = AccountLaunchpadTradeMap.load(acct.id);
  if (alptm == null) {
    alptm = new AccountLaunchpadTradeMap(acct.id);
    alptm.account = acct.id;
    alptm.counter = 0;
    alptm.save();
  }

  let uid = event.params.userId.toString();
  let u = UserId.load(uid);
  if (u == null) {
    u = new UserId(uid);
    u.account = event.params.user;
    u.isMargin = event.params.isMargin;
    u.timestamp = event.block.timestamp;
    u.save();
  }

  let uom = UserOrderMap.load(uid);
  if (uom == null) {
    uom = new UserOrderMap(uid);
    uom.user = uid;
    uom.nextIndex = BigInt.fromI32(0);
    uom.shardCount = 1;
    uom.save();

    let shardId = uid + "-ord-shard-0";
    let uomShard = new UserOrderShard(shardId);
    uomShard.map = uom.id;
    uomShard.index = 0;
    uomShard.batchCount = 0;
    uomShard.save();
  }

  let uoom = UserOpenOrderMap.load(uid);
  if (uoom == null) {
    uoom = new UserOpenOrderMap(uid);
    uoom.user = uid;
    uoom.nextIndex = BigInt.fromI32(0);
    uoom.shardCount = 1;
    uoom.save();

    let shardId = uid + "-open-shard-0";
    let uOpenShard = new UserOpenOrderShard(shardId);
    uOpenShard.map = uoom.id;
    uOpenShard.index = 0;
    uOpenShard.batchCount = 0;
    uOpenShard.save();
  }

  let ufm = UserFillMap.load(uid);
  if (ufm == null) {
    ufm = new UserFillMap(uid);
    ufm.user = uid;
    ufm.nextIndex = BigInt.fromI32(0);
    ufm.shardCount = 1;
    ufm.save();

    let shardId = uid + "-fill-shard-0";
    let uFillShard = new UserFillShard(shardId);
    uFillShard.map = ufm.id;
    uFillShard.index = 0;
    uFillShard.batchCount = 0;
    uFillShard.save();
  }

  let utm = UserTradeMap.load(uid);
  if (utm == null) {
    utm = new UserTradeMap(uid);
    utm.user = uid;
    utm.nextIndex = BigInt.fromI32(0);
    utm.shardCount = 1;
    utm.save();

    let shardId = uid + "-trade-shard-0";
    let uTradeShard = new UserTradeShard(shardId);
    uTradeShard.map = utm.id;
    uTradeShard.index = 0;
    uTradeShard.batchCount = 0;
    uTradeShard.save();
  }
}

export function handleTrade(event: TradeEvent): void {
  const marketAddress = event.params.market.toHexString();
  const userAddress = event.params.user.toHexString();
  let userId = "";
  let acc = Account.load(Bytes.fromHexString(userAddress) as Bytes);
  if (acc != null) {
    let users = acc.userIds.load();
    if (users.length > 0) userId = users[0].id;
  }
  if (userId == "") return;

  const isBuy = event.params.isBuy;
  const amountIn = event.params.amountIn;
  const amountOut = event.params.amountOut;
  const startPrice = event.params.startPrice;
  const endPrice = event.params.endPrice;

  const market = Bytes.fromHexString(marketAddress) as Bytes;
  const account = Bytes.fromHexString(userAddress) as Bytes;

  let m = Market.load(market);
  if (m == null) return;
  m.latestPrice = endPrice;
  m.save();

  addOrder(
    "trade",
    market,
    account,
    userId,
    isBuy,
    BigInt.fromI32(0),
    false,
    0,
    BigInt.fromI32(0),
    BigInt.fromI32(0),
    event.block.timestamp,
    event.transaction.hash,
    event.logIndex,
    amountIn,
    amountOut,
    startPrice,
    endPrice
  );

  updateKlinesFromTrade(
    market,
    event.block.timestamp,
    isBuy,
    amountIn,
    amountOut,
    startPrice,
    endPrice
  );

  m = Market.load(market);
  if (m == null) return;
  const exp = m.quoteDecimals.plus(BigInt.fromI32(m.scaleFactor)).minus(m.baseDecimals).toI32();
  let pf = BigInt.fromI32(1);
  const TEN = BigInt.fromI32(10);
  for (let i = 0; i < exp; i++) pf = pf.times(TEN);
  let base = m.baseAsset as Bytes;

  let tok = LaunchpadToken.load(base);
  if (tok == null) return;

  const WAD = BigInt.fromString("1000000000");
  const priceWad = endPrice.times(WAD).div(pf);

  const vToken = WAD;
  const vNative = priceWad;

  let params = new Array<ethereum.EventParam>();
  params.push(new ethereum.EventParam("token", ethereum.Value.fromAddress(Address.fromBytes(base))));
  params.push(new ethereum.EventParam("user", ethereum.Value.fromAddress(Address.fromBytes(account))));
  params.push(new ethereum.EventParam("isBuy", ethereum.Value.fromBoolean(isBuy)));
  params.push(new ethereum.EventParam("amountIn", ethereum.Value.fromUnsignedBigInt(amountIn)));
  params.push(new ethereum.EventParam("amountOut", ethereum.Value.fromUnsignedBigInt(amountOut)));
  params.push(new ethereum.EventParam("virtualNativeReserve", ethereum.Value.fromUnsignedBigInt(vNative)));
  params.push(new ethereum.EventParam("virtualTokenReserve", ethereum.Value.fromUnsignedBigInt(vToken)));

  const mirrorEvt = new ethereum.Event(
    event.address,
    event.logIndex,
    event.transactionLogIndex,
    null,
    event.block,
    event.transaction,
    params,
    event.receipt
  );

  handleLaunchpadTrade(changetype<LaunchpadTradeEvent>(mirrorEvt));
}

export function handleOrdersUpdated(event: OrdersUpdatedEvent): void {
  const userAddress = event.params.user.toHexString();
  let userId = "";
  let acc = Account.load(event.params.user);
  if (acc != null) {
    let users = acc.userIds.load();
    if (users.length > 0) userId = users[0].id;
  }
  const chunks = decodeOrdersUpdated(event);
  
  for (let i = 0; i < chunks.length; i++) {
    const r = decodeOrderData(chunks[i]);
    const action = I32.parseInt(r[0], 10);
    const isBuy = r[1] == "1";
    const price = BigInt.fromString(r[2]);
    const isCloid = r[4] == "1";
    const cloid = I32.parseInt(r[5], 10);
    const nativeId = BigInt.fromString(r[6]);
    const sizeOrRemaining = BigInt.fromString(r[7]);

    if (action == 2 || action == 3) {
      addOrder(
        "placement",
        event.params.market,
        Bytes.fromHexString(userAddress),
        userId,
        isBuy,
        price,
        isCloid,
        cloid,
        nativeId,
        sizeOrRemaining,
        event.block.timestamp,
        event.transaction.hash,
        event.logIndex,
        BigInt.fromI32(0),
        BigInt.fromI32(0),
        BigInt.fromI32(0),
        BigInt.fromI32(0)
      );
      continue;
    }

    if (action == 4 || action == 5) {
      updateOrder(
        event.params.market,
        userId,
        isCloid,
        cloid,
        nativeId,
        price,
        sizeOrRemaining,
        event.block.timestamp,
      );
      continue;
    }

    if (action == 0 || action == 1) {
      closeOrder(
        event.params.market,
        userId,
        isCloid,
        cloid,
        nativeId,
        price,
        0,
        event.block.timestamp,
      );
      continue;
    }
  }
}

export function handleOrderFilled(event: OrderFilledEvent): void {
  let userId = "";
  let acc = Account.load(event.params.user);
  if (acc != null) {
    let users = acc.userIds.load();
    if (users.length > 0) userId = users[0].id;
  }
  const u = UserId.load(userId);
  if (u == null) return;

  const account = u.account;

  const info = decodeOrderInfo(event.params.fillInfo);
  const price = BigInt.fromString(info[0]);
  const isCloid = info[2] == "1";
  const cloid = I32.parseInt(info[3], 10);
  const nativeId = BigInt.fromString(info[4]);
  const remaining = BigInt.fromString(info[5]);

  const TWO_POW_128 = pow2(128);
  const packed = event.params.fillAmount;
  const receivedAmount = packed.div(TWO_POW_128);
  const fillAmount = packed.minus(receivedAmount.times(TWO_POW_128));

  addOrder(
    "fill",
    event.params.market,
    account,
    userId,
    false,
    price,
    isCloid,
    cloid,
    nativeId,
    remaining,
    event.block.timestamp,
    event.transaction.hash,
    event.logIndex,
    fillAmount,
    receivedAmount,
    BigInt.fromI32(0),
    BigInt.fromI32(0)
  );

  if (remaining.isZero()) {
    closeOrder(
      event.params.market,
      userId,
      isCloid,
      cloid,
      nativeId,
      price,
      1,
      event.block.timestamp,
    );
  } else {
    updateOrder(
      event.params.market,
      userId,
      isCloid,
      cloid,
      nativeId,
      price,
      remaining,
      event.block.timestamp,
    );
  }
}

export function handleTokenCreated(event: TokenCreatedEvent): void {
  let acct = Account.load(event.params.creator);
  if (acct == null) {
    acct = new Account(event.params.creator);
    acct.tokensLaunched = 0;
    acct.tokensGraduated = 0;
    acct.save();
  }

  let t = LaunchpadToken.load(event.params.token);
  if (t == null) {
    t = new LaunchpadToken(event.params.token);
    t.creator = acct.id;
    t.timestamp = event.block.timestamp;
    t.migrated = false;
    t.decimals = 18;

    let tenPow = BigInt.fromString("1000000000");

    t.initialSupply = BigInt.fromString("1000000000").times(tenPow);
    t.volumeNative = BigInt.fromI32(0);
    t.volumeToken = BigInt.fromI32(0);
    t.buyTxs = 0;
    t.sellTxs = 0;
    t.distinctBuyers = 0;
    t.distinctSellers = 0;
    t.lastPriceNativePerTokenWad = BigInt.fromI32(0);
    t.lastUpdatedAt = event.block.timestamp;
  }
  t.name = event.params.name;
  t.symbol = event.params.symbol;
  t.metadataCID = event.params.metadataCID;
  t.description = event.params.description;
  t.social1 = event.params.social1;
  t.social2 = event.params.social2;
  t.social3 = event.params.social3;
  t.social4 = event.params.social4;
  t.totalHolders = 0;
  t.devHoldingAmount = BigInt.fromI32(0);
  ensureLaunchpadSeriesLinks(t);
  let a = t.creator;
  let acc = Account.load(a);
  if (acc != null) {
    acc.tokensLaunched = acc.tokensLaunched + 1;
    acc.save();
  }
  t.save();

  Erc20Token.create(event.params.token);
}

export function handleMigrated(event: MigratedEvent): void {
  let t = LaunchpadToken.load(event.params.token);
  if (t != null) {
    t.migrated = true;
    t.migratedAt = event.block.timestamp;
    let a = t.creator;
    let acc = Account.load(a);
    if (acc != null) {
      acc.tokensGraduated = acc.tokensGraduated + 1;
      acc.save();
    }
    t.save();
  }
}

export function handleLaunchpadTrade(event: LaunchpadTradeEvent): void {
  let tok = LaunchpadToken.load(event.params.token);
  if (tok == null) {
    tok = new LaunchpadToken(event.params.token);
    tok.creator = event.params.user;
    tok.name = "";
    tok.symbol = "";
    tok.decimals = 18;
    tok.initialSupply = BigInt.fromI32(0);
    tok.timestamp = event.block.timestamp;
    tok.migrated = false;
    tok.volumeNative = BigInt.fromI32(0);
    tok.volumeToken = BigInt.fromI32(0);
    tok.buyTxs = 0;
    tok.sellTxs = 0;
    tok.distinctBuyers = 0;
    tok.distinctSellers = 0;
    tok.lastPriceNativePerTokenWad = BigInt.fromI32(0);
    tok.lastUpdatedAt = event.block.timestamp;
    ensureLaunchpadSeriesLinks(tok);
    tok.save();
  }

  let acct = ensureAccount(event.params.user);

  const WAD = BigInt.fromString("1000000000");

  let priceWad = BigInt.fromI32(0);
  if (!event.params.virtualTokenReserve.isZero()) {
    priceWad = event.params.virtualNativeReserve.times(WAD).div(event.params.virtualTokenReserve);
  } else {
    if (event.params.isBuy) {
      if (!event.params.amountOut.isZero()) {
        priceWad = event.params.amountIn.times(WAD).div(event.params.amountOut);
      }
    } else {
      if (!event.params.amountIn.isZero()) {
        priceWad = event.params.amountOut.times(WAD).div(event.params.amountIn);
      }
    }
  }

  let id = launchpadTradeId(event.transaction.hash, event.logIndex);
  let tr = new LaunchpadTrade(id);
  tr.block = event.block.timestamp;
  tr.tx = event.transaction.hash;
  tr.logIndex = event.logIndex;
  tr.token = tok.id;
  tr.account = acct.id;
  tr.isBuy = event.params.isBuy;
  tr.amountIn = event.params.amountIn;
  tr.amountOut = event.params.amountOut;
  tr.priceNativePerTokenWad = priceWad;
  tr.virtualNativeReserve = event.params.virtualNativeReserve;
  tr.virtualTokenReserve = event.params.virtualTokenReserve;
  tr.timestamp = event.block.timestamp;

  let m = AccountLaunchpadTradeMap.load(acct.id);
  if (m == null) { m = new AccountLaunchpadTradeMap(acct.id); m.account = acct.id; m.counter = 0; m.save(); }
  let idx = m.counter;
  let batchIdx = idx / 1000;
  let batchId = accountLaunchpadBatchId(acct.id as Bytes, batchIdx);
  let b = AccountLaunchpadTradeBatch.load(batchId);
  if (b == null) { b = new AccountLaunchpadTradeBatch(batchId); b.map = m.id; b.index = batchIdx; b.total = 0; }
  b.total = b.total + 1; b.save();
  m.counter = m.counter + 1; m.save();
  tr.map = m.id; tr.batch = b.id; tr.save();

  for (let r = 48; r >= 0; r--) {
    let oldId = tok.id.toHexString() + "#" + r.toString();
    let item = LaunchpadRecentTrade.load(oldId);
    if (item != null) {
      store.remove("LaunchpadRecentTrade", oldId);
      let moved = new LaunchpadRecentTrade(tok.id.toHexString() + "#" + (r + 1).toString());
      moved.token = tok.id;
      moved.rank = r + 1;
      moved.trade = item.trade;
      moved.save();
    }
  }

  let tail49 = tok.id.toHexString() + "#49";
  store.remove("LaunchpadRecentTrade", tail49);

  let head = new LaunchpadRecentTrade(tok.id.toHexString() + "#0");
  head.token = tok.id;
  head.rank = 0;
  head.trade = id;
  head.save();

  if (event.params.isBuy) {
    tok.volumeNative = tok.volumeNative.plus(event.params.amountIn);
    tok.volumeToken = tok.volumeToken.plus(event.params.amountOut);
    tok.buyTxs += 1;

    const buyerId = tok.id.toHexString() + "-" + acct.id.toHexString();
    let seenB = LaunchpadBuyer.load(buyerId);
    if (seenB == null) { seenB = new LaunchpadBuyer(buyerId); seenB.token = tok.id; seenB.account = acct.id; seenB.save(); tok.distinctBuyers += 1; }
  } else {
    tok.volumeNative = tok.volumeNative.plus(event.params.amountOut);
    tok.volumeToken  = tok.volumeToken.plus(event.params.amountIn);
    tok.sellTxs += 1;

    const sellerId = tok.id.toHexString() + "-" + acct.id.toHexString();
    let seenS = LaunchpadSeller.load(sellerId);
    if (seenS == null) { seenS = new LaunchpadSeller(sellerId); seenS.token = tok.id; seenS.account = acct.id; seenS.save(); tok.distinctSellers += 1; }
  }
  tok.lastPriceNativePerTokenWad = priceWad;
  tok.lastUpdatedAt = event.block.timestamp;
  tok.save();

  const posId = launchpadPositionId(tok.id as Bytes, acct.id as Bytes);
  let p = LaunchpadPosition.load(posId);
  if (p == null) {
    p = new LaunchpadPosition(posId);
    p.token = tok.id;
    p.account = acct.id;
    p.tokenBought = BigInt.fromI32(0);
    p.tokenSold = BigInt.fromI32(0);
    p.nativeSpent = BigInt.fromI32(0);
    p.nativeReceived = BigInt.fromI32(0);
    p.realized = BigInt.fromI32(0);
    p.tokens = BigInt.fromI32(0);
    p.lastUpdatedAt = event.block.timestamp;
  }

  if (event.params.isBuy) {
    p.tokenBought = p.tokenBought.plus(event.params.amountOut);
    p.nativeSpent = p.nativeSpent.plus(event.params.amountIn);
    p.realized = p.nativeReceived.minus(p.nativeSpent);
  } else {
    p.tokenSold = p.tokenSold.plus(event.params.amountIn);
    p.nativeReceived = p.nativeReceived.plus(event.params.amountOut);
    p.realized = p.nativeReceived.minus(p.nativeSpent);
  }
  p.lastUpdatedAt = event.block.timestamp;
  p.save();

  const isBuy = event.params.isBuy;
  let firstAmount: BigInt; let secondAmount: BigInt;
  if (isBuy) { 
    firstAmount = event.params.amountIn; 
    secondAmount = event.params.amountOut; 
  } else { 
    firstAmount = event.params.amountOut; 
    secondAmount = event.params.amountIn; 
  }

  updateKlinesFromTrade(
    event.params.token,
    event.block.timestamp,
    isBuy,
    firstAmount,
    secondAmount,
    priceWad,
    priceWad
  );
}

export function handleTransfer(event: Transfer): void {
  let tok = LaunchpadToken.load(event.address);
  if (tok == null) return;

  const ZERO = Bytes.fromHexString("0x0000000000000000000000000000000000000000") as Bytes;
  const nowTs = event.block.timestamp;
  const ZERO_I = BigInt.fromI32(0);

  if (event.params.from.notEqual(ZERO)) {
    const fromAcc = ensureAccount(event.params.from);
    let fromPos = ensurePos(tok as LaunchpadToken, fromAcc, nowTs);

    const prev = fromPos.tokens;
    fromPos.tokens = fromPos.tokens.ge(event.params.value) ? fromPos.tokens.minus(event.params.value) : ZERO_I;
    const now = fromPos.tokens;

    if (prev.gt(ZERO_I) && now.equals(ZERO_I)) {
      tok.totalHolders = tok.totalHolders - 1;
    }

    if (fromAcc.id.equals(tok.creator)) {
      tok.devHoldingAmount = now;
    }

    fromPos.lastUpdatedAt = nowTs;
    fromPos.save();
  }

  if (event.params.to.notEqual(ZERO)) {
    const toAcc = ensureAccount(event.params.to);
    let toPos = ensurePos(tok as LaunchpadToken, toAcc, nowTs);

    const prev = toPos.tokens;
    toPos.tokens = toPos.tokens.plus(event.params.value);
    const now = toPos.tokens;

    if (prev.equals(ZERO_I) && now.gt(ZERO_I)) {
      tok.totalHolders = tok.totalHolders + 1;
    }

    if (toAcc.id.equals(tok.creator)) {
      tok.devHoldingAmount = now;
    }

    toPos.lastUpdatedAt = nowTs;
    toPos.save();
  }

  tok.lastUpdatedAt = nowTs;
  tok.save();
}