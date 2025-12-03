import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import { OrderFilled } from "../generated/schema"
import { OrderFilled as OrderFilledEvent } from "../generated/MONUSDC/Market"
import { handleOrderFilled } from "../src/crystal"
import { createOrderFilledEvent } from "./crystal-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let caller = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let amounts = BigInt.fromI32(234)
    let info = BigInt.fromI32(234)
    let filled = Bytes.fromI32(1234567890)
    let newOrderFilledEvent = createOrderFilledEvent(
      caller,
      amounts,
      info,
      filled
    )
    handleOrderFilled(newOrderFilledEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("OrderFilled created and stored", () => {
    assert.entityCount("OrderFilled", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "OrderFilled",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "caller",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "OrderFilled",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "amounts",
      "234"
    )
    assert.fieldEquals(
      "OrderFilled",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "info",
      "234"
    )
    assert.fieldEquals(
      "OrderFilled",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "filled",
      "1234567890"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })
})
