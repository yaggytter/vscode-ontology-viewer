import { daysSince, num, type Checks } from "../guards.ts";

/** Preconditions of support-desk.oont.yaml, keyed by each validation's `expr`. */
export const checks: Checks = {
  "amountYen <= order.totalYen - order.refundedYen": (c) =>
    num(c.args.amountYen) <= num(c.ref("order").totalYen) - num(c.ref("order").refundedYen),

  "daysSince(order.placedOn) <= 30": (c) => daysSince(c.ref("order").placedOn, c.now) <= 30,

  "amountYen <= 10000": (c) => num(c.args.amountYen) <= 10_000,

  "lead.role == 'lead'": (c) => c.ref("lead").role === "lead",

  "ticket.status != 'closed'": (c) => c.ref("ticket").status !== "closed",

  "none(ticket.refunds, r => r.status == 'pendingApproval')": (c) =>
    c.linkedObjects("ticket", "refunds").every((refund) => refund.status !== "pendingApproval"),
};
