import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeAction } from "../src/actions.ts";
import { checks as deliveryChecks } from "../src/guards/delivery-ops.ts";
import { checks as supportChecks } from "../src/guards/support-desk.ts";
import { loadOntology } from "../src/ontology.ts";
import { describeObject, seedStore, type Store } from "../src/store.ts";

const delivery = loadOntology(new URL("../delivery/delivery-ops.oont.yaml", import.meta.url).pathname);
const support = loadOntology(new URL("../support/support-desk.oont.yaml", import.meta.url).pathname);
const MAY_12 = new Date("2026-05-12T10:30:00+09:00");
const MAY_10 = new Date("2026-05-10T12:00:00+09:00");

function runDelivery(store: Store, name: string, args: Record<string, unknown>) {
  return executeAction(delivery, deliveryChecks, "src/guards/delivery-ops.ts", store, name, args, MAY_12);
}

function runSupport(store: Store, name: string, args: Record<string, unknown>, now = MAY_10) {
  return executeAction(support, supportChecks, "src/guards/support-desk.ts", store, name, args, now);
}

describe("read model", () => {
  it("resolves links in both directions", () => {
    const store = seedStore(delivery);
    const shipment = describeObject(delivery, store, "Shipment", "S-5001");
    assert.deepEqual(shipment?.links, {
      customer: "C-01",
      originDepot: "D-01",
      vehicle: "V-101",
      stops: ["ST-01"],
    });
    const depot = describeObject(delivery, store, "Depot", "D-01");
    assert.deepEqual((depot?.links as Record<string, unknown>).vehicles, ["V-101", "V-102"]);
  });
});

describe("delivery-ops: the S-5001 scenario", () => {
  it("rejects V-201 with every precondition that fails, and changes nothing", () => {
    const store = seedStore(delivery);
    const outcome = runDelivery(store, "assignVehicle", { shipment: "S-5001", vehicle: "V-201" });
    assert.equal(outcome.applied, false);
    assert.match(outcome.text, /must be available/);
    assert.match(outcome.text, /remaining capacity/);
    assert.match(outcome.text, /origin depot/);
    assert.deepEqual(outcome.store.objects, store.objects);
    assert.equal(outcome.store.log.at(-1)?.outcome, "rejected");
  });

  it("assigns V-102, then notifies the customer", () => {
    let store = seedStore(delivery);
    const assigned = runDelivery(store, "assignVehicle", { shipment: "S-5001", vehicle: "V-102" });
    assert.equal(assigned.applied, true, assigned.text);
    store = assigned.store;
    assert.equal(store.objects.Shipment["S-5001"].vehicle, "V-102");
    assert.equal(store.objects.Shipment["S-5001"].status, "assigned");
    assert.deepEqual(store.outbox.map((o) => o.sideEffect), ["The vehicle's driver receives the updated route."]);

    const tooLong = runDelivery(store, "notifyCustomer", { shipment: "S-5001", message: "x".repeat(301) });
    assert.equal(tooLong.applied, false);
    assert.match(tooLong.text, /between 1 and 300 characters/);

    const notified = runDelivery(store, "notifyCustomer", { shipment: "S-5001", message: "Your delivery moved to another van." });
    assert.equal(notified.applied, true, notified.text);
    assert.equal(notified.store.objects.Shipment["S-5001"].customerNotified, true);
  });

  it("refuses to delete a link that does not exist", () => {
    const store = runDelivery(seedStore(delivery), "assignVehicle", { shipment: "S-5001", vehicle: "V-102" }).store;
    const outcome = runDelivery(store, "reassignShipment", { shipment: "S-5001", fromVehicle: "V-101", toVehicle: "V-102" });
    assert.equal(outcome.applied, false);
    assert.match(outcome.text, /not linked to V-101/);
  });

  it("checks arguments against the parameters", () => {
    const store = seedStore(delivery);
    const outcome = runDelivery(store, "markDelayed", { shipment: "S-9999", reason: "aliens", extra: 1 });
    assert.equal(outcome.applied, false);
    assert.match(outcome.text, /Unknown argument "extra"/);
    assert.match(outcome.text, /Missing required argument "newEta"/);
    assert.match(outcome.text, /"reason" must be one of/);
    assert.match(outcome.text, /There is no Shipment "S-9999"/);
  });

  it("fails closed when the ontology gains a precondition the server does not implement", () => {
    const action = delivery.actionTypes.get("assignVehicle")!;
    const extended = {
      ...delivery,
      actionTypes: new Map([
        ...delivery.actionTypes,
        ["assignVehicle", { ...action, validations: [...action.validations, { description: "The vehicle must be a cargo bike.", expr: "vehicle.kind == 'cargoBike'" }] }],
      ]),
    };
    const outcome = executeAction(extended, deliveryChecks, "src/guards/delivery-ops.ts", seedStore(delivery), "assignVehicle", { shipment: "S-5001", vehicle: "V-102" }, MAY_12);
    assert.equal(outcome.applied, false);
    assert.match(outcome.text, /must be a cargo bike/);
    assert.match(outcome.text, /Implement it in src\/guards\/delivery-ops\.ts/);
  });
});

describe("support-desk: refunds and approval", () => {
  it("sends TK-302 to approval and keeps the ticket open until a lead decides", () => {
    let store = seedStore(support);
    const direct = runSupport(store, "issueRefund", { refundId: "RF-102", ticket: "TK-302", order: "OR-7002", amountYen: 24800, reason: "damaged" });
    assert.equal(direct.applied, false);
    assert.deepEqual(direct.store.log.at(-1)?.details, ["The amount must be 10,000 JPY or less; larger refunds need requestRefundApproval."]);

    const requested = runSupport(store, "requestRefundApproval", { refundId: "RF-102", ticket: "TK-302", order: "OR-7002", amountYen: 24800, reason: "damaged" });
    assert.equal(requested.applied, true, requested.text);
    store = requested.store;
    assert.deepEqual(store.objects.Refund["RF-102"], { refundId: "RF-102", amountYen: 24800, reason: "damaged", status: "pendingApproval", order: "OR-7002", ticket: "TK-302" });

    const close = runSupport(store, "closeTicket", { ticket: "TK-302" });
    assert.equal(close.applied, false);
    assert.match(close.text, /waiting for approval/);

    const again = runSupport(store, "requestRefundApproval", { refundId: "RF-102", ticket: "TK-302", order: "OR-7002", amountYen: 100, reason: "damaged" });
    assert.match(again.text, /Refund RF-102 already exists/);
  });

  it("refunds TK-301 inside the 30-day window only", () => {
    const args = { refundId: "RF-101", ticket: "TK-301", order: "OR-7001", amountYen: 4800, reason: "damaged" };
    assert.equal(runSupport(seedStore(support), "issueRefund", args).applied, true);
    const late = runSupport(seedStore(support), "issueRefund", args, new Date("2026-07-01T12:00:00+09:00"));
    assert.equal(late.applied, false);
    assert.match(late.text, /within the last 30 days/);
  });
});
