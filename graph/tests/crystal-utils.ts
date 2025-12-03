import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { OrderFilled, OrdersUpdated } from "../generated/MONUSDC/Market"

export function createOrderFilledEvent(
  caller: Address,
  amounts: BigInt,
  info: BigInt,
  filled: Bytes
): OrderFilled {
  let orderFilledEvent = changetype<OrderFilled>(newMockEvent())

  orderFilledEvent.parameters = new Array()

  orderFilledEvent.parameters.push(
    new ethereum.EventParam("caller", ethereum.Value.fromAddress(caller))
  )
  orderFilledEvent.parameters.push(
    new ethereum.EventParam(
      "amounts",
      ethereum.Value.fromUnsignedBigInt(amounts)
    )
  )
  orderFilledEvent.parameters.push(
    new ethereum.EventParam("info", ethereum.Value.fromUnsignedBigInt(info))
  )
  orderFilledEvent.parameters.push(
    new ethereum.EventParam("filled", ethereum.Value.fromBytes(filled))
  )

  return orderFilledEvent
}

export function createOrdersUpdatedEvent(
  caller: Address,
  timestamp: BigInt,
  orderData: Bytes
): OrdersUpdated {
  let ordersUpdatedEvent = changetype<OrdersUpdated>(newMockEvent())

  ordersUpdatedEvent.parameters = new Array()

  ordersUpdatedEvent.parameters.push(
    new ethereum.EventParam("caller", ethereum.Value.fromAddress(caller))
  )
  ordersUpdatedEvent.parameters.push(
    new ethereum.EventParam(
      "timestamp",
      ethereum.Value.fromUnsignedBigInt(timestamp)
    )
  )
  ordersUpdatedEvent.parameters.push(
    new ethereum.EventParam("orderData", ethereum.Value.fromBytes(orderData))
  )

  return ordersUpdatedEvent
}
