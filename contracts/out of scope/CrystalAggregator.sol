// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;
import "hardhat/console.sol";

import {IERC20} from '../contracts/interfaces/IERC20.sol';
import {IWETH} from '../contracts/interfaces/IWETH.sol';
import {ICrystal} from '../contracts/interfaces/ICrystal.sol';

contract CrystalAggregator {
    struct AggregatorAction {
        bool isRequireSuccess;
        uint256 action;
        address[] addresses;
        uint256[] params;
        uint256 flags;
        bytes data;
    }

    struct TriggerOrder {
        uint256 userId;
        uint256 executionPrice;
        bool isBuy;
        bool isExactInput;
        uint256 options;
        uint256 orderType;
        uint256 size;
        uint256 worstPrice;
        address referrer;
    }

    struct DCAOrder {
        uint256 userId;
        uint256 suborderCount;
        uint256 startTime;
        uint256 interval;
        uint256 currentSuborder;
        bool isBuy;
        bool isExactInput;
        uint256 options;
        uint256 totalSize;
        uint256 executedSize;
        address referrer;
    }

    event Trade(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    mapping(address => bool) public isKeeper;

    mapping(address => bool) public specialAddresses;
    mapping(bytes4 => bool) public specialSelectors;

    function aggregate(AggregatorAction[] calldata actions, uint256 deadline) external payable returns (uint256 amountIn, uint256 amountOut) {
        uint256 temp1;
        uint256 temp2;
        uint256 temp3;
        uint256 temp4;
        for (uint256 i; i < actions.length - 1; ++i) {
            if (actions[i].action == 0) { // arbitrary call, arbitrary call and add balance change to temp1, arbitrary call if balance is below, arbitrary call sub out offset for temp, transferfrom, transfer, transferbalance, transferfrommaxamount, takefeefrombalance, approve, require balance >=, require ratio of input/output <=, tip, tip % of output
                bytes memory ret = actions[i].data;
                bool result;
                (result, ret) = actions[i].addresses[0].call(ret);
                if (!result) {
                    revert ICrystal.ActionFailed();
                }
            }
        }
    }

    function buy(bool isExactInput, address token, uint256 amountIn, uint256 amountOut) external payable {
        
    }

    function placeLimitOrder(address market) external payable {

    }

    function placeCrystalLimitOrder(address market) external payable {

    }

    function placeTriggerOrder(address market) external payable {

    }

    function cancelTriggerOrder(address market) external {

    }

    function placeDCAOrder(address market) external {

    }

    function cancelDCAOrder(address market) external {
        
    }

    function executeTriggerOrders(uint256[] calldata orderids) external {

    }
}