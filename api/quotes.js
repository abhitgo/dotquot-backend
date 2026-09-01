// DotQuot quotes API
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseIds = [
    process.env.AIRTABLE_BASE_ID,
    process.env.AIRTABLE_BASE_ID_2
  ].filter(Boolean);
  const tableName = process.env.AIRTABLE_QUOTES_TABLE || "Quotes";

  if (!token || baseIds.length === 0) {
    return res.status(500).json({
      error: "Missing Airtable environment variables"
    });
  }

  try {
    const fetchBaseRecords = async (baseId) => {
      const records = [];
      let offset = "";

      do {
        const params = new URLSearchParams({
          filterByFormula: "{Is Published}=TRUE()",
          pageSize: "100"
        });
        params.append("sort[0][field]", "Sort Order");
        params.append("sort[0][direction]", "asc");

        if (offset) {
          params.append("offset", offset);
        }

        const airtableUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
          tableName
        )}?${params.toString()}`;

        const response = await fetch(airtableUrl, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Airtable request failed for ${baseId}: ${response.status}`);
        }

        const data = await response.json();
        records.push(...data.records);
        offset = data.offset || "";
      } while (offset);

      return records;
    };

    const results = await Promise.allSettled(baseIds.map(fetchBaseRecords));
    const successfulResults = results.filter(
      (result) => result.status === "fulfilled"
    );

    if (successfulResults.length === 0) {
      throw new Error("All Airtable catalogue requests failed");
    }

    const records = successfulResults.flatMap((result) => result.value);

    const quotes = records.map((record) => {
      const fields = record.fields || {};

      return {
        id: record.id,
        text: fields["Quote Text"] || "",
        author: fields["Author"] || "DotQuot",
        category: fields["Category"] || "",
        isFeatured: fields["Is Featured"] || false,
        sortOrder: fields["Sort Order"] || 0,
        relatedBookId:
          Array.isArray(fields["Related Book"]) && fields["Related Book"].length > 0
            ? fields["Related Book"][0]
            : null,
        createdDate: fields["Created Date"] || null
      };
    }).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }

      return (a.createdDate || "").localeCompare(b.createdDate || "");
    }).filter((quote) => quote.text.trim().length > 0);

    const seenQuoteTexts = new Set();
    const uniqueQuotes = quotes.filter((quote) => {
      const normalizedText = quote.text
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

      if (seenQuoteTexts.has(normalizedText)) {
        return false;
      }

      seenQuoteTexts.add(normalizedText);
      return true;
    });

    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader(
      "Vercel-CDN-Cache-Control",
      "public, max-age=259200, stale-while-revalidate=604800, stale-if-error=604800"
    );

    return res.status(200).json({
      success: true,
      count: uniqueQuotes.length,
      quotes: uniqueQuotes
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}
