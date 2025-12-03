// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IERC20} from '../contracts/interfaces/IERC20.sol';
import {IWETH} from '../contracts/interfaces/IWETH.sol';
import {ICrystal} from '../contracts/interfaces/ICrystal.sol';
import {ICrystalVault} from '../contracts/interfaces/ICrystalVault.sol';
import {ICrystalVaultFactory} from '../contracts/interfaces/ICrystalVaultFactory.sol';
import {CrystalToken} from '../contracts/CrystalToken.sol';

contract CrystalReferralManager {
    struct VaultReturnInfo {
        uint256 quoteBalance;
        uint256 baseBalance;
        uint256 quoteDecimals;
        uint256 baseDecimals;
        address quoteAsset;
        address baseAsset;
        address owner;
        uint256 totalShares;
        uint256 maxShares;
        uint40 lockup;
        bool decreaseOnWithdraw;
        bool locked;
        bool closed;
        ICrystalVault.VaultMetaData metadata;
    }

    struct VaultReturnData {
        uint256 quoteBalance;
        uint256 baseBalance;
        uint256 quoteDecimals;
        uint256 baseDecimals;
        uint256 userBalance;
        uint256 totalShares;
    }

    mapping(string => address) public refCodeToAddress;
    mapping(address => string) public addressToRefCode;
    mapping(address => uint256) public referrerToReferredAddressCount;
    mapping(address => address) public addressToReferrer;
   
    address public gov;

    event Referral(address indexed referrer, address referee);
    event MarketChange(address indexed market, bool isAdd);

    error RefCodeAlreadyTaken();

    constructor(address _gov) {
        gov = _gov;
    }

    function changeMarket(address market, bool isAdd) external {
        require(msg.sender == gov);
        emit MarketChange(market, isAdd);
    }

    function changeGov(address newGov) external {
        require(msg.sender == gov);
        gov = newGov;
    }

    function changeRef(address user, string memory code) external {
        require(msg.sender == gov);
        bytes memory codeBytes = bytes(code);
        for (uint i = 0; i < codeBytes.length; i++) {
            if (codeBytes[i] >= 0x41 && codeBytes[i] <= 0x5A) {
                codeBytes[i] = bytes1(uint8(codeBytes[i]) + 32);
            }
        }
        code = string(codeBytes);
        if (refCodeToAddress[code] != address(0) || bytes(code).length == 0) {
            revert RefCodeAlreadyTaken();
        }
        if (bytes(addressToRefCode[user]).length != 0) {
            refCodeToAddress[addressToRefCode[user]] = address(0);
        }
        addressToRefCode[user] = code;
        refCodeToAddress[code] = user;
    }

    function changeUsedRef(address user, string memory code) external {
        require(msg.sender == gov);
        bytes memory codeBytes = bytes(code);
        for (uint i = 0; i < codeBytes.length; i++) {
            if (codeBytes[i] >= 0x41 && codeBytes[i] <= 0x5A) {
                codeBytes[i] = bytes1(uint8(codeBytes[i]) + 32);
            }
        }
        code = string(codeBytes);
        if (addressToReferrer[user] != address(0)) {
            referrerToReferredAddressCount[addressToReferrer[user]] -= 1;
        }
        address referrer = refCodeToAddress[code];
        addressToReferrer[user] = referrer;
        emit Referral(referrer, user);
        if (referrer != address(0) && bytes(code).length != 0) {
            ++referrerToReferredAddressCount[referrer];
        }
    }
    // referral manager
    function getRefInfo(address user) external view returns (address referrer, string memory usedRefCode, string memory refCode) {
        referrer = addressToReferrer[user];
        usedRefCode = addressToRefCode[referrer];
        refCode = addressToRefCode[user];
    }

    function setReferral(string memory code) external {
        bytes memory codeBytes = bytes(code);
        for (uint i = 0; i < codeBytes.length; i++) {
            if (codeBytes[i] >= 0x41 && codeBytes[i] <= 0x5A) {
                codeBytes[i] = bytes1(uint8(codeBytes[i]) + 32);
            }
        }
        code = string(codeBytes);
        if (refCodeToAddress[code] != address(0) || bytes(code).length == 0) {
            revert RefCodeAlreadyTaken();
        }
        if (bytes(addressToRefCode[msg.sender]).length != 0) {
            refCodeToAddress[addressToRefCode[msg.sender]] = address(0);
        }
        addressToRefCode[msg.sender] = code;
        refCodeToAddress[code] = msg.sender;
    }

    function setUsedRef(string memory code) external {
        bytes memory codeBytes = bytes(code);
        for (uint i = 0; i < codeBytes.length; i++) {
            if (codeBytes[i] >= 0x41 && codeBytes[i] <= 0x5A) {
                codeBytes[i] = bytes1(uint8(codeBytes[i]) + 32);
            }
        }
        code = string(codeBytes);
        if (addressToReferrer[msg.sender] != address(0)) {
            referrerToReferredAddressCount[addressToReferrer[msg.sender]] -= 1;
        }
        address referrer = refCodeToAddress[code];
        addressToReferrer[msg.sender] = referrer;
        emit Referral(referrer, msg.sender);
        if (referrer != address(0) && bytes(code).length != 0) {
            ++referrerToReferredAddressCount[referrer];
        }
    }
    // data helper
    function balanceOf(address account, address token) public view returns (uint256 balance) {
        if (token == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            balance = account.balance;
            return balance;
        }
        else {
            try IERC20(token).balanceOf(account) returns (uint256 _balance) {
                balance = _balance;
            } catch {
                balance = 0;
            }
            return balance;
        }
    }

    function getPrice(address crystal, address market) public returns (uint256 price, uint256 _highestBid, uint256 _lowestAsk) {
        return ICrystal(crystal).getPrice(market);
    }

    function batchBalanceOf(address account, address[] calldata tokens) public view returns (uint256[] memory returnData) {
        returnData = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            returnData[i] = balanceOf(account, tokens[i]);
        }
        return returnData;
    }

    function batchBatchBalanceOf(address[] calldata account, address[][] calldata tokens) external view returns (uint256[][] memory returnData) {
        returnData = new uint256[][](account.length);
        for (uint256 i = 0; i < account.length; i++) {
            returnData[i] = batchBalanceOf(account[i], tokens[i]);
        }
        return returnData;
    }

    function getPrices(address crystal, address[] calldata markets) external returns (uint256[] memory quoteReserves, uint256[] memory baseReserves, uint256[] memory mids, uint256[] memory highestBids, uint256[] memory lowestAsks) {
        quoteReserves = new uint256[](markets.length);
        baseReserves = new uint256[](markets.length);
        mids = new uint256[](markets.length);
        highestBids = new uint256[](markets.length);
        lowestAsks = new uint256[](markets.length);
        for (uint256 i = 0; i < markets.length; ++i) {
            try ICrystal(crystal).getReserves(markets[i]) returns (
                uint112 quoteReserve,
                uint112 baseReserve
            ) {
                quoteReserves[i] = quoteReserve;
                baseReserves[i] = baseReserve;
            } catch {
                quoteReserves[i] = 0;
                baseReserves[i] = 0;
            }
            try ICrystal(crystal).getPrice(markets[i]) returns (
                uint256 mid,
                uint256 bid,
                uint256 ask
            ) {
                mids[i] = mid;
                highestBids[i] = bid;
                lowestAsks[i] = ask;
            } catch {
                mids[i] = 0;
                highestBids[i] = 0;
                lowestAsks[i] = 0;
            }
        }  
    }

    function getClaimableRewards(address crystal, address user, address[] calldata tokens) external view returns (uint256[] memory amounts) {
        amounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; ++i) {
            amounts[i] = ICrystal(crystal).claimableRewards(user, tokens[i]);
        } 
    }

    function getVaultsInfo(address vaultFactory, address[] calldata vaults) external view returns (VaultReturnInfo[] memory vaultsreturn) {
        vaultsreturn = new VaultReturnInfo[](vaults.length);
        for (uint256 i = 0; i < vaults.length; ++i) {
            (
                address q,
                address b,
                address o,
                uint256 ts,
                uint256 ms,
                uint40 l,
                bool d,
                bool L,
                bool c,
                ICrystalVault.VaultMetaData memory m
            ) = ICrystalVaultFactory(vaultFactory).getVault(vaults[i]);

            VaultReturnInfo memory r;
            r.quoteAsset = q;
            r.baseAsset = b;
            r.owner = o;
            r.totalShares = ts;
            r.maxShares = ms;
            r.lockup = l;
            r.decreaseOnWithdraw = d;
            r.locked = L;
            r.closed = c;
            r.metadata = m;
            o = vaults[i];
            try IERC20(q).decimals() returns (
                uint8 decimals
            ) {
                r.quoteDecimals = decimals;
            } catch {
                r.quoteDecimals = 18;
            }
            try IERC20(b).decimals() returns (
                uint8 decimals
            ) {
                r.baseDecimals = decimals;
            } catch {
                r.baseDecimals = 18;
            }
            (r.quoteBalance, , ) = ICrystal(ICrystalVaultFactory(vaultFactory).crystal()).getDepositedBalance(o, q);
            (r.baseBalance, , ) = ICrystal(ICrystalVaultFactory(vaultFactory).crystal()).getDepositedBalance(o, b);

            vaultsreturn[i] = r;
        }
    }

    function getVaultsData(address vaultFactory, address user, address[] calldata vaults) external view returns (VaultReturnData[] memory vaultsreturn) {
        vaultsreturn = new VaultReturnData[](vaults.length);
        for (uint256 i = 0; i < vaults.length; ++i) {
            (
                address q,
                address b,,
                uint256 ts,,,,,,
            ) = ICrystalVaultFactory(vaultFactory).getVault(vaults[i]);

            VaultReturnData memory r;
            r.totalShares = ts;
            try IERC20(q).decimals() returns (
                uint8 decimals
            ) {
                r.quoteDecimals = decimals;
            } catch {
                r.quoteDecimals = 18;
            }
            try IERC20(b).decimals() returns (
                uint8 decimals
            ) {
                r.baseDecimals = decimals;
            } catch {
                r.baseDecimals = 18;
            }
            (r.quoteBalance, , ) = ICrystal(ICrystalVaultFactory(vaultFactory).crystal()).getDepositedBalance(vaults[i], q);
            (r.baseBalance, , ) = ICrystal(ICrystalVaultFactory(vaultFactory).crystal()).getDepositedBalance(vaults[i], b);
            r.userBalance = IERC20(vaults[i]).balanceOf(user);
            vaultsreturn[i] = r;
        }
    }

    function getMarketData(address crystal, address market, uint256 distance, uint256 interval, uint256 max) external returns (uint256 quoteReserve, uint256 baseReserve, uint256 highestBid, uint256 lowestAsk, bytes memory bids, bytes memory asks) {
        (quoteReserve, baseReserve) = ICrystal(crystal).getReserves(market);
        (highestBid, lowestAsk, bids, asks) = ICrystal(crystal).getPriceLevelsFromMid(market, distance, interval, max);
    }

    function getVirtualReserves(address crystal, address token, address weth, uint256 distance, uint256 interval, uint256 max) external returns (uint256 quoteReserve, uint256 baseReserve, uint256 highestBid, uint256 lowestAsk, bytes memory bids, bytes memory asks) {
        (quoteReserve, baseReserve) = ICrystal(crystal).getVirtualReserves(token);
        if (quoteReserve == 0) {
            address market = ICrystal(crystal).getMarketByTokens(token, weth);
            (quoteReserve, baseReserve) = ICrystal(crystal).getReserves(market);
            (highestBid, lowestAsk, bids, asks) = ICrystal(crystal).getPriceLevelsFromMid(market, distance, interval, max);
        }
    }
}