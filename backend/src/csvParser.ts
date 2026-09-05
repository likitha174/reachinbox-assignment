import { parse } from "csv-parse/sync";

export interface CsvRecipient {
  recipient: string;
}

export function parseRecipients(csvText: string): CsvRecipient[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  return records
    .map((row) => ({
      recipient:
        row.recipient ||
        row.email ||
        row.Email ||
        row.EMAIL ||
        "",
    }))
    .filter((row) => row.recipient);
}