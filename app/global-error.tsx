"use client";

/* Last-resort boundary (the root layout itself failed): no app chrome. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en-IN">
      <body
        style={{
          fontFamily: "system-ui",
          background: "#0a0614",
          color: "#f4f1ff",
          textAlign: "center",
          padding: "4rem 1rem",
        }}
      >
        <h1>Something went wrong</h1>
        <p>Please try again in a moment.</p>
        {error.digest && (
          <p style={{ fontFamily: "monospace", fontSize: 12 }}>
            Reference: {error.digest}
          </p>
        )}
        <button
          onClick={() => retry()}
          style={{ marginTop: 16, padding: "8px 20px", borderRadius: 999 }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
