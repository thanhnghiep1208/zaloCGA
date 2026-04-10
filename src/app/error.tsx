"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-red-50/50 rounded-2xl border border-red-100 mt-12 mx-auto max-w-lg">
      <h2 className="text-lg font-medium text-red-800">Something went wrong!</h2>
      <p className="text-sm text-red-600 mt-2">Failed to load the requested content.</p>
      <button
        onClick={() => reset()}
        className="mt-6 px-4 py-2 bg-red-100 text-red-800 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
