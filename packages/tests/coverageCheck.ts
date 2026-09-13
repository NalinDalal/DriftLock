import { $ } from "bun";

const THRESHOLDS = {
    functions: 80,
    lines: 75,
};

async function checkCoverage() {
    const result = await $`bun test --coverage`.cwd(import.meta.dir).quiet();

    const output = result.stdout.toString() + result.stderr.toString();

    // Parse the "All files" line
    const allFilesMatch = output.match(
        /All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/,
    );

    if (!allFilesMatch) {
        console.error("Could not parse coverage output");
        console.error(output);
        process.exit(1);
    }

    const funcPct = parseFloat(allFilesMatch[1]);
    const linePct = parseFloat(allFilesMatch[2]);

    console.log(`\nCoverage Summary:`);
    console.log(`  Functions: ${funcPct}% (threshold: ${THRESHOLDS.functions}%)`);
    console.log(`  Lines:     ${linePct}% (threshold: ${THRESHOLDS.lines}%)`);

    // Print per-file breakdown
    const fileLines = output
        .split("\n")
        .filter((l) => l.includes("|") && !l.includes("---") && !l.includes("File"));
    for (const line of fileLines) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 3 && parts[0] !== "All files") {
            console.log(`  ${parts[0]}: funcs=${parts[1]}% lines=${parts[2]}%`);
        }
    }

    let failed = false;

    if (funcPct < THRESHOLDS.functions) {
        console.error(
            `\nFAIL: Function coverage ${funcPct}% is below threshold ${THRESHOLDS.functions}%`,
        );
        failed = true;
    }

    if (linePct < THRESHOLDS.lines) {
        console.error(
            `\nFAIL: Line coverage ${linePct}% is below threshold ${THRESHOLDS.lines}%`,
        );
        failed = true;
    }

    if (failed) {
        process.exit(1);
    }

    console.log(`\nPASS: All coverage thresholds met`);
}

checkCoverage();
