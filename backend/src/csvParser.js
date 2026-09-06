import { parse } from "csv-parse/sync";
export function parseRecipients(csvText) {
    const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });
    return records
        .map((row) => ({
        recipient: row.recipient ||
            row.email ||
            row.Email ||
            row.EMAIL ||
            "",
    }))
        .filter((row) => row.recipient);
}
//# sourceMappingURL=csvParser.js.map