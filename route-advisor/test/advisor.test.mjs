import assert from "node:assert/strict";
import test from "node:test";
import { recommendRoute, validateQuoteSet } from "../src/advisor.mjs";

const now = Date.parse("2026-10-12T00:00:00.000Z");
const quoteSet = {
  objective: "balanced",
  operation: "transfer",
  asOf: new Date(now - 1_000).toISOString(),
  routes: [
    {
      id: "sui-route",
      network: "sui",
      provider: "test-quote-provider",
      feeUsd: 0.01,
      etaSeconds: 3,
      liquidityUsd: 100_000,
      expiresAt: new Date(now + 30_000).toISOString(),
    },
    {
      id: "ethereum-via-ethena",
      network: "ethereum",
      protocol: "Ethena",
      provider: "test-quote-provider",
      feeUsd: 2,
      etaSeconds: 60,
      liquidityUsd: 1_000_000,
      expiresAt: new Date(now + 30_000).toISOString(),
    },
  ],
};

test("rejects stale quote sets", () => {
  const stale = { ...quoteSet, asOf: new Date(now - 61_000).toISOString() };
  assert.throws(() => validateQuoteSet(stale, now), /older than 60 seconds/);
});

test("filters expired route quotes", () => {
  const quotes = {
    ...quoteSet,
    routes: quoteSet.routes.map((route) => ({
      ...route,
      expiresAt: new Date(now - 1).toISOString(),
    })),
  };
  assert.throws(() => validateQuoteSet(quotes, now), /All provider quotes have expired/);
});

test("rejects Ethena presented as a blockchain network", () => {
  const quotes = {
    ...quoteSet,
    routes: [{ ...quoteSet.routes[0], network: "ethena" }],
  };
  assert.throws(() => validateQuoteSet(quotes, now), /Unsupported network/);
});

test("returns only a route ID present in fresh quotes", async () => {
  const recommendation = await recommendRoute(quoteSet, {
    apiKey: "test-key",
    model: "test-model",
    clock: () => now,
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.messages[1].content.includes('"protocol":"Ethena"'), true);
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              selectedRouteId: "sui-route",
              rationale: "The supplied quote is faster and cheaper.",
              caveats: [],
            }),
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(recommendation.selectedRoute.id, "sui-route");
  assert.equal(recommendation.executed, false);
});

test("rejects AI-selected routes absent from the quote set", async () => {
  await assert.rejects(recommendRoute(quoteSet, {
    apiKey: "test-key",
    model: "test-model",
    clock: () => now,
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            selectedRouteId: "invented-route",
            rationale: "This route is made up.",
            caveats: [],
          }),
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  }), /not in the current provider quotes/);
});

test("rejects a recommendation if its quote expires while the AI is responding", async () => {
  let clockCalls = 0;
  await assert.rejects(recommendRoute(quoteSet, {
    apiKey: "test-key",
    model: "test-model",
    clock: () => (++clockCalls < 2 ? now : now + 31_000),
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            selectedRouteId: "sui-route",
            rationale: "The route was valid when evaluated.",
            caveats: [],
          }),
        },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  }), /All provider quotes have expired/);
});
