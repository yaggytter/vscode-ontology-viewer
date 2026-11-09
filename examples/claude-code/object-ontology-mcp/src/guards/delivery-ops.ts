import { num, type Checks } from "../guards.ts";

/** Preconditions of delivery-ops.oont.yaml, keyed by each validation's `expr`. */
export const checks: Checks = {
  "vehicle.status == 'available'": (c) => c.ref("vehicle").status === "available",

  "vehicle.loadKg + shipment.weightKg <= vehicle.capacityKg": (c) =>
    num(c.ref("vehicle").loadKg) + num(c.ref("shipment").weightKg) <= num(c.ref("vehicle").capacityKg),

  "vehicle.depot == shipment.originDepot": (c) => c.linked("vehicle", "depot")[0] === c.linked("shipment", "originDepot")[0],

  "shipment.status != 'delivered'": (c) => c.ref("shipment").status !== "delivered",

  "toVehicle.status == 'available' && toVehicle.loadKg + shipment.weightKg <= toVehicle.capacityKg": (c) =>
    c.ref("toVehicle").status === "available" &&
    num(c.ref("toVehicle").loadKg) + num(c.ref("shipment").weightKg) <= num(c.ref("toVehicle").capacityKg),

  "len(message) > 0 && len(message) <= 300": (c) => {
    const length = String(c.args.message ?? "").length;
    return length > 0 && length <= 300;
  },
};
