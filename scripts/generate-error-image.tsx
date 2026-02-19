/**
 * Generates the static error PNG for the OG board endpoint.
 * Run with: npx tsx scripts/generate-error-image.tsx
 *
 * Output: src/app/api/og/board/error.png
 */
import { ImageResponse } from "next/og";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const fontsDir = join(process.cwd(), "src/app/api/og/board/fonts");
  const [bold, regular] = await Promise.all([
    readFile(join(fontsDir, "Inter-Bold.woff")),
    readFile(join(fontsDir, "Inter-Regular.woff")),
  ]);

  const width = 800;
  const height = 480;
  const fg = "#000000";
  const bg = "#ffffff";

  const imageResponse = new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: bg,
        fontFamily: "Inter, sans-serif",
        padding: "24px",
        gap: "16px",
      }}
    >
      <svg width={48} height={48} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2L1 21h22L12 2z"
          stroke={fg}
          strokeWidth="2"
          strokeLinejoin="round"
          fill="none"
        />
        <path d="M12 9v5" stroke={fg} strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17.5" r="1" fill={fg} />
      </svg>
      <span
        style={{
          fontSize: "24px",
          fontWeight: 700,
          color: fg,
          letterSpacing: "0.08em",
        }}
      >
        ERROR
      </span>
      <span
        style={{
          fontSize: "16px",
          fontWeight: 400,
          color: fg,
          textAlign: "center",
        }}
      >
        Failed to load departure data
      </span>
    </div>,
    {
      width,
      height,
      fonts: [
        { name: "Inter", data: bold, style: "normal" as const, weight: 700 },
        {
          name: "Inter",
          data: regular,
          style: "normal" as const,
          weight: 400,
        },
      ],
    },
  );

  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  const outPath = join(process.cwd(), "src/app/api/og/board/error.png");
  await writeFile(outPath, buffer);
  console.log(`Written ${buffer.byteLength} bytes to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
