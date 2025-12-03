import { Address, BigInt, Bytes, log } from "@graphprotocol/graph-ts";
import {
  VaultDeployed as VaultDeployedEvent,
  Deposit as DepositEvent,
  Withdraw as WithdrawEvent,
  Locked as LockedEvent,
  Unlocked as UnlockedEvent,
  Closed as ClosedEvent,
} from "../generated/CrystalVaultFactory/CrystalVaultFactory";
import {
  Token,
  Account,
  Vault,
  UserVaultPosition,
  Deposit,
  Withdrawal,
} from "../generated/schema";

function tokenKey(addr: Address): string {
  return addr.toHexString();
}

function getOrCreateAccount(addr: Address): Account {
  const id = Bytes.fromHexString(addr.toHexString());
  let a = Account.load(id);
  if (a) return a as Account;
  a = new Account(id);
  a.tokensLaunched = 0;
  a.tokensGraduated = 0;
  a.save();
  return a as Account;
}

function getOrCreateToken(addr: Address): Token { // fix new tokens
  const id = tokenKey(addr);
  let t = Token.load(id);
  if (t) return t as Token;

  t = new Token(id);
  t.save();
  return t as Token;
}

function getOrCreatePosition(
  vaultId: string,
  acct: Address,
  ts: BigInt
): UserVaultPosition {
  const id = vaultId + "-" + acct.toHexString();
  let p = UserVaultPosition.load(id);
  if (p) return p as UserVaultPosition;

  const a = getOrCreateAccount(acct);

  p = new UserVaultPosition(id);
  p.vault = vaultId;
  p.account = a.id;
  p.shares = BigInt.zero();
  p.depositCount = 0;
  p.withdrawCount = 0;
  p.totalDepositedQuote = BigInt.zero();
  p.totalDepositedBase = BigInt.zero();
  p.totalWithdrawnQuote = BigInt.zero();
  p.totalWithdrawnBase = BigInt.zero();
  p.createdAt = ts;
  p.updatedAt = ts;
  p.save();

  return p as UserVaultPosition;
}

export function handleVaultDeployed(e: VaultDeployedEvent): void {
  const id = e.params.vault.toHexString();
  let v = Vault.load(id);
  if (v != null) {
    log.warning("vault {} already exists; ignoring redeploy?", [id]);
    return;
  }

  const quote = getOrCreateToken(e.params.quoteAsset);
  const base = getOrCreateToken(e.params.baseAsset);
  const _ = getOrCreateAccount(e.params.owner);

  v = new Vault(id);
  v.owner = e.params.owner;
  v.factory = e.address;
  v.quoteAsset = quote.id;
  v.baseAsset = base.id;
  v.name = e.params.metadata.name;
  v.symbol = base.id + "-" + quote.id;
  v.description = e.params.metadata.description;
  v.social1 = e.params.metadata.social1;
  v.social2 = e.params.metadata.social2;
  v.social3 = e.params.metadata.social3;
  v.lockup = e.params.lockup;
  v.decreaseOnWithdraw = e.params.decreaseOnWithdraw;
  v.locked = false;
  v.closed = false;
  v.maxShares = e.params.maxShares;
  v.totalShares = BigInt.zero();
  v.quoteBalance = BigInt.zero();
  v.baseBalance = BigInt.zero();
  v.depositCount = 0;
  v.withdrawalCount = 0;
  v.uniqueDepositors = 0;
  v.createdAt = e.block.timestamp;
  v.createdBlock = e.block.number;
  v.createdTx = e.transaction.hash;
  v.lastUpdatedAt = e.block.timestamp;
  v.totalShares = BigInt.zero();
  v.save();
}

export function handleDeposit(e: DepositEvent): void {
  const vaultId = e.params.vault.toHexString();
  const v = Vault.load(vaultId);
  if (v == null) return;

  const acct = getOrCreateAccount(e.params.sender);
  const p = getOrCreatePosition(vaultId, e.params.sender, e.block.timestamp);

  const d = new Deposit(
    e.transaction.hash.toHexString() + "-" + e.logIndex.toString()
  );
  d.vault = vaultId;
  d.account = acct.id;
  d.shares = e.params.shares;
  d.amountQuote = e.params.quoteAmount;
  d.amountBase = e.params.baseAmount;
  d.txHash = e.transaction.hash;
  d.timestamp = e.block.timestamp;
  d.blockNumber = e.block.number;
  d.save();

  v.quoteBalance = v.quoteBalance.plus(e.params.quoteAmount);
  v.baseBalance = v.baseBalance.plus(e.params.baseAmount);
  v.totalShares = v.totalShares.plus(e.params.shares);
  v.depositCount = v.depositCount + 1;
  v.lastUpdatedAt = e.block.timestamp;
  if (p.depositCount == 0 && p.withdrawCount == 0) {
    v.uniqueDepositors = v.uniqueDepositors + 1;
  }
  p.shares = p.shares.plus(e.params.shares);
  p.depositCount = p.depositCount + 1;
  p.totalDepositedQuote = p.totalDepositedQuote.plus(e.params.quoteAmount);
  p.totalDepositedBase = p.totalDepositedBase.plus(e.params.baseAmount);
  p.lastDepositAt = e.block.timestamp;
  p.updatedAt = e.block.timestamp;

  v.save();
  p.save();
}

export function handleWithdraw(e: WithdrawEvent): void {
  const vaultId = e.params.vault.toHexString();
  const v = Vault.load(vaultId);
  if (v == null) return;

  const acct = getOrCreateAccount(e.params.sender);
  const p = getOrCreatePosition(vaultId, e.params.sender, e.block.timestamp);

  const w = new Withdrawal(
    e.transaction.hash.toHexString() + "-" + e.logIndex.toString()
  );
  w.vault = vaultId;
  w.account = acct.id;
  w.shares = e.params.shares;
  w.amountQuote = e.params.quoteAmount;
  w.amountBase = e.params.baseAmount;
  w.txHash = e.transaction.hash;
  w.timestamp = e.block.timestamp;
  w.blockNumber = e.block.number;
  w.save();
  
  v.quoteBalance = v.quoteBalance.minus(e.params.quoteAmount);
  v.baseBalance = v.baseBalance.minus(e.params.baseAmount);
  v.totalShares = v.totalShares.minus(e.params.shares);
  v.withdrawalCount = v.withdrawalCount + 1;
  v.lastUpdatedAt = e.block.timestamp;

  p.shares = p.shares.minus(e.params.shares);
  p.withdrawCount = p.withdrawCount + 1;
  p.totalWithdrawnQuote = p.totalWithdrawnQuote.plus(e.params.quoteAmount);
  p.totalWithdrawnBase = p.totalWithdrawnBase.plus(e.params.baseAmount);
  p.lastWithdrawAt = e.block.timestamp;
  p.updatedAt = e.block.timestamp;

  v.save();
  p.save();
}

export function handleLocked(e: LockedEvent): void {
  const v = Vault.load(e.params.vault.toHexString());
  if (v == null) return;
  v.locked = true;
  v.lastUpdatedAt = e.block.timestamp;
  v.save();
}

export function handleUnlocked(e: UnlockedEvent): void {
  const v = Vault.load(e.params.vault.toHexString());
  if (v == null) return;
  v.locked = false;
  v.lastUpdatedAt = e.block.timestamp;
  v.save();
}

export function handleClosed(e: ClosedEvent): void {
  const v = Vault.load(e.params.vault.toHexString());
  if (v == null) return;
  v.closed = true;
  v.locked = true;
  v.lastUpdatedAt = e.block.timestamp;
  v.save();
}
