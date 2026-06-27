export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_QUOTES_TABLE || "Quotes";

  if (!token || !baseId) {
    return res.status(500).json({
      error: "Missing Airtable environment variables"
    });
  }

  try {
    const records = [];
    let offset = "";

    do {
      const params = new URLSearchParams({
        view: "Published Quotes",
        pageSize: "100"
      });

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
        const errorText = await response.text();
        return res.status(response.status).json({
          error: "Airtable request failed",
          details: errorText
        });
      }

      const data = await response.json();

      records.push(...data.records);
      offset = data.offset;
    } while (offset);

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
    });

    return res.status(200).json({
      success: true,
      count: quotes.length,
      quotes
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}
