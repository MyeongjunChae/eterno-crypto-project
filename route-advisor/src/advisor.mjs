const SUPPORTED_NETWORKS = new Set(["sui", "ethereum", "solana"]);
const SUPPORTED_OBJECTIVES = new Set(["balanced", "lowest-fee", "fastest", "highest-liquidity"]);

export function validateQuoteSet(input, now = Date.now()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Quote input must be a JSON object.");
  }
  if (!SUPPORTED_OBJECTIVES.has(input.objective)) {
    throw new Error("objective must be balanced, lowest-fee, fastest, or highest-liquidity.");
  }
  if (typeof input.operation !== "string" || input.operation.length === 0) {
    throw new Error("operation must describe the exact action being quoted.");
  }
  if (!Array.isArray(input.routes) || input.routes.length === 0) {
    throw new Error("At least one provider-quoted route is required.");
  }

  const asOf = Date.parse(input.asOf);
  if (!Number.isFinite(asOf) || asOf > now || now - asOf > 60_000) {
    throw new Error("Quote set is invalid or older than 60 seconds; fetch fresh quotes.");
  }

  const ids = new Set();
  const routes = input.routes.filter((route) => {
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      throw new Error("Each route must be an object.");
    }
    if (typeof route.id !== "string" || route.id.length === 0 || ids.has(route.id)) {
      throw new Error("Route IDs must be non-empty and unique.");
    }
    ids.add(route.id);
    if (!SUPPORTED_NETWORKS.has(route.network)) {
      throw new Error(`Unsupported network: ${String(route.network)}.`);
    }
    if (route.protocol !== undefined && typeof route.protocol !== "string") {
      throw new Error(`Route ${route.id} has an invalid protocol.`);
    }
    if (typeof route.provider !== "string" || route.provider.length === 0) {
      throw new Error(`Route ${route.id} must identify its quote provider.`);
    }
    if (!Number.isFinite(route.feeUsd) || route.feeUsd < 0) {
      throw new Error(`Route ${route.id} must have a non-negative USD fee quote.`);
    }
    if (!Number.isFinite(route.etaSeconds) || route.etaSeconds <= 0) {
      throw new Error(`Route ${route.id} must have a positive completion-time estimate.`);
    }
    if (!Number.isFinite(route.liquidityUsd) || route.liquidityUsd < 0) {
      throw new Error(`Route ${route.id} must have a non-negative USD liquidity quote.`);
    }

    const expiresAt = Date.parse(route.expiresAt);
    if (!Number.isFinite(expiresAt)) {
      throw new Error(`Route ${route.id} must have an expiry timestamp.`);
    }
    return expiresAt > now;
  });

  if (routes.length === 0) {
    throw new Error("All provider quotes have expired; fetch fresh quotes.");
  }
  return { ...input, routes };
}

export async function recommendRoute(input, {
  apiKey = process.env.AI_API_KEY,
  baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  model = process.env.AI_MODEL,
  fetchImpl = fetch,
  clock = () => Date.now(),
} = {}) {
  if (!apiKey) throw new Error("Set AI_API_KEY in your local environment.");
  if (!model) throw new Error("Set AI_MODEL to the model name supported by your AI provider.");

  const quoteSet = validateQuoteSet(input, clock());
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "You are a constrained transaction-route advisor.",
            "Compare only the supplied, unexpired provider quotes and optimize for the supplied objective.",
            "Do not invent, modify, or extrapolate fees, liquidity, completion times, or route availability.",
            "Return one JSON object with selectedRouteId, rationale, and caveats.",
            "selectedRouteId must exactly match one supplied route ID.",
            "Ethena is a protocol/venue, not a blockchain network.",
            "This is advice only: never claim to have executed a transaction.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            objective: quoteSet.objective,
            operation: quoteSet.operation,
            routes: quoteSet.routes,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI provider returned HTTP ${response.status}.`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("AI provider response did not contain a chat completion.");
  }

  let decision;
  try {
    decision = JSON.parse(content);
  } catch {
    throw new Error("AI provider did not return valid JSON.");
  }
  const currentQuotes = validateQuoteSet(input, clock());
  const selectedRoute = currentQuotes.routes.find((route) => route.id === decision.selectedRouteId);
  if (!selectedRoute) {
    throw new Error("AI selected a route that is not in the current provider quotes.");
  }
  if (typeof decision.rationale !== "string" || decision.rationale.length === 0) {
    throw new Error("AI response must include a rationale.");
  }
  if (!Array.isArray(decision.caveats) || decision.caveats.some((item) => typeof item !== "string")) {
    throw new Error("AI response must include a caveats array of strings.");
  }

  return {
    objective: quoteSet.objective,
    operation: quoteSet.operation,
    selectedRoute,
    rationale: decision.rationale,
    caveats: decision.caveats,
    generatedAt: new Date(clock()).toISOString(),
    executed: false,
  };
}
