"use client";

import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Watchlist } from "@/components/Watchlist";
import { connect } from "@/store/terminal";

export default function Page() {
  useEffect(connect, []);
  return (
    <main className="min-h-screen bg-bg">
      <Header />
      <section className="max-w-md">
        <h2 className="border-b border-border px-3 py-2 text-xs uppercase tracking-widest text-muted">Watchlist</h2>
        <Watchlist />
      </section>
    </main>
  );
}
