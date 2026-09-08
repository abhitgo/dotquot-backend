import assert from "node:assert/strict";
import test from "node:test";

import handler from "../api/quotes.js";

function makeResponse() {
  return {
    body: null,
    headers: {},
    statusCode: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("reuses the shared quote payload for seven days", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    AIRTABLE_TOKEN: process.env.AIRTABLE_TOKEN,
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID,
    AIRTABLE_BASE_ID_2: process.env.AIRTABLE_BASE_ID_2,
    AIRTABLE_QUOTES_TABLE: process.env.AIRTABLE_QUOTES_TABLE
  };

  t.after(() => {
    globalThis.fetch = originalFetch;

    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  process.env.AIRTABLE_TOKEN = "test-token";
  process.env.AIRTABLE_BASE_ID = "test-base-one";
  process.env.AIRTABLE_BASE_ID_2 = "test-base-two";
  process.env.AIRTABLE_QUOTES_TABLE = "Quotes";

  let airtableRequestCount = 0;
  globalThis.fetch = async (url) => {
    airtableRequestCount += 1;
    const baseName = String(url).includes("test-base-one") ? "one" : "two";

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          records: [
            {
              id: `record-${baseName}`,
              fields: {
                "Quote Text": `Quote from base ${baseName}`,
                "Is Published": true,
                "Sort Order": baseName === "one" ? 1 : 2
              }
            }
          ]
        };
      }
    };
  };

  const firstResponse = makeResponse();
  await handler({ method: "GET" }, firstResponse);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(firstResponse.body.count, 2);
  assert.equal(airtableRequestCount, 2);
  assert.match(firstResponse.headers["Cache-Control"], /max-age=604800/);
  assert.doesNotMatch(firstResponse.headers["Cache-Control"], /must-revalidate/);

  const secondResponse = makeResponse();
  await handler({ method: "GET" }, secondResponse);

  assert.equal(secondResponse.statusCode, 200);
  assert.deepEqual(secondResponse.body, firstResponse.body);
  assert.equal(airtableRequestCount, 2);
});
