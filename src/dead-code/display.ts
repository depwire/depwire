import chalk from "chalk";
import path from "node:path";
import type { DeadCodeReport, ConfidenceLevel, DeadSymbol } from "./types.js";

export function displayDeadCodeReport(
  report: DeadCodeReport,
  options: { verbose: boolean; stats: boolean; json: boolean },
  projectRoot: string
): void {
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(chalk.cyan.bold("\n🔍 Dead Code Analysis\n"));

  const { high, medium, low } = report.byConfidence;
  console.log(
    `Found ${chalk.yellow.bold(report.deadSymbols)} potentially dead symbols ` +
      `(${chalk.red(high)} high, ${chalk.yellow(medium)} medium, ${chalk.gray(low)} low confidence)\n`
  );

  const symbolsByConfidence = groupByConfidence(report.symbols);

  if (symbolsByConfidence.high.length > 0) {
    displayConfidenceGroup("HIGH", symbolsByConfidence.high, options.verbose, projectRoot);
  }

  if (symbolsByConfidence.medium.length > 0) {
    displayConfidenceGroup("MEDIUM", symbolsByConfidence.medium, options.verbose, projectRoot);
  }

  if (symbolsByConfidence.low.length > 0) {
    displayConfidenceGroup("LOW", symbolsByConfidence.low, options.verbose, projectRoot);
  }

  if (options.stats) {
    displayStats(report);
  }
}

function groupByConfidence(symbols: DeadSymbol[]): Record<ConfidenceLevel, DeadSymbol[]> {
  return symbols.reduce(
    (acc, symbol) => {
      acc[symbol.confidence].push(symbol);
      return acc;
    },
    { high: [], medium: [], low: [] } as Record<ConfidenceLevel, DeadSymbol[]>
  );
}

function displayConfidenceGroup(
  level: string,
  symbols: DeadSymbol[],
  verbose: boolean,
  projectRoot: string
): void {
  const emoji = level === "HIGH" ? "🔴" : level === "MEDIUM" ? "🟡" : "⚪";
  const color = level === "HIGH" ? chalk.red : level === "MEDIUM" ? chalk.yellow : chalk.gray;

  console.log(
    color.bold(`\n${emoji} ${level} CONFIDENCE `) +
      chalk.gray(`(${level === "HIGH" ? "definitely" : level === "MEDIUM" ? "probably" : "might be"} dead)`)
  );

  if (verbose) {
    // Verbose mode: show table with all columns including Reason
    const headers = ["Symbol", "Kind", "File", "Reason"];
    const rows = symbols.map((symbol) => {
      const relativePath = path.relative(projectRoot, symbol.file);
      return [
        chalk.bold(symbol.name),
        symbol.kind,
        `${relativePath}:${symbol.line}`,
        symbol.reason,
      ];
    });
    displayTable(headers, rows);
  } else {
    // Non-verbose mode: show simple list format
    symbols.forEach((symbol) => {
      const relativePath = path.relative(projectRoot, symbol.file);
      console.log(`  ${relativePath} :: ${symbol.name}`);
    });
  }
}

function displayTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) return;

  const columnWidths = headers.map((header, i) => {
    const maxRowWidth = Math.max(...rows.map((row) => stripAnsi(row[i]).length));
    return Math.max(header.length, maxRowWidth);
  });

  const separator = "┌" + columnWidths.map((w) => "─".repeat(w + 2)).join("┬") + "┐";
  const headerRow =
    "│ " +
    headers.map((h, i) => h.padEnd(columnWidths[i])).join(" │ ") +
    " │";
  const divider = "├" + columnWidths.map((w) => "─".repeat(w + 2)).join("┼") + "┤";
  const footer = "└" + columnWidths.map((w) => "─".repeat(w + 2)).join("┴") + "┘";

  console.log(separator);
  console.log(headerRow);
  console.log(divider);

  for (const row of rows) {
    const formattedRow =
      "│ " +
      row
        .map((cell, i) => {
          const stripped = stripAnsi(cell);
          const padding = columnWidths[i] - stripped.length;
          return cell + " ".repeat(padding);
        })
        .join(" │ ") +
      " │";
    console.log(formattedRow);
  }

  console.log(footer);
}

function displayStats(report: DeadCodeReport): void {
  console.log(chalk.cyan.bold("\n📊 Summary\n"));
  console.log(`  Total symbols analyzed: ${chalk.bold((report.totalSymbols ?? 0).toLocaleString())}`);
  console.log(`  Potentially dead: ${chalk.yellow.bold(report.deadSymbols ?? 0)} (${(report.deadPercentage ?? 0).toFixed(1)}%)`);
  console.log(
    `  By confidence: ${chalk.red(report.byConfidence?.high ?? 0)} high, ` +
      `${chalk.yellow(report.byConfidence?.medium ?? 0)} medium, ${chalk.gray(report.byConfidence?.low ?? 0)} low`
  );

  const estimatedLines = (report.deadSymbols ?? 0) * 18;
  console.log(`  Estimated dead code: ${chalk.gray(`~${estimatedLines.toLocaleString()} lines`)}\n`);
}

function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );
}
